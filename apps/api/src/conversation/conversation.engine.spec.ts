jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { BadRequestException, ConflictException } from "@nestjs/common";
import { ConversationEngine } from "./conversation.engine";
import { AiServiceError } from "./ai-client";
import type { EngineEvent } from "./conversation.types";

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
    engine = new ConversationEngine(
      prisma,
      chats,
      demo,
      { capture: jest.fn() } as any,
      locks,
      context,
      llm,
      stt,
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
});
