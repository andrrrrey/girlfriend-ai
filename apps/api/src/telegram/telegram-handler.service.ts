/**
 * @file telegram-handler.service.ts
 * @description Обработка входящего обновления личного Telegram-бота.
 *
 * - /start <token> — привязка Telegram-аккаунта к аккаунту сайта (только владелец
 *   личного бота) и общий диалог с персонажем бота (тот же, что на сайте);
 * - /help, /newchat (сброс диалога, фото остаются в галерее), /mute;
 * - текст и голос → ConversationEngine (source=telegram, externalId=update_id —
 *   повтор обновления не создаёт дубль); ответ и медиа доставляет
 *   TelegramDeliveryService через outbox;
 * - кнопка «Отправить за N кредитов» (callback mc:<token>) → подтверждение цены.
 */

import { HttpException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { ChatsService } from "../chats/chats.service";
import { ConversationEngine } from "../conversation/conversation.engine";
import { ChatMediaService } from "../conversation/chat-media.service";
import type { ConversationActor, EngineEvent } from "../conversation/conversation.types";
import { TelegramBotsService } from "./telegram-bots.service";
import { TelegramApi, TgCallbackQuery, TgUpdate } from "./telegram-api";

/** Обработку нужно повторить позже, не считая попытку (например, диалог занят). */
export class RetryLaterError extends Error {
  constructor(
    message: string,
    readonly delayMs = 3_000,
  ) {
    super(message);
    this.name = "RetryLaterError";
  }
}

/** Префикс callback_data кнопки подтверждения цены медиа. */
export const MEDIA_CONFIRM_CALLBACK = "mc:";

const TEXTS = {
  notLinked:
    "Этот бот привязан к аккаунту на сайте. Чтобы начать общение, откройте на сайте раздел Telegram и нажмите «Привязать Telegram».",
  foreign: "Это личный бот другого пользователя.",
  linkInvalid: "Ссылка привязки устарела или уже использована. Получите новую на сайте в разделе Telegram.",
  linked: (name: string) => `Готово! Аккаунт привязан — теперь вы общаетесь с ${name}. Переписка общая с сайтом.`,
  help:
    "Пишите сообщения или отправляйте голосовые — персонаж ответит.\n" +
    "Попросите фото или видео словами («пришли фото на пляже»).\n\n" +
    "/newchat — начать диалог заново\n/mute — вкл/выкл сообщения от персонажа первой",
  newChat: "Начали диалог заново. Фото остались в галерее на сайте.",
  muted: "Персонаж больше не будет писать первым. Включить снова — /mute.",
  unmuted: "Персонаж снова может писать первым.",
  unsupported: "Пока я понимаю только текст и голосовые сообщения.",
  noCredits: "Недостаточно кредитов. Пополните баланс на сайте и попробуйте снова.",
  mediaNoCredits: "На фото/видео не хватает кредитов — пополните баланс на сайте.",
  error: "Что-то пошло не так. Попробуйте ещё раз чуть позже.",
  confirmExpired: "Предложение устарело — попросите ещё раз.",
  confirmed: "Отправляю…",
};

@Injectable()
export class TelegramHandlerService {
  private readonly logger = new Logger(TelegramHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly engine: ConversationEngine,
    private readonly media: ChatMediaService,
    private readonly bots: TelegramBotsService,
  ) {}

  /** Обрабатывает одно обновление бота. */
  async handle(botId: string, update: TgUpdate): Promise<void> {
    const bot = await this.prisma.telegramBot.findFirst({
      where: { id: botId, deletedAt: null },
      include: { character: { select: { id: true, name: true } } },
    });
    if (!bot) return; // бот отключён — обновления игнорируем
    const api = this.bots.apiFor(bot);

    if (update.callback_query) {
      await this.handleCallback(bot, api, update.callback_query);
      return;
    }
    const message = update.message;
    if (!message?.from || message.chat.type !== "private" || message.from.is_bot) return;

    const botUser = await this.prisma.telegramBotUser.upsert({
      where: { botId_tgUserId: { botId: bot.id, tgUserId: String(message.from.id) } },
      create: {
        botId: bot.id,
        tgUserId: String(message.from.id),
        chatId: String(message.chat.id),
        username: message.from.username,
        firstName: message.from.first_name,
      },
      update: {
        chatId: String(message.chat.id),
        username: message.from.username,
        firstName: message.from.first_name,
        blockedAt: null,
      },
    });
    const chatId = botUser.chatId;
    const text = message.text?.trim() ?? "";

    if (text.startsWith("/start")) {
      const token = text.slice("/start".length).trim();
      if (token) {
        await this.link(bot, api, botUser.id, chatId, token);
        return;
      }
    }

    // Личный бот: общаться может только привязанный владелец.
    if (!botUser.linkedUserId) {
      await api.sendMessage(chatId, TEXTS.notLinked);
      return;
    }
    if (botUser.linkedUserId !== bot.ownerUserId) {
      await api.sendMessage(chatId, TEXTS.foreign);
      return;
    }

    const actor = await this.actorFor(bot.ownerUserId);
    const chatSessionId = await this.ensureChatSession(botUser.id, bot.ownerUserId, bot.characterId, botUser.chatSessionId);

    if (text === "/start" || text === "/help") {
      await api.sendMessage(chatId, TEXTS.help);
      return;
    }
    if (text === "/newchat") {
      await this.chats.resetChat(chatSessionId, bot.ownerUserId);
      await api.sendMessage(chatId, TEXTS.newChat);
      return;
    }
    if (text === "/mute") {
      const updated = await this.prisma.telegramBotUser.update({ where: { id: botUser.id }, data: { muted: !botUser.muted } });
      await api.sendMessage(chatId, updated.muted ? TEXTS.muted : TEXTS.unmuted);
      return;
    }

    const externalId = String(update.update_id);
    if (text) {
      await api.sendChatAction(chatId, "typing").catch(() => undefined);
      await this.run(api, chatId, this.engine.handleUserText({
        chatId: chatSessionId,
        actor,
        content: text,
        source: "telegram",
        externalId,
      }));
      return;
    }

    const voice = message.voice ?? message.audio;
    if (voice) {
      await api.sendChatAction(chatId, "typing").catch(() => undefined);
      const audio = await this.downloadVoice(api, voice.file_id, voice.mime_type);
      await this.run(api, chatId, this.engine.handleUserVoice({
        chatId: chatSessionId,
        actor,
        audio,
        source: "telegram",
        externalId,
      }));
      return;
    }

    await api.sendMessage(chatId, TEXTS.unsupported);
  }

  /**
   * Прогоняет поток ядра. Ответ персонажа и медиа доставит outbox; здесь —
   * только то, что видно сразу: «печатает/загружает фото», отказ по кредитам.
   */
  private async run(api: TelegramApi, chatId: string, events: AsyncIterable<EngineEvent>): Promise<void> {
    try {
      for await (const event of events) {
        if (event.type !== "media") continue;
        if (event.status === "pending") {
          await api.sendChatAction(chatId, event.kind === "video" ? "upload_video" : "upload_photo").catch(() => undefined);
        } else if (event.status === "rejected") {
          await api.sendMessage(chatId, this.errorText(event.error) ?? TEXTS.mediaNoCredits);
        }
      }
    } catch (err) {
      if (err instanceof HttpException) {
        const body = err.getResponse() as Record<string, unknown> | string;
        if (typeof body === "object" && body?.error === "CHAT_BUSY") {
          throw new RetryLaterError("chat busy");
        }
        await api.sendMessage(chatId, this.errorText(body) ?? TEXTS.error);
        return;
      }
      // Ошибка AI-сервиса и т.п.: сообщаем пользователю, обновление не повторяем.
      this.logger.warn(`engine failed for telegram chat ${chatId}: ${(err as Error)?.message}`);
      await api.sendMessage(chatId, TEXTS.error);
    }
  }

  /** Текст для пользователя по телу ошибки API (кредиты, лимиты). */
  private errorText(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const b = body as { error?: unknown; message?: unknown };
    if (b.error === "INSUFFICIENT_CREDITS") return TEXTS.noCredits;
    if (b.error === "FREE_LIMIT_REACHED" && typeof b.message === "string") return b.message;
    return undefined;
  }

  /** /start <token>: привязка аккаунта сайта к Telegram. */
  private async link(
    bot: { id: string; ownerUserId: string; characterId: string; character: { name: string } },
    api: TelegramApi,
    botUserId: string,
    chatId: string,
    token: string,
  ): Promise<void> {
    const link = await this.prisma.telegramLinkToken.findUnique({ where: { token } });
    const valid = link && link.botId === bot.id && !link.usedAt && link.expiresAt > new Date();
    if (!valid) {
      await api.sendMessage(chatId, TEXTS.linkInvalid);
      return;
    }
    if (link.userId !== bot.ownerUserId) {
      await api.sendMessage(chatId, TEXTS.foreign);
      return;
    }

    // Токен одноразовый: помечаем использованным атомарно (параллельный /start не пройдёт).
    const used = await this.prisma.telegramLinkToken.updateMany({
      where: { id: link.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) {
      await api.sendMessage(chatId, TEXTS.linkInvalid);
      return;
    }

    // Один Telegram-аккаунт на бота: прежние привязки владельца в этом боте снимаем.
    await this.prisma.telegramBotUser.updateMany({
      where: { botId: bot.id, linkedUserId: link.userId, id: { not: botUserId } },
      data: { linkedUserId: null },
    });
    await this.prisma.telegramBotUser.update({ where: { id: botUserId }, data: { linkedUserId: link.userId } });
    const chatSessionId = await this.ensureChatSession(botUserId, bot.ownerUserId, bot.characterId, null);

    await api.sendMessage(chatId, TEXTS.linked(bot.character.name));

    // Пустой диалог — персонаж здоровается первым (ответ доставит outbox).
    const actor = await this.actorFor(bot.ownerUserId);
    await this.run(api, chatId, this.engine.greet({ chatId: chatSessionId, actor, lang: "ru", source: "telegram" }));
  }

  /** Кнопка подтверждения цены медиа (callback_data = mc:<token>). */
  private async handleCallback(
    bot: { id: string; ownerUserId: string; tokenEnc: string },
    api: TelegramApi,
    query: TgCallbackQuery,
  ): Promise<void> {
    const data = query.data ?? "";
    if (!data.startsWith(MEDIA_CONFIRM_CALLBACK)) {
      await api.answerCallbackQuery(query.id).catch(() => undefined);
      return;
    }
    const botUser = await this.prisma.telegramBotUser.findUnique({
      where: { botId_tgUserId: { botId: bot.id, tgUserId: String(query.from.id) } },
    });
    if (!botUser?.linkedUserId || botUser.linkedUserId !== bot.ownerUserId || !botUser.chatSessionId) {
      await api.answerCallbackQuery(query.id, TEXTS.notLinked).catch(() => undefined);
      return;
    }

    const actor = await this.actorFor(bot.ownerUserId);
    try {
      const started = await this.media.confirm(botUser.chatSessionId, actor, data.slice(MEDIA_CONFIRM_CALLBACK.length));
      await api.answerCallbackQuery(query.id, TEXTS.confirmed).catch(() => undefined);
      if (query.message) {
        await api.editMessageReplyMarkup(botUser.chatId, query.message.message_id).catch(() => undefined);
      }
      await api
        .sendChatAction(botUser.chatId, started.kind === "video" ? "upload_video" : "upload_photo")
        .catch(() => undefined);
    } catch (err) {
      const body = err instanceof HttpException ? err.getResponse() : undefined;
      const text =
        this.errorText(body) ??
        (typeof body === "object" && (body as { error?: unknown })?.error === "MEDIA_CONFIRMATION_EXPIRED"
          ? TEXTS.confirmExpired
          : TEXTS.error);
      await api.answerCallbackQuery(query.id, text).catch(() => undefined);
      if (!(err instanceof HttpException)) this.logger.warn(`media confirm failed: ${(err as Error)?.message}`);
    }
  }

  /**
   * Диалог бота: сохранённый, иначе последний чат владельца с этим персонажем
   * (переписка общая с сайтом), иначе новый.
   */
  private async ensureChatSession(
    botUserId: string,
    ownerUserId: string,
    characterId: string,
    current: string | null,
  ): Promise<string> {
    if (current) {
      const alive = await this.prisma.chatSession.findFirst({
        where: { id: current, deletedAt: null, characterId },
        select: { id: true },
      });
      if (alive) return alive.id;
    }
    const latest = await this.prisma.chatSession.findFirst({
      where: { userId: ownerUserId, characterId, deletedAt: null },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      select: { id: true },
    });
    const chatSessionId = latest?.id ?? (await this.chats.createChat(ownerUserId, characterId)).id;
    await this.prisma.telegramBotUser.update({ where: { id: botUserId }, data: { chatSessionId } });
    return chatSessionId;
  }

  /** Владелец бота как участник диалога (подписка, режим контента, 18+). */
  private async actorFor(userId: string): Promise<ConversationActor> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, subscription: true, contentMode: true, isAdult: true },
    });
    return user;
  }

  /** Скачивает голосовое из Telegram. */
  private async downloadVoice(api: TelegramApi, fileId: string, mimeType?: string) {
    const file = await api.getFile(fileId);
    if (!file.file_path) throw new Error("Telegram file has no path");
    const buffer = await api.downloadFile(file.file_path);
    const ext = file.file_path.split(".").pop() || "ogg";
    return { buffer, mimetype: mimeType || "audio/ogg", originalname: `voice.${ext === "oga" ? "ogg" : ext}` };
  }
}

