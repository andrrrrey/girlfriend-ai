/**
 * @file conversation.engine.ts
 * @description Единое ядро обработки сообщений: через него идут сайт, Telegram,
 * системные вызовы (автопереписка) и будущие каналы.
 *
 * Гарантии ядра:
 * - Последовательность: внутри одного диалога одновременно выполняется одна
 *   операция (распределённый лок chat:{id}); вторая получает 409 CHAT_BUSY.
 * - Идемпотентность: повтор с тем же clientMessageId / externalId не создаёт
 *   дубль сообщения — отдаётся уже сохранённый ответ или ответ догенерируется.
 * - Атомарность: ответ ассистента, завершение AiJob, UsageLog и событие outbox
 *   записываются одной транзакцией.
 * - Обрыв: при отмене клиентом или ошибке модели частичный ответ сохраняется
 *   со статусом failed, AiJob помечается проваленным.
 * - Биллинг: перед вызовом модели резервируются кредиты (402 INSUFFICIENT_CREDITS,
 *   если не хватает); списание — в той же транзакции, что и ответ; если ответа
 *   нет — резерв возвращается.
 *
 * Каждая операция — async-генератор EngineEvent. Ошибки ДО первого события
 * (нет доступа, лимит, занятый диалог, ошибка AI-сервиса) выбрасываются как
 * исключения — адаптер канала может вернуть их обычным HTTP-ответом.
 */

import { BadRequestException, ConflictException, HttpException, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma.service";
import { ChatsService } from "../chats/chats.service";
import { DemoService } from "../demo/demo.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { RedisLockService } from "../common/redis-lock.service";
import { WalletService } from "../billing/wallet.service";
import type { BillableOperation } from "../billing/pricing";
import { AiServiceError } from "./ai-client";
import { ContextBuilder, ContextOptions } from "./context-builder";
import { LlmAdapter } from "./llm.adapter";
import { SttAdapter } from "./stt.adapter";
import { IntentRouter, selectionsToSpec } from "./intent-router";
import { cleanAssistantReply } from "./reply-cleanup";
import { ChatMediaService } from "./chat-media.service";
import type {
  ChatWithContext,
  ConversationActor,
  EditInput,
  EngineBaseInput,
  EngineEvent,
  GreetingInput,
  MessageSource,
  RegenerateInput,
  RespondInput,
  UserTextInput,
  UserVoiceInput,
} from "./conversation.types";

/** TTL лока диалога; продлевается, пока идёт генерация. */
const CHAT_LOCK_TTL_MS = 60_000;

/** Скрытый kickoff приветствия: не сохраняется, лишь провоцирует первую реплику. */
const GREETING_KICKOFF = {
  ru: "*заходит в чат* Поздоровайся со мной первой — коротко и в образе своего персонажа.",
  en: "*enters the chat* Greet me first — keep it short and in character.",
} as const;

/** Параметры генерации ответа ассистента. */
interface ReplyOptions {
  chat: ChatWithContext;
  actor: ConversationActor;
  source: MessageSource;
  /** Действие для UsageLog: chat_message | chat_greeting. */
  usageAction: string;
  /** Сообщение пользователя, на которое отвечаем. */
  replyToId?: string;
  signal?: AbortSignal;
  context?: ContextOptions;
  jobInput?: Record<string, unknown>;
  replyMetadata?: Record<string, unknown>;
  /** Резерв кредитов под ответ: списывается вместе с сохранением ответа. */
  reservationKey?: string | null;
}

/** Итог потока ядра, собранный целиком (для каналов без стриминга). */
export interface CollectedReply {
  content: string;
  tokens: number;
  messageId?: string;
  transcription?: string;
  replayed: boolean;
  failed: boolean;
  error?: string;
}

/** Ошибка отмены (fetch с AbortSignal или явная проверка сигнала). */
function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && err.name === "AbortError");
}

