jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { BadRequestException, ConflictException, HttpException } from "@nestjs/common";
import { ConversationEngine } from "./conversation.engine";
import { AiServiceError } from "./ai-client";
import type { EngineEvent } from "./conversation.types";
import { selectionsToSpec } from "./intent-router";

const CHAT = {
  id: "chat-1",
  userId: "user-1",
  characterId: "char-1",
  chatProfile: null,
  character: { id: "char-1", voiceId: null },
};
const ACTOR = { id: "user-1", subscription: "paid", contentMode: "nsfw", isAdult: true };

/** Поток модели из заданных событий; опционально падает после них. */
function llmStream(events: Record<string, unknown>[], failWith?: Error) {
  return async function* () {
    for (const e of events) yield e;
    if (failWith) throw failWith;
  };
}

async function drain(gen: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("ConversationEngine", () => {
  const tx = { tag: "tx" };
  let prisma: any;
  let chats: any;
  let demo: any;
  let locks: any;
  let llm: any;
  let stt: any;
  let context: any;
  let wallet: any;
  let intents: any;
  let media: any;
  let engine: ConversationEngine;

  beforeEach(() => {
    prisma = {
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    chats = {
      getChat: jest.fn().mockResolvedValue(CHAT),
      saveMessage: jest.fn(async (_c: string, role: string) => ({ id: role === "user" ? "u-1" : "a-1" })),
      createAiJob: jest.fn().mockResolvedValue({ id: "job-1" }),
      completeAiJob: jest.fn(),
      failAiJob: jest.fn().mockResolvedValue(undefined),
      logUsage: jest.fn(),
      recordVoiceJob: jest.fn(),
      getMessageHistory: jest.fn().mockResolvedValue([]),
      getMessage: jest.fn(),
      getMessagesAfter: jest.fn().mockResolvedValue([]),
      softDeleteMessages: jest.fn(),
      updateMessageContent: jest.fn(),
    };
    demo = { checkMessageLimit: jest.fn() };
    locks = {
      acquire: jest.fn().mockResolvedValue({ key: "chat:chat-1", token: "t" }),
      keepAlive: jest.fn().mockReturnValue(() => undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    llm = {
      streamChat: jest.fn(
        llmStream([{ content: "Привет" }, { content: "!" }, { done: true, usage: { totalTokens: 42 } }]),
      ),
    };
    stt = { transcribe: jest.fn().mockResolvedValue({ text: "голос", model: "whisper-1", durationSec: 3 }) };
    context = { build: jest.fn().mockResolvedValue({ messages: [], characterId: "char-1" }) };
    wallet = {
      reserveOperation: jest.fn(async (_u: string, op: { kind: string }) => ({ operationKey: `res-${op.kind}`, amount: 1 })),
      capture: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(false),
    };
    intents = { route: jest.fn().mockResolvedValue({ intent: "reply", via: "rules" }) };
    media = {
      quote: jest.fn().mockResolvedValue(5),
      needsConfirmation: jest.fn().mockResolvedValue(false),
      start: jest.fn().mockResolvedValue({ kind: "image", jobId: "job-img" }),
      createConfirmation: jest.fn().mockResolvedValue("tok-1"),
      attachConfirmationMessage: jest.fn(),
    };
    engine = new ConversationEngine(
      prisma,
      chats,
      demo,
      { capture: jest.fn() } as any,
      locks,
      context,
      llm,
      stt,
      wallet,
      intents,
      media,
    );
  });

  describe("handleUserText", () => {
    it("сохраняет сообщение, стримит ответ и атомарно фиксирует результат", async () => {
      const events = await drain(
        engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", clientMessageId: "c-1" }),
      );

      expect(chats.saveMessage).toHaveBeenNthCalledWith(1, "chat-1", "user", "hi", {
        source: "web",
        clientMessageId: "c-1",
        externalId: undefined,
      });
      expect(chats.saveMessage).toHaveBeenNthCalledWith(
        2,
        "chat-1",
        "assistant",
        "Привет!",
        expect.objectContaining({ replyToId: "u-1", status: "completed", source: "web" }),
        tx,
      );
      expect(chats.completeAiJob).toHaveBeenCalledWith("job-1", 42, tx);
      expect(chats.logUsage).toHaveBeenCalledWith("user-1", "chat_message", 42, tx);
      expect(events.filter((e) => e.type === "llm")).toHaveLength(3);
      expect(events[events.length - 1]).toEqual({ type: "done", messageId: "a-1", failed: false, error: undefined });
      expect(locks.release).toHaveBeenCalled();
    });

    it("повтор с тем же clientMessageId отдаёт сохранённый ответ без дубля и без вызова модели", async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce({ id: "u-1", deletedAt: null }) // сообщение пользователя
        .mockResolvedValueOnce({ id: "a-1", content: "Сохранённый ответ" }); // ответ на него

      const result = await ConversationEngine.collect(
        engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", clientMessageId: "c-1" }),
      );

      expect(result).toMatchObject({ content: "Сохранённый ответ", messageId: "a-1", replayed: true });
      expect(chats.saveMessage).not.toHaveBeenCalled();
      expect(llm.streamChat).not.toHaveBeenCalled();
      expect(demo.checkMessageLimit).not.toHaveBeenCalled();
    });

    it("повтор, когда ответа ещё нет, догенерирует ответ без нового сообщения пользователя", async () => {
      prisma.message.findFirst.mockResolvedValueOnce({ id: "u-1", deletedAt: null }).mockResolvedValueOnce(null);

      await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", clientMessageId: "c-1" }));

      expect(chats.saveMessage).toHaveBeenCalledTimes(1);
      expect(chats.saveMessage).toHaveBeenCalledWith(
        "chat-1",
        "assistant",
        "Привет!",
        expect.objectContaining({ replyToId: "u-1" }),
        tx,
      );
    });

    it("занятый диалог → 409 CHAT_BUSY, ничего не сохраняется", async () => {
      locks.acquire.mockResolvedValue(null);

      await expect(drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(chats.saveMessage).not.toHaveBeenCalled();
    });

    it("ошибка AI-сервиса до стрима пробрасывается, AiJob помечается failed, лок освобождается", async () => {
      llm.streamChat.mockImplementation(llmStream([], new AiServiceError(402, { error: "INSUFFICIENT_BALANCE" })));

      await expect(drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }))).rejects.toBeInstanceOf(
        AiServiceError,
      );
      expect(chats.failAiJob).toHaveBeenCalledWith("job-1", "INSUFFICIENT_BALANCE");
      expect(chats.completeAiJob).not.toHaveBeenCalled();
      expect(locks.release).toHaveBeenCalled();
    });

    it("обрыв клиентом сохраняет частичный ответ со статусом failed", async () => {
      const abort = new AbortController();
      const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
      llm.streamChat.mockImplementation(llmStream([{ content: "Нача" }], abortError));
      abort.abort();

      const result = await ConversationEngine.collect(
        engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", signal: abort.signal }),
      );

      expect(chats.saveMessage).toHaveBeenLastCalledWith(
        "chat-1",
        "assistant",
        "Нача",
        expect.objectContaining({ status: "failed" }),
        tx,
      );
      expect(result).toMatchObject({ failed: true, error: "client_aborted" });
    });

    it("ошибка модели внутри стрима без текста → AiJob failed, ответ не сохраняется", async () => {
      llm.streamChat.mockImplementation(llmStream([{ error: "provider down" }]));

      const result = await ConversationEngine.collect(
        engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }),
      );

      expect(chats.saveMessage).toHaveBeenCalledTimes(1); // только сообщение пользователя
      expect(chats.failAiJob).toHaveBeenCalledWith("job-1", "provider down", tx);
      expect(result).toMatchObject({ failed: true, error: "provider down" });
    });

    it("enforceLimits=false пропускает проверку лимитов", async () => {
      await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", enforceLimits: false }));
      expect(demo.checkMessageLimit).not.toHaveBeenCalled();
    });
  });

  describe("handleUserVoice", () => {
    it("распознаёт речь, сохраняет audio-сообщение и первым событием отдаёт транскрипцию", async () => {
      const events = await drain(
        engine.handleUserVoice({
          chatId: "chat-1",
          actor: ACTOR,
          audio: { buffer: Buffer.from("x"), mimetype: "audio/webm" },
        }),
      );

      expect(events[0]).toEqual({ type: "transcription", text: "голос" });
      expect(chats.saveMessage).toHaveBeenNthCalledWith(1, "chat-1", "user", "голос", expect.objectContaining({ type: "audio" }));
      expect(chats.recordVoiceJob).toHaveBeenCalledWith("user-1", "stt", "whisper-1", 3, { chatSessionId: "chat-1" });
    });

    it("пустая транскрипция → 400", async () => {
      stt.transcribe.mockResolvedValue({ text: "" });
      await expect(
        drain(engine.handleUserVoice({ chatId: "chat-1", actor: ACTOR, audio: { buffer: Buffer.from("x"), mimetype: "audio/webm" } })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("greet", () => {
    it("не приветствует непустой чат", async () => {
      chats.getMessageHistory.mockResolvedValue([{ role: "user", content: "hi" }]);
      const events = await drain(engine.greet({ chatId: "chat-1", actor: ACTOR, lang: "ru" }));
      expect(events).toEqual([{ type: "done" }]);
      expect(llm.streamChat).not.toHaveBeenCalled();
    });

    it("в пустом чате отправляет скрытый kickoff и сохраняет только ответ", async () => {
      await drain(engine.greet({ chatId: "chat-1", actor: ACTOR, lang: "ru" }));
      expect(context.build).toHaveBeenCalledWith(CHAT, ACTOR, {
        messages: [{ role: "user", content: expect.stringContaining("Поздоровайся") }],
      });
      expect(chats.saveMessage).toHaveBeenCalledTimes(1);
      expect(chats.logUsage).toHaveBeenCalledWith("user-1", "chat_greeting", 42, tx);
    });
  });

  describe("regenerate", () => {
    it("перегенерировать можно только текстовый ответ ассистента", async () => {
      chats.getMessage.mockResolvedValue({ id: "u-1", role: "user", type: "text" });
      await expect(
        drain(engine.regenerate({ chatId: "chat-1", actor: ACTOR, messageId: "u-1" })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(chats.softDeleteMessages).not.toHaveBeenCalled();
    });

    it("удаляет ответ и последующие сообщения, отвечает на то же сообщение пользователя", async () => {
      chats.getMessage.mockResolvedValue({ id: "a-0", role: "assistant", type: "text", replyToId: "u-1" });
      chats.getMessagesAfter.mockResolvedValue([{ id: "x-1" }]);

      await drain(engine.regenerate({ chatId: "chat-1", actor: ACTOR, messageId: "a-0" }));

      expect(chats.softDeleteMessages).toHaveBeenCalledWith(["a-0", "x-1"]);
      expect(chats.saveMessage).toHaveBeenCalledWith(
        "chat-1",
        "assistant",
        "Привет!",
        expect.objectContaining({ replyToId: "u-1" }),
        tx,
      );
    });
  });

  describe("биллинг", () => {
    it("резерв до сообщения, списание в транзакции ответа", async () => {
      await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }));

      expect(wallet.reserveOperation).toHaveBeenCalledWith("user-1", { kind: "chat_message" }, expect.stringMatching(/^chat_message:/));
      expect(wallet.reserveOperation.mock.invocationCallOrder[0]).toBeLessThan(chats.saveMessage.mock.invocationCallOrder[0]);
      expect(wallet.capture).toHaveBeenCalledWith("res-chat_message", undefined, tx);
    });

    it("нет кредитов → 402, сообщение не сохраняется, модель не вызывается", async () => {
      wallet.reserveOperation.mockRejectedValue(new HttpException({ error: "INSUFFICIENT_CREDITS" }, 402));

      await expect(drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }))).rejects.toBeInstanceOf(
        HttpException,
      );
      expect(chats.saveMessage).not.toHaveBeenCalled();
      expect(llm.streamChat).not.toHaveBeenCalled();
      expect(locks.release).toHaveBeenCalled();
    });

    it("ответа нет (ошибка AI-сервиса) → резерв возвращается, не списывается", async () => {
      llm.streamChat.mockImplementation(llmStream([], new AiServiceError(502, { error: "down" })));

      await expect(drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi" }))).rejects.toBeInstanceOf(
        AiServiceError,
      );
      expect(wallet.capture).not.toHaveBeenCalled();
      expect(wallet.release).toHaveBeenCalledWith("res-chat_message", "not_completed");
    });

    it("голос: распознавание списывается после STT, ответ — с ответом", async () => {
      await drain(
        engine.handleUserVoice({ chatId: "chat-1", actor: ACTOR, audio: { buffer: Buffer.from("x"), mimetype: "audio/webm" } }),
      );
      expect(wallet.capture).toHaveBeenCalledWith("res-stt");
      expect(wallet.capture).toHaveBeenCalledWith("res-chat_message", undefined, tx);
    });

    it("повтор с сохранённым ответом ничего не резервирует", async () => {
      prisma.message.findFirst
        .mockResolvedValueOnce({ id: "u-1", deletedAt: null })
        .mockResolvedValueOnce({ id: "a-1", content: "ok" });
      await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "hi", clientMessageId: "c-1" }));
      expect(wallet.reserveOperation).not.toHaveBeenCalled();
    });

    it("billable=false (служебные вызовы) не трогает кошелёк", async () => {
      await drain(engine.respond({ chatId: "chat-1", actor: ACTOR, billable: false, enforceLimits: false }));
      expect(wallet.reserveOperation).not.toHaveBeenCalled();
      expect(wallet.capture).not.toHaveBeenCalled();
    });
  });

  describe("фото и видео по просьбе (роутер намерений)", () => {
    const selections = { outfits: ["bikini"], poses: [], locations: ["beach"], facialExpressions: [], framing: [] };

    it("просьба о фото: генерация в диалоге + ответ персонажа с пометкой", async () => {
      intents.route.mockResolvedValue({ intent: "image", selections, via: "llm" });

      const events = await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "пришли фото" }));

      const expectedSpec = selectionsToSpec("image", selections, "char-1", "nsfw");
      expect(media.start).toHaveBeenCalledWith("chat-1", ACTOR, expectedSpec, { caption: "photo", source: "web" });
      expect(events).toContainEqual({ type: "media", status: "pending", kind: "image", jobId: "job-img" });
      expect(context.build).toHaveBeenCalledWith(CHAT, ACTOR, { lastUserNote: expect.stringContaining("receives your photo") });
      expect(llm.streamChat).toHaveBeenCalled();
    });

    it("дорогое медиа: предложение с ценой вместо генерации, модель не вызывается", async () => {
      intents.route.mockResolvedValue({ intent: "video", selections, via: "llm" });
      media.quote.mockResolvedValue(30);
      media.needsConfirmation.mockResolvedValue(true);

      const events = await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "скинь видео" }));

      expect(media.start).not.toHaveBeenCalled();
      expect(llm.streamChat).not.toHaveBeenCalled();
      expect(chats.saveMessage).toHaveBeenLastCalledWith("chat-1", "assistant", "Это видео будет стоить 30 кредитов. Отправить?", {
        source: "web",
        replyToId: "u-1",
        metadata: { mediaConfirm: { token: "tok-1", kind: "video", price: 30, status: "pending" } },
      });
      expect(events).toContainEqual({ type: "media", status: "confirm", kind: "video", token: "tok-1", price: 30 });
      expect(media.attachConfirmationMessage).toHaveBeenCalledWith("tok-1", "a-1");
      // ответ модели не нужен — резерв под него возвращается
      expect(wallet.release).toHaveBeenCalledWith("res-chat_message", "not_completed");
    });

    it("нет кредитов на фото: событие rejected, но персонаж всё равно отвечает", async () => {
      intents.route.mockResolvedValue({ intent: "image", selections, via: "llm" });
      media.start.mockRejectedValue(new HttpException({ error: "INSUFFICIENT_CREDITS", required: 5, available: 0 }, 402));

      const events = await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "пришли фото" }));

      expect(events).toContainEqual({
        type: "media",
        status: "rejected",
        kind: "image",
        error: { error: "INSUFFICIENT_CREDITS", required: 5, available: 0 },
      });
      expect(llm.streamChat).toHaveBeenCalled();
    });

    it("неясная просьба: уточняющий вопрос без вызова модели", async () => {
      intents.route.mockResolvedValue({ intent: "clarify", question: "Селфи или в полный рост?", via: "llm" });

      const result = await ConversationEngine.collect(
        engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "покажи себя" }),
      );

      expect(result.content).toBe("Селфи или в полный рост?");
      expect(llm.streamChat).not.toHaveBeenCalled();
      expect(media.start).not.toHaveBeenCalled();
    });

    it("routeIntents=false — роутер не вызывается", async () => {
      await drain(engine.handleUserText({ chatId: "chat-1", actor: ACTOR, content: "пришли фото", routeIntents: false }));
      expect(intents.route).not.toHaveBeenCalled();
    });
  });
});
