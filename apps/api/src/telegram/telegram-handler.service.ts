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
 *
 * Бот для клиентов (mode=RESELLER) — handleReseller: привязка не нужна, у каждого
 * клиента свой скрытый от владельца диалог, кредиты списываются с владельца в
 * контексте клиента, действуют лимиты бота; /mydata и /deletemydata.
 */

import { HttpException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { ChatsService } from "../chats/chats.service";
import { ConversationEngine } from "../conversation/conversation.engine";
import { ChatMediaService } from "../conversation/chat-media.service";
import type { ConversationActor, EngineEvent } from "../conversation/conversation.types";
import { hasMediaHint } from "../conversation/intent-router";
import { runWithBillingContext } from "../billing/billing-context";
import { TelegramBotsService } from "./telegram-bots.service";
import { TelegramResellerService } from "./telegram-reseller.service";
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
/** callback_data кнопок подтверждения /deletemydata. */
export const DELETE_DATA_CALLBACK = { yes: "dd:yes", no: "dd:no" };

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

/** Тексты бота для клиентов: без упоминаний сайта, кредитов и владельца. */
const CLIENT_TEXTS = {
  help:
    "Пишите сообщения или отправляйте голосовые — я отвечу.\n" +
    "Можно попросить фото или видео словами («пришли фото на пляже»).\n\n" +
    "/newchat — начать диалог заново\n/mute — вкл/выкл мои сообщения первой\n" +
    "/mydata — выгрузить мои данные\n/deletemydata — удалить мои данные",
  newChat: "Начали диалог заново.",
  unavailable: "Бот сейчас недоступен. Попробуйте позже.",
  messagesLimit: "На сегодня лимит сообщений исчерпан. Возвращайтесь завтра!",
  mediaLimit: "Фото и видео на сегодня закончились — продолжим общаться словами.",
  dailyLimit: "На сегодня лимит исчерпан. Возвращайтесь завтра!",
  deleteAsk: "Удалить всю нашу переписку и ваши данные в этом боте? Это нельзя отменить.",
  deleteYes: "Да, удалить",
  deleteNo: "Отмена",
  deleted: "Ваши данные удалены. Чтобы начать заново, напишите /start.",
  deleteCancelled: "Удаление отменено.",
  exportCaption: "Ваши данные в этом боте.",
};

/** Поля бота, нужные обработчику. */
interface ResellerBot {
  id: string;
  mode: string;
  ownerUserId: string;
  characterId: string;
  character: { name: string };
}

@Injectable()
export class TelegramHandlerService {
  private readonly logger = new Logger(TelegramHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly engine: ConversationEngine,
    private readonly media: ChatMediaService,
    private readonly bots: TelegramBotsService,
    private readonly reseller: TelegramResellerService,
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

    if (bot.mode === "RESELLER") {
      await this.handleReseller(bot, api, botUser, update, text);
      return;
    }

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
  private async run(
    api: TelegramApi,
    chatId: string,
    events: AsyncIterable<EngineEvent>,
    errorText: (body: unknown) => string | undefined = (body) => this.errorText(body),
  ): Promise<void> {
    try {
      for await (const event of events) {
        if (event.type !== "media") continue;
        if (event.status === "pending") {
          await api.sendChatAction(chatId, event.kind === "video" ? "upload_video" : "upload_photo").catch(() => undefined);
        } else if (event.status === "rejected") {
          await api.sendMessage(chatId, errorText(event.error) ?? TEXTS.mediaNoCredits);
        }
      }
    } catch (err) {
      if (err instanceof HttpException) {
        const body = err.getResponse() as Record<string, unknown> | string;
        if (typeof body === "object" && body?.error === "CHAT_BUSY") {
          throw new RetryLaterError("chat busy");
        }
        await api.sendMessage(chatId, errorText(body) ?? TEXTS.error);
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
    bot: ResellerBot & { tokenEnc: string },
    api: TelegramApi,
    query: TgCallbackQuery,
  ): Promise<void> {
    const data = query.data ?? "";
    if (bot.mode === "RESELLER") {
      await this.handleResellerCallback(bot, api, query);
      return;
    }
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
        where: { id: current, deletedAt: null, characterId, hiddenFromOwner: false },
        select: { id: true },
      });
      if (alive) return alive.id;
    }
    const latest = await this.prisma.chatSession.findFirst({
      where: { userId: ownerUserId, characterId, deletedAt: null, hiddenFromOwner: false },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      select: { id: true },
    });
    const chatSessionId = latest?.id ?? (await this.chats.createChat(ownerUserId, characterId)).id;
    await this.prisma.telegramBotUser.update({ where: { id: botUserId }, data: { chatSessionId } });
    return chatSessionId;
  }

  // ─── Бот для клиентов (RESELLER) ─────────────────────────────────────────────

  /** Сообщение клиента бота: свой скрытый диалог, лимиты, списание с владельца. */
  private async handleReseller(
    bot: ResellerBot,
    api: TelegramApi,
    botUser: { id: string; chatId: string; chatSessionId: string | null; muted: boolean },
    update: TgUpdate,
    text: string,
  ): Promise<void> {
    const chatId = botUser.chatId;
    const message = update.message!;

    if (text === "/help") {
      await api.sendMessage(chatId, CLIENT_TEXTS.help);
      return;
    }
    if (text === "/mute") {
      const updated = await this.prisma.telegramBotUser.update({ where: { id: botUser.id }, data: { muted: !botUser.muted } });
      await api.sendMessage(chatId, updated.muted ? TEXTS.muted : TEXTS.unmuted);
      return;
    }
    if (text === "/deletemydata") {
      await api.sendMessage(chatId, CLIENT_TEXTS.deleteAsk, {
        inline_keyboard: [
          [
            { text: CLIENT_TEXTS.deleteYes, callback_data: DELETE_DATA_CALLBACK.yes },
            { text: CLIENT_TEXTS.deleteNo, callback_data: DELETE_DATA_CALLBACK.no },
          ],
        ],
      });
      return;
    }
    if (text === "/mydata") {
      const dump = await this.reseller.exportEndUserData(botUser.id);
      await api.sendDocument(
        chatId,
        { bytes: Buffer.from(dump, "utf8"), filename: "my-data.txt", contentType: "text/plain; charset=utf-8" },
        CLIENT_TEXTS.exportCaption,
      );
      return;
    }

    const fresh = text === "/newchat";
    const isNew = !botUser.chatSessionId;
    const chatSessionId = await this.reseller.ensureEndUserSession(bot, botUser, fresh);
    if (fresh) {
      await api.sendMessage(chatId, CLIENT_TEXTS.newChat);
      return;
    }

    const allowance = await this.reseller.allowance(bot.id, botUser.id);
    const actor = await this.actorFor(bot.ownerUserId);
    const context = { actorUserId: bot.ownerUserId, endUserId: botUser.id, keepBalance: allowance.keepBalance };
    const clientError = (body: unknown) => this.clientErrorText(body);

    await runWithBillingContext(context, async () => {
      if (text.startsWith("/start")) {
        // Новый клиент — персонаж здоровается первым; повторный /start — подсказка.
        if (isNew) {
          await this.run(api, chatId, this.engine.greet({ chatId: chatSessionId, actor, lang: "ru", source: "telegram", enforceLimits: false }), clientError);
        } else {
          await api.sendMessage(chatId, CLIENT_TEXTS.help);
        }
        return;
      }
      if (!allowance.messages) {
        await api.sendMessage(chatId, CLIENT_TEXTS.messagesLimit);
        return;
      }
      if (!allowance.media && text && hasMediaHint(text)) {
        await api.sendMessage(chatId, CLIENT_TEXTS.mediaLimit);
      }

      const externalId = String(update.update_id);
      const base = { chatId: chatSessionId, actor, source: "telegram" as const, externalId, enforceLimits: false, routeIntents: allowance.media };
      if (text) {
        await api.sendChatAction(chatId, "typing").catch(() => undefined);
        await this.run(api, chatId, this.engine.handleUserText({ ...base, content: text }), clientError);
        return;
      }
      const voice = message.voice ?? message.audio;
      if (voice) {
        await api.sendChatAction(chatId, "typing").catch(() => undefined);
        const audio = await this.downloadVoice(api, voice.file_id, voice.mime_type);
        await this.run(api, chatId, this.engine.handleUserVoice({ ...base, audio }), clientError);
        return;
      }
      await api.sendMessage(chatId, TEXTS.unsupported);
    });
  }

  /** Кнопки бота для клиентов: подтверждение цены медиа и удаления данных. */
  private async handleResellerCallback(bot: ResellerBot, api: TelegramApi, query: TgCallbackQuery): Promise<void> {
    const data = query.data ?? "";
    const botUser = await this.prisma.telegramBotUser.findUnique({
      where: { botId_tgUserId: { botId: bot.id, tgUserId: String(query.from.id) } },
    });
    if (!botUser) {
      await api.answerCallbackQuery(query.id).catch(() => undefined);
      return;
    }
    const clearButtons = async () => {
      if (query.message) await api.editMessageReplyMarkup(botUser.chatId, query.message.message_id).catch(() => undefined);
    };

    if (data === DELETE_DATA_CALLBACK.yes || data === DELETE_DATA_CALLBACK.no) {
      await api.answerCallbackQuery(query.id).catch(() => undefined);
      await clearButtons();
      if (data === DELETE_DATA_CALLBACK.yes) {
        await this.reseller.deleteEndUserData(botUser.id);
        await api.sendMessage(botUser.chatId, CLIENT_TEXTS.deleted);
      } else {
        await api.sendMessage(botUser.chatId, CLIENT_TEXTS.deleteCancelled);
      }
      return;
    }
    if (!data.startsWith(MEDIA_CONFIRM_CALLBACK) || !botUser.chatSessionId) {
      await api.answerCallbackQuery(query.id).catch(() => undefined);
      return;
    }

    const allowance = await this.reseller.allowance(bot.id, botUser.id);
    if (!allowance.media) {
      await api.answerCallbackQuery(query.id, CLIENT_TEXTS.mediaLimit).catch(() => undefined);
      return;
    }
    const actor = await this.actorFor(bot.ownerUserId);
    const context = { actorUserId: bot.ownerUserId, endUserId: botUser.id, keepBalance: allowance.keepBalance };
    try {
      const started = await runWithBillingContext(context, () =>
        this.media.confirm(botUser.chatSessionId!, actor, data.slice(MEDIA_CONFIRM_CALLBACK.length)),
      );
      await api.answerCallbackQuery(query.id, TEXTS.confirmed).catch(() => undefined);
      await clearButtons();
      await api
        .sendChatAction(botUser.chatId, started.kind === "video" ? "upload_video" : "upload_photo")
        .catch(() => undefined);
    } catch (err) {
      const body = err instanceof HttpException ? err.getResponse() : undefined;
      const text =
        this.clientErrorText(body) ??
        (typeof body === "object" && (body as { error?: unknown })?.error === "MEDIA_CONFIRMATION_EXPIRED"
          ? TEXTS.confirmExpired
          : TEXTS.error);
      await api.answerCallbackQuery(query.id, text).catch(() => undefined);
      if (!(err instanceof HttpException)) this.logger.warn(`media confirm failed: ${(err as Error)?.message}`);
    }
  }

  /** Ошибки для клиента бота: о кредитах и подписке владельца клиенту знать не нужно. */
  private clientErrorText(body: unknown): string | undefined {
    if (!body || typeof body !== "object") return undefined;
    const error = (body as { error?: unknown }).error;
    if (error === "INSUFFICIENT_CREDITS") return CLIENT_TEXTS.unavailable;
    if (error === "FREE_LIMIT_REACHED") return CLIENT_TEXTS.dailyLimit;
    return undefined;
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