@Injectable()
export class ConversationEngine {
  private readonly logger = new Logger(ConversationEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly demo: DemoService,
    private readonly analytics: AnalyticsService,
    private readonly locks: RedisLockService,
    private readonly context: ContextBuilder,
    private readonly llm: LlmAdapter,
    private readonly stt: SttAdapter,
    private readonly wallet: WalletService,
    private readonly intents: IntentRouter,
    private readonly media: ChatMediaService,
  ) {}

  // ─── Входы ──────────────────────────────────────────────────────────────────

  /** Текстовое сообщение пользователя → ответ персонажа. */
  async *handleUserText(input: UserTextInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "web";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      const existing = await this.findDuplicate(chat.id, source, input.clientMessageId, input.externalId);
      if (existing) {
        yield* this.resumeDuplicate(existing, input, { chat, actor: input.actor, source, usageAction: "chat_message", signal: input.signal });
        return;
      }

      if (input.enforceLimits !== false) {
        await this.demo.checkMessageLimit(chat.id, input.actor.id, input.actor.subscription);
      }

      // Резерв — до сохранения сообщения: без кредитов сообщение не принимается.
      const reservation = await this.reserve(input, { kind: "chat_message" });
      try {
        const userMsg = await this.chats.saveMessage(chat.id, "user", input.content, {
          source,
          clientMessageId: input.clientMessageId,
          externalId: input.externalId,
        });

        this.analytics.capture(input.actor.id, "message_sent", {
          chat_id: chat.id,
          character_id: chat.characterId,
          source,
        });

        yield* this.routeUserMessage({
          chat,
          input,
          source,
          text: input.content,
          userMessageId: userMsg.id,
          reservationKey: reservation,
          routeIntents: input.routeIntents !== false,
        });
      } finally {
        await this.releaseIfHeld(reservation);
      }
    });
  }

  /** Голосовое сообщение: распознавание → сообщение пользователя → ответ персонажа. */
  async *handleUserVoice(input: UserVoiceInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "web";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      const existing = await this.findDuplicate(chat.id, source, input.clientMessageId, input.externalId);
      if (existing) {
        yield { type: "transcription", text: existing.content };
        yield* this.resumeDuplicate(existing, input, { chat, actor: input.actor, source, usageAction: "chat_message", signal: input.signal });
        return;
      }

      // Резервируем и распознавание, и ответ заранее: без кредитов аудио не отправляется в STT.
      const sttReservation = await this.reserve(input, { kind: "stt" });
      let chatReservation: string | null = null;
      try {
        chatReservation = await this.reserve(input, { kind: "chat_message" });

        const stt = await this.stt.transcribe(input.audio, input.language);
        if (!stt.text) throw new BadRequestException({ error: "Could not transcribe audio" });
        if (sttReservation) await this.wallet.capture(sttReservation);

        const userMsg = await this.chats.saveMessage(chat.id, "user", stt.text, {
          type: "audio",
          source,
          clientMessageId: input.clientMessageId,
          externalId: input.externalId,
        });
        await this.chats.logUsage(input.actor.id, "stt");
        // Учёт расходов на распознавание речи (Whisper тарифицируется по минутам).
        await this.chats.recordVoiceJob(input.actor.id, "stt", stt.model || "whisper-1", stt.durationSec ?? null, {
          chatSessionId: chat.id,
        });

        yield { type: "transcription", text: stt.text };

        yield* this.routeUserMessage({
          chat,
          input,
          source,
          text: stt.text,
          userMessageId: userMsg.id,
          reservationKey: chatReservation,
          routeIntents: input.routeIntents !== false,
        });
      } finally {
        await this.releaseIfHeld(sttReservation, chatReservation);
      }
    });
  }

  /**
   * Первое приветствие персонажа. Только для пустого чата: проверка пустоты
   * выполняется под локом, поэтому два параллельных запроса не дадут двух приветствий.
   */
  async *greet(input: GreetingInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "web";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      const history = await this.chats.getMessageHistory(chat.id, 1);
      if (history.length > 0) {
        yield { type: "done" };
        return;
      }

      const kickoff = GREETING_KICKOFF[input.lang === "ru" ? "ru" : "en"];
      const reservation = await this.reserve(input, { kind: "chat_greeting" });
      try {
        yield* this.reply({
          chat,
          actor: input.actor,
          source,
          usageAction: "chat_greeting",
          signal: input.signal,
          context: { messages: [{ role: "user", content: kickoff }] },
          reservationKey: reservation,
        });
      } finally {
        await this.releaseIfHeld(reservation);
      }
    });
  }

  /** Правка сообщения пользователя: новый текст, последующие ответы удаляются, ответ генерируется заново. */
  async *edit(input: EditInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "web";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      if (input.enforceLimits !== false) {
        await this.demo.checkMessageLimit(chat.id, input.actor.id, input.actor.subscription);
      }
      const reservation = await this.reserve(input, { kind: "chat_message" });
      try {
        // Проверяет, что сообщение — пользовательское; каскадно удаляет последующие (кроме фото).
        await this.chats.updateMessageContent(input.messageId, chat.id, input.actor.id, input.content);

        yield* this.reply({
          chat,
          actor: input.actor,
          source,
          usageAction: "chat_message",
          replyToId: input.messageId,
          signal: input.signal,
          reservationKey: reservation,
        });
      } finally {
        await this.releaseIfHeld(reservation);
      }
    });
  }

  /** Перегенерация ответа ассистента: он и всё после него (кроме фото) удаляются, ответ генерируется заново. */
  async *regenerate(input: RegenerateInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "web";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      if (input.enforceLimits !== false) {
        await this.demo.checkMessageLimit(chat.id, input.actor.id, input.actor.subscription);
      }

      const target = await this.chats.getMessage(input.messageId, chat.id, input.actor.id);
      if (target.role !== "assistant" || target.type === "image") {
        throw new BadRequestException("Only assistant text replies can be regenerated");
      }

      const reservation = await this.reserve(input, { kind: "chat_message" });
      try {
        const after = await this.chats.getMessagesAfter(chat.id, target.id);
        await this.chats.softDeleteMessages([target.id, ...after.map((m) => m.id)]);

        yield* this.reply({
          chat,
          actor: input.actor,
          source,
          usageAction: "chat_message",
          replyToId: target.replyToId ?? undefined,
          signal: input.signal,
          reservationKey: reservation,
        });
      } finally {
        await this.releaseIfHeld(reservation);
      }
    });
  }

  /**
   * Ответ персонажа на текущую историю без нового сообщения пользователя
   * (автопереписка; в будущем — инициативные сообщения).
   */
  async *respond(input: RespondInput): AsyncGenerator<EngineEvent> {
    const source = input.source ?? "system";
    const chat = await this.chats.getChat(input.chatId, input.actor.id, { includeHidden: source !== "web" });

    yield* this.withChatLock(chat.id, async function* (this: ConversationEngine) {
      if (input.enforceLimits !== false) {
        await this.demo.checkMessageLimit(chat.id, input.actor.id, input.actor.subscription);
      }
      const reservation = await this.reserve(input, { kind: "chat_message" });
      try {
        yield* this.reply({
          chat,
          actor: input.actor,
          source,
          usageAction: "chat_message",
          signal: input.signal,
          context: {
            historyLimit: input.historyLimit,
            contentMode: input.contentMode,
            userProfile: input.userProfile,
            trailingNote: input.trailingNote,
          },
          jobInput: input.jobInput,
          replyMetadata: input.replyMetadata,
          reservationKey: reservation,
        });
      } finally {
        await this.releaseIfHeld(reservation);
      }
    });
  }

  /** Собирает поток ядра целиком — для каналов без стриминга (Telegram, системные вызовы). */
  static async collect(events: AsyncIterable<EngineEvent>): Promise<CollectedReply> {
    const out: CollectedReply = { content: "", tokens: 0, replayed: false, failed: false };
    for await (const event of events) {
      if (event.type === "transcription") out.transcription = event.text;
      if (event.type === "llm") {
        if (typeof event.data.content === "string") out.content += event.data.content;
        const tokens = (event.data.usage as { totalTokens?: number } | undefined)?.totalTokens;
        if (tokens) out.tokens = tokens;
      }
      if (event.type === "done") {
        out.messageId = event.messageId;
        out.replayed = Boolean(event.replayed);
        out.failed = Boolean(event.failed);
        out.error = event.error;
      }
    }
    return out;
  }

  // ─── Внутреннее ─────────────────────────────────────────────────────────────

  /**
   * Выполняет тело под локом диалога. Лок продлевается, пока идёт генерация,
   * и освобождается при любом исходе (в т.ч. если потребитель перестал читать поток).
   */
  private async *withChatLock(
    chatId: string,
    body: (this: ConversationEngine) => AsyncGenerator<EngineEvent>,
  ): AsyncGenerator<EngineEvent> {
    const lock = await this.locks.acquire(`chat:${chatId}`, CHAT_LOCK_TTL_MS);
    if (!lock) {
      throw new ConflictException({ error: "CHAT_BUSY", message: "Previous message is still being processed" });
    }
    const stop = this.locks.keepAlive(lock, CHAT_LOCK_TTL_MS);
    try {
      yield* body.call(this);
    } finally {
      stop();
      await this.locks.release(lock).catch(() => undefined);
    }
  }

  /** Ищет уже принятое сообщение пользователя по идемпотентным ключам. */
  private async findDuplicate(chatId: string, source: string, clientMessageId?: string, externalId?: string) {
    if (clientMessageId) {
      const found = await this.prisma.message.findFirst({ where: { chatSessionId: chatId, clientMessageId } });
      if (found) return found;
    }
    if (externalId) {
      return this.prisma.message.findFirst({ where: { chatSessionId: chatId, source, externalId } });
    }
    return null;
  }

  /**
   * Повтор уже принятого сообщения: отдаём сохранённый ответ; если ответа нет
   * (прошлая попытка упала) — догенерируем его, не создавая дубль сообщения.
   */
  private async *resumeDuplicate(
    existing: { id: string; deletedAt: Date | null },
    input: EngineBaseInput,
    opts: Omit<ReplyOptions, "replyToId" | "reservationKey">,
  ): AsyncGenerator<EngineEvent> {
    const saved = await this.prisma.message.findFirst({
      where: { chatSessionId: opts.chat.id, replyToId: existing.id, deletedAt: null, status: "completed" },
      orderBy: { seq: "desc" },
    });
    if (saved) {
      yield { type: "llm", data: { content: saved.content } };
      yield { type: "done", messageId: saved.id, replayed: true };
      return;
    }
    // Сообщение уже убрано из диалога (правка/перегенерация) — отвечать не на что.
    if (existing.deletedAt) {
      yield { type: "done", replayed: true };
      return;
    }
    const reservation = await this.reserve(input, { kind: "chat_message" });
    try {
      yield* this.reply({ ...opts, replyToId: existing.id, reservationKey: reservation });
    } finally {
      await this.releaseIfHeld(reservation);
    }
  }

  /**
   * Маршрут сообщения пользователя по намерению (роутер намерений):
   * - reply — обычный ответ персонажа;
   * - image / video — запуск генерации в диалоге и ответ персонажа с пометкой
   *   «ты отправляешь фото»; дорогое — сначала предложение подтвердить цену;
   * - clarify — уточняющий вопрос без вызова модели (резерв ответа возвращается).
   */
  private async *routeUserMessage(args: {
    chat: ChatWithContext;
    input: EngineBaseInput;
    source: MessageSource;
    text: string;
    userMessageId: string;
    reservationKey: string | null;
    routeIntents: boolean;
  }): AsyncGenerator<EngineEvent> {
    const { chat, input, source, text, userMessageId } = args;
    const replyOpts: ReplyOptions = {
      chat,
      actor: input.actor,
      source,
      usageAction: "chat_message",
      replyToId: userMessageId,
      signal: input.signal,
      reservationKey: args.reservationKey,
    };

    const contentMode = ContextBuilder.resolveContentMode(input.actor) === "sfw" ? "sfw" : "nsfw";
    const intent = args.routeIntents ? await this.intents.route(text, contentMode) : ({ intent: "reply" } as const);
    if (args.routeIntents) {
      // Видно в логах api, почему на просьбу о фото пришёл только текст.
      this.logger.log(`intent ${intent.intent} (${"via" in intent ? intent.via : "-"}) chat=${chat.id}: "${text.slice(0, 120)}"`);
    }
    const ru = /[а-яё]/i.test(text);

    if (intent.intent === "clarify") {
      yield* this.saveAssistantText(chat, source, userMessageId, intent.question, { intent: "clarify" });
      return;
    }
    if (intent.intent !== "image" && intent.intent !== "video") {
      yield* this.reply(replyOpts);
      return;
    }

    const kind = intent.intent;
    const spec = selectionsToSpec(kind, intent.selections, chat.characterId, contentMode, intent.extra);
    const caption = kind === "video" ? "video" : "photo";

    try {
      const price = await this.media.quote(spec, input.actor.id);
      if (await this.media.needsConfirmation(kind, price)) {
        const token = await this.media.createConfirmation({
          chatId: chat.id,
          userId: input.actor.id,
          spec,
          caption,
          source,
          price,
        });
        const what = kind === "video" ? (ru ? "видео" : "video") : ru ? "фото" : "photo";
        const offer = ru
          ? `Это ${what} будет стоить ${price} кредитов. Отправить?`
          : `This ${what} costs ${price} credits. Send it?`;
        let offerId: string | undefined;
        for await (const event of this.saveAssistantText(chat, source, userMessageId, offer, {
          mediaConfirm: { token, kind, price, status: "pending" },
        })) {
          if (event.type === "done") offerId = event.messageId;
          else yield event;
        }
        if (offerId) await this.media.attachConfirmationMessage(token, offerId);
        yield { type: "media", status: "confirm", kind, token, price };
        yield { type: "done", messageId: offerId };
        return;
      }

      const started = await this.media.start(chat.id, input.actor, spec, { caption, source });
      yield { type: "media", status: "pending", kind, jobId: started.jobId };
      replyOpts.context = {
        lastUserNote:
          kind === "video"
            ? "[System note: the user receives your video together with this reply. Write one short, natural in-character line to go with it. Do not mention any delay, waiting, generation, files or technical details, do not describe the video in brackets, and never say you cannot send videos.]"
            : "[System note: the user receives your photo together with this reply. Write one short, natural in-character line to go with it. Do not mention any delay, waiting, generation, files or technical details, do not describe the photo in brackets, and never say you cannot send photos.]",
      };
    } catch (err) {
      if (err instanceof HttpException) {
        // Нет кредитов / лимит — сообщаем каналу и всё равно отвечаем персонажем.
        const body = err.getResponse();
        yield {
          type: "media",
          status: "rejected",
          kind,
          error: typeof body === "object" && body ? (body as Record<string, unknown>) : { error: String(body) },
        };
      } else {
        // Сбой медиа не должен ломать обычный ответ.
        this.logger.warn(`chat media failed, replying without media: ${(err as Error)?.message}`);
      }
    }
    yield* this.reply(replyOpts);
  }

  /** Сохраняет готовую реплику персонажа (без вызова модели) и отдаёт её как ответ. */
  private async *saveAssistantText(
    chat: ChatWithContext,
    source: MessageSource,
    replyToId: string,
    text: string,
    metadata: Record<string, unknown>,
  ): AsyncGenerator<EngineEvent> {
    const saved = await this.chats.saveMessage(chat.id, "assistant", text, { source, replyToId, metadata });
    yield { type: "llm", data: { content: text } };
    yield { type: "done", messageId: saved.id };
  }

  /** Резервирует кредиты под операцию; null — бесплатная операция или служебный вызов. */
  private async reserve(input: EngineBaseInput, op: BillableOperation): Promise<string | null> {
    if (input.billable === false) return null;
    const handle = await this.wallet.reserveOperation(input.actor.id, op, `${op.kind}:${randomUUID()}`);
    return handle?.operationKey ?? null;
  }

  /** Возвращает резервы, не дошедшие до списания (после списания — ничего не делает). */
  private async releaseIfHeld(...keys: (string | null)[]): Promise<void> {
    for (const key of keys) {
      if (key) await this.wallet.release(key, "not_completed").catch(() => false);
    }
  }

  /** Генерирует ответ ассистента, стримит события модели и атомарно фиксирует результат. */
  private async *reply(opts: ReplyOptions): AsyncGenerator<EngineEvent> {
    const { chat, actor } = opts;
    const aiJob = await this.chats.createAiJob(actor.id, "chat", {
      chatSessionId: chat.id,
      characterId: chat.characterId,
      ...(opts.reservationKey ? { reservationKey: opts.reservationKey } : {}),
      ...(opts.jobInput ?? {}),
    });

    const request = await this.context.build(chat, actor, opts.context);

    let content = "";
    let tokens = 0;
    // Фактическая стоимость у провайдера (OpenRouter) — для сверки маржи.
    let providerCostUsd: number | undefined;
    let error: string | undefined;

    try {
      for await (const raw of this.llm.streamChat(request, opts.signal)) {
        // Ответ приходит одним чанком — служебные фрагменты чистим до показа и сохранения.
        const data = typeof raw.content === "string" ? { ...raw, content: cleanAssistantReply(raw.content) } : raw;
        if (typeof data.content === "string") content += data.content;
        const usage = data.usage as { totalTokens?: number; costUsd?: number } | undefined;
        if (usage?.totalTokens) tokens = usage.totalTokens;
        if (typeof usage?.costUsd === "number") providerCostUsd = usage.costUsd;
        if (data.error) error = String(data.error);
        yield { type: "llm", data };
      }
    } catch (err) {
      if (isAbortError(err, opts.signal)) {
        error = "client_aborted";
      } else if (err instanceof AiServiceError && !content) {
        // Ошибка до начала стрима — пробрасываем, адаптер вернёт её HTTP-ответом.
        await this.chats.failAiJob(aiJob.id, err.message).catch(() => undefined);
        throw err;
      } else {
        error = err instanceof Error ? err.message : String(err);
      }
    }

    const failed = Boolean(error);
    let messageId: string | undefined;

    await this.prisma.$transaction(async (tx) => {
      if (content) {
        const saved = await this.chats.saveMessage(
          chat.id,
          "assistant",
          content,
          {
            source: opts.source,
            replyToId: opts.replyToId,
            status: failed ? "failed" : "completed",
            metadata: opts.replyMetadata,
          },
          tx,
        );
        messageId = saved.id;
        // Ответ получен (пусть и частично) — списываем резерв в той же транзакции.
        if (opts.reservationKey) await this.wallet.capture(opts.reservationKey, undefined, tx);
      }
      if (failed && !content) {
        await this.chats.failAiJob(aiJob.id, error!, tx);
      } else {
        await this.chats.completeAiJob(
          aiJob.id,
          tokens || undefined,
          tx,
          providerCostUsd !== undefined ? { providerCostUsd } : undefined,
        );
        await this.chats.logUsage(actor.id, opts.usageAction, tokens || undefined, tx);
      }
    });

    yield { type: "done", messageId, failed, error };
  }
}
