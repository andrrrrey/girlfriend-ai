/**
 * @file telegram-delivery.service.ts
 * @description Доставка сообщений диалога в Telegram — подписчик outbox
 * (событие message.created). Диалог одинаковый на сайте и в Telegram:
 *
 * - сообщения персонажа (ответы, уточнения, предложение цены с кнопкой, фото,
 *   видео) уходят в Telegram независимо от того, где начат разговор;
 * - реплики пользователя, написанные на сайте, приходят цитатой
 *   «💬 Вы на сайте: …» (бот не может писать от имени пользователя);
 * - сообщения, написанные в самом Telegram, повторно не отправляются.
 *
 * Медиа из общего кэша (metadata.assetId) загружается в бота один раз: дальше
 * отправляется по сохранённому file_id (TelegramFileCache) без скачивания из S3.
 *
 * Ошибки: 403 (бот заблокирован) — пользователь помечается blockedAt, событие
 * считается доставленным; 429/5xx — исключение, outbox повторит с задержкой;
 * прочие 4xx — в лог, без повтора.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Readable } from "stream";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import { OUTBOX_EVENTS, OutboxService } from "../outbox/outbox.service";
import { TelegramBotsService } from "./telegram-bots.service";
import { TelegramApi, TelegramApiError, type InlineKeyboard, type TgInputFile } from "./telegram-api";
import { MEDIA_CONFIRM_CALLBACK } from "./telegram-handler.service";

/** Лимит длины текста сообщения Telegram. */
const TG_TEXT_LIMIT = 4096;

/** payload события message.created (см. ChatsService.saveMessage). */
interface MessageCreatedPayload {
  messageId: string;
  chatSessionId: string;
  role: string;
  type: string;
  source: string;
}

/** Нужно ли дублировать сообщение в Telegram (см. описание файла). */
export function shouldMirrorToTelegram(payload: { role: string; source: string }): boolean {
  if (payload.role === "assistant") return true;
  if (payload.role === "user") return payload.source !== "telegram";
  return false;
}

/** Реплика пользователя с сайта в виде цитаты для Telegram. */
export function siteUserQuote(content: string, type: string): string {
  return type === "audio" ? `🎤 Вы на сайте (голосовое): ${content}` : `💬 Вы на сайте: ${content}`;
}

