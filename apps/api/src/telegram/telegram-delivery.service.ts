/**
 * @file telegram-delivery.service.ts
 * @description Доставка сообщений персонажа в Telegram — подписчик outbox
 * (событие message.created).
 *
 * Доставляются только ответы ассистента на сообщения из Telegram (source =
 * telegram): ответ модели, уточняющий вопрос, предложение цены (с кнопкой) и
 * готовые фото/видео. Сообщения, написанные на сайте, в Telegram не дублируются.
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
import { TelegramApi, TelegramApiError, type InlineKeyboard } from "./telegram-api";
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
    if (payload.source !== "telegram" || payload.role !== "assistant") return;

    const message = await this.prisma.message.findUnique({
      where: { id: payload.messageId },
      select: { content: true, type: true, mediaUrl: true, metadata: true, deletedAt: true, chatSessionId: true },
    });
    if (!message || message.deletedAt) return;

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
        await this.send(this.bots.apiFor(recipient.bot), recipient.chatId, message);
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
    chatId: string,
    message: { content: string; type: string; mediaUrl: string | null; metadata: unknown },
  ): Promise<void> {
    if ((message.type === "image" || message.type === "video") && message.mediaUrl) {
      const file = await this.loadMedia(message.mediaUrl, message.type);
      if (message.type === "video") await api.sendVideo(chatId, file);
      else await api.sendPhoto(chatId, file);
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