/** Делит длинный текст на части по лимиту Telegram (по возможности по абзацам). */
export function splitTelegramText(text: string, limit = TG_TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** file_id отправленного фото (самый большой размер) или видео. */
export function telegramFileId(sent: unknown): string | null {
  const msg = sent as { photo?: { file_id: string }[]; video?: { file_id: string } } | null;
  if (msg?.video?.file_id) return msg.video.file_id;
  const photos = msg?.photo;
  return photos?.length ? photos[photos.length - 1].file_id : null;
}

/** S3-ключ из URL медиа в формате media-прокси (/api-proxy/media/stream?key=...). */
export function mediaKeyFromUrl(url: string): string | null {
  const match = url.match(/\/media\/stream\?(?:.*&)?key=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

@Injectable()
export class TelegramDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(TelegramDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly bots: TelegramBotsService,
    private readonly s3: S3Service,
  ) {}

  onModuleInit(): void {
    this.outbox.registerHandler(OUTBOX_EVENTS.MESSAGE_CREATED, (event) =>
      this.deliver(event.payload as unknown as MessageCreatedPayload),
    );
  }

  /** Доставляет сообщение всем привязанным пользователям ботов этого диалога. */
  async deliver(payload: MessageCreatedPayload): Promise<void> {
    if (!shouldMirrorToTelegram(payload)) return;

    const found = await this.prisma.message.findUnique({
      where: { id: payload.messageId },
      select: { role: true, content: true, type: true, mediaUrl: true, metadata: true, deletedAt: true, chatSessionId: true },
    });
    if (!found || found.deletedAt) return;
    const message =
      found.role === "user" ? { ...found, content: siteUserQuote(found.content, found.type), type: "text" } : found;

    const recipients = await this.prisma.telegramBotUser.findMany({
      where: {
        chatSessionId: message.chatSessionId,
        blockedAt: null,
        linkedUserId: { not: null },
        bot: { deletedAt: null },
      },
      include: { bot: { select: { id: true, tokenEnc: true } } },
    });

    for (const recipient of recipients) {
      try {
        await this.send(this.bots.apiFor(recipient.bot), recipient.bot.id, recipient.chatId, message);
      } catch (err) {
        if (err instanceof TelegramApiError && err.code === 403) {
          // Пользователь заблокировал бота — больше не пишем, пока он не вернётся.
          await this.prisma.telegramBotUser.update({ where: { id: recipient.id }, data: { blockedAt: new Date() } });
          continue;
        }
        if (err instanceof TelegramApiError && !err.retryable) {
          this.logger.warn(`telegram delivery to ${recipient.chatId} dropped: ${err.message}`);
          continue;
        }
        throw err; // 429/5xx/сеть — outbox повторит
      }
    }
  }

  private async send(
    api: TelegramApi,
    botId: string,
    chatId: string,
    message: { content: string; type: string; mediaUrl: string | null; metadata: unknown },
  ): Promise<void> {
    if ((message.type === "image" || message.type === "video") && message.mediaUrl) {
      await this.sendMedia(api, botId, chatId, message.type, message.mediaUrl, message.metadata);
      return;
    }

    const offer = (message.metadata as { mediaConfirm?: { token?: string; price?: number; status?: string } } | null)
      ?.mediaConfirm;
    const keyboard: InlineKeyboard | undefined =
      offer?.token && offer.status === "pending"
        ? { inline_keyboard: [[{ text: `Отправить за ${offer.price ?? ""} кредитов`, callback_data: `${MEDIA_CONFIRM_CALLBACK}${offer.token}` }]] }
        : undefined;

    const parts = splitTelegramText(message.content);
    for (let i = 0; i < parts.length; i++) {
      // Кнопка — под последней частью.
      await api.sendMessage(chatId, parts[i], i === parts.length - 1 ? keyboard : undefined);
    }
  }

  /**
   * Фото/видео: вариант общего кэша — по file_id, если бот его уже загружал;
   * иначе загрузка байтами и сохранение полученного file_id.
   */
  private async sendMedia(
    api: TelegramApi,
    botId: string,
    chatId: string,
    type: string,
    mediaUrl: string,
    metadata: unknown,
  ): Promise<void> {
    const assetId = (metadata as { assetId?: unknown } | null)?.assetId;
    const send = (file: TgInputFile) => (type === "video" ? api.sendVideo(chatId, file) : api.sendPhoto(chatId, file));

    if (typeof assetId === "string") {
      const cached = await this.prisma.telegramFileCache.findUnique({
        where: { botId_assetId: { botId, assetId } },
        select: { fileId: true },
      });
      if (cached) {
        try {
          await send(cached.fileId);
          return;
        } catch (err) {
          // file_id больше не принимается — забываем его и загружаем заново.
          if (!(err instanceof TelegramApiError) || err.code !== 400) throw err;
          await this.prisma.telegramFileCache.deleteMany({ where: { botId, assetId } });
        }
      }
    }

    const sent = await send(await this.loadMedia(mediaUrl, type));
    const fileId = telegramFileId(sent);
    if (typeof assetId === "string" && fileId) {
      await this.prisma.telegramFileCache
        .createMany({ data: [{ botId, assetId, fileId }], skipDuplicates: true })
        .catch((err) => this.logger.warn(`telegram file cache save failed: ${err?.message}`));
    }
  }

  /** Байты медиа: из S3 по ключу media-прокси или по внешнему URL. */
  private async loadMedia(mediaUrl: string, type: string) {
    const isVideo = type === "video";
    const key = mediaKeyFromUrl(mediaUrl);
    let bytes: Buffer;
    let contentType: string | undefined;
    if (key) {
      const { body, contentType: ct } = await this.s3.getObject(key);
      bytes = await streamToBuffer(body);
      contentType = ct;
    } else {
      const proxied = mediaUrl.match(/\/media\/proxy\?(?:.*&)?url=([^&]+)/);
      const url = proxied ? decodeURIComponent(proxied[1]) : mediaUrl;
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`media download failed: ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") ?? undefined;
    }
    return {
      bytes,
      filename: isVideo ? "video.mp4" : "photo.jpg",
      contentType: contentType || (isVideo ? "video/mp4" : "image/jpeg"),
    };
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
