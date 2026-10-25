/**
 * @file chat-media.service.ts
 * @description Фото и видео персонажа в чате, полностью на сервере:
 *
 * - start(): спецификация → задание генерации с привязкой к диалогу (кредиты
 *   резервирует GenerationService, лимиты — DemoService);
 * - дорогие операции (видео; всё дороже MEDIA_CONFIRM_ABOVE_CREDITS) сначала
 *   требуют подтверждения цены: одноразовый токен в Redis → confirm();
 * - saveCompletedMedia(): по завершении задания сервер сам создаёт медиасообщение
 *   в диалоге (раньше это делал браузер — и фото терялось, если вкладку закрыли).
 */

import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import type Redis from "ioredis";
import { PrismaService } from "../prisma.service";
import { REDIS } from "../common/redis.constants";
import { ChatsService } from "../chats/chats.service";
import { DemoService } from "../demo/demo.service";
import { GenerationService, type ChatMediaTarget } from "../generation/generation.service";
import { GenerationSpecService, CHAT_VIDEO_MODEL } from "../generation/prompt/generation-spec.service";
import { parseGenerationSpec, type GenerationSpec } from "../generation/prompt/generation-spec";
import { PricingService } from "../billing/pricing.service";
import { BillingConfigService } from "../billing/billing-config.service";
import type { ConversationActor } from "./conversation.types";

/** Срок жизни предложения подтвердить цену. */
const CONFIRM_TTL_SECONDS = 15 * 60;
const CONFIRM_KEY_PREFIX = "media-confirm:";

/** Отложенная операция, ждущая подтверждения цены. */
interface PendingConfirmation {
  chatId: string;
  userId: string;
  spec: GenerationSpec;
  caption: string;
  source: string;
  price: number;
  /** Сообщение ассистента с предложением — отмечается подтверждённым. */
  messageId?: string;
}

/** Запущенная генерация медиа. */
export interface StartedMedia {
  kind: "image" | "video";
  jobId: string;
}

@Injectable()
export class ChatMediaService {
  private readonly logger = new Logger(ChatMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly demo: DemoService,
    private readonly generation: GenerationService,
    private readonly specs: GenerationSpecService,
    private readonly pricing: PricingService,
    private readonly billingConfig: BillingConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Стоимость медиа по спецификации в кредитах. */
  async quote(spec: GenerationSpec, userId: string): Promise<number> {
    if (spec.kind === "video") {
      return (await this.pricing.quote({ kind: "video", model: CHAT_VIDEO_MODEL })).amount;
    }
    const job = await this.specs.toImageJob(spec, userId);
    return (await this.pricing.quote({ kind: "image", model: job.model, hiresFix: job.hiresFix })).amount;
  }

  /** Нужно ли подтверждение цены: видео всегда, остальное — дороже порога. */
  async needsConfirmation(kind: "image" | "video", price: number): Promise<boolean> {
    return kind === "video" || price > (await this.billingConfig.mediaConfirmAbove());
  }

  /**
   * Запускает генерацию медиа в диалоге.
   *
   * @param caption — подпись будущего медиасообщения (название позы и т.п.)
   * @throws 402 INSUFFICIENT_CREDITS / 403 FREE_LIMIT_REACHED — до постановки задания
   */
  async start(
    chatId: string,
    actor: ConversationActor,
    spec: GenerationSpec,
    opts: { caption: string; source: string },
  ): Promise<StartedMedia> {
    const target: ChatMediaTarget = {
      sessionId: chatId,
      caption: opts.caption,
      source: opts.source,
      spec: spec as unknown as Prisma.InputJsonObject,
    };
    if (spec.kind === "video") {
      await this.demo.checkVideoGeneration(actor.id, actor.subscription, 1);
      const job = await this.specs.toVideoJob(spec, actor.id);
      const { jobId } = await this.generation.createVideoJob(actor.id, job, { chat: target });
      return { kind: "video", jobId };
    }
    await this.demo.checkImageGeneration(actor.id, actor.subscription, 1);
    const job = await this.specs.toImageJob(spec, actor.id);
    const { jobId } = await this.generation.createImageJob(actor.id, job, { chat: target });
    return { kind: "image", jobId };
  }

  /** Сохраняет отложенную операцию и возвращает одноразовый токен подтверждения. */
  async createConfirmation(pending: PendingConfirmation): Promise<string> {
    const token = randomUUID();
    await this.redis.set(CONFIRM_KEY_PREFIX + token, JSON.stringify(pending), "EX", CONFIRM_TTL_SECONDS);
    return token;
  }

  /** Привязывает к токену сообщение-предложение (чтобы отметить его после подтверждения). */
  async attachConfirmationMessage(token: string, messageId: string): Promise<void> {
    const key = CONFIRM_KEY_PREFIX + token;
    const raw = await this.redis.get(key);
    if (!raw) return;
    const ttl = await this.redis.ttl(key);
    await this.redis.set(key, JSON.stringify({ ...JSON.parse(raw), messageId }), "EX", Math.max(ttl, 1));
  }

  /**
   * Подтверждение цены: токен одноразовый (GETDEL), принадлежит этому диалогу и пользователю.
   * @throws 404 — токен истёк, уже использован или чужой
   */
  async confirm(chatId: string, actor: ConversationActor, token: string): Promise<StartedMedia> {
    const raw = await this.redis.getdel(CONFIRM_KEY_PREFIX + token);
    const pending = raw ? (JSON.parse(raw) as PendingConfirmation) : null;
    if (!pending || pending.chatId !== chatId || pending.userId !== actor.id) {
      throw new NotFoundException({ error: "MEDIA_CONFIRMATION_EXPIRED", message: "Предложение устарело" });
    }
    let started: StartedMedia;
    try {
      started = await this.start(chatId, actor, pending.spec, { caption: pending.caption, source: pending.source });
    } catch (err) {
      // Не хватило кредитов/лимита — даём подтвердить снова после пополнения.
      await this.redis.set(CONFIRM_KEY_PREFIX + token, raw!, "EX", CONFIRM_TTL_SECONDS).catch(() => undefined);
      throw err;
    }
    if (pending.messageId) await this.markConfirmed(pending.messageId, started.jobId);
    return started;
  }

  /**
   * Создаёт медиасообщение в диалоге по завершённому заданию (вызывается при
   * PATCH /internal/ai-jobs/:id со статусом completed). Повтор — без дубля
   * (externalId = aijob:<id>).
   */
  async saveCompletedMedia(aiJobId: string, output: unknown): Promise<void> {
    const job = await this.prisma.aiJob.findUnique({ where: { id: aiJobId }, select: { type: true, input: true } });
    const chat = (job?.input as { chat?: ChatMediaTarget } | null)?.chat;
    const rawUrl = (output as { url?: unknown } | null)?.url;
    if (!job || !chat?.sessionId || typeof rawUrl !== "string") return;

    const mediaUrl = await this.generation.toClientMediaUrl(rawUrl);
    const kind = job.type === "video" ? "video" : "image";
    try {
      // Нейтральная подпись (её видно в превью списка чатов); детали — в metadata.
      await this.chats.saveMessage(chat.sessionId, "assistant", kind === "video" ? "🎬" : "📷", {
        type: kind,
        mediaUrl: mediaUrl ?? rawUrl,
        // spec — для перегенерации того же фото/видео кнопкой в ленте.
        metadata: { poseName: chat.caption, type: `generated-${kind}`, aiJobId, ...(chat.spec ? { spec: chat.spec } : {}) },
        source: chat.source,
        externalId: `aijob:${aiJobId}`,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // уже сохранено
      this.logger.error(`failed to save chat media for job ${aiJobId}: ${(err as Error).message}`);
    }
  }

  /**
   * Перегенерация фото/видео из ленты: та же спецификация, новый кадр.
   * Для старых сообщений без сохранённой спецификации — по позе из подписи.
   *
   * @param characterId — персонаж чата (спецификация всегда для него)
   * @param contentMode — текущий режим контента пользователя
   * @throws 404 — сообщение не найдено или это не медиа персонажа
   */
  async regenerate(
    chatId: string,
    actor: ConversationActor,
    messageId: string,
    characterId: string,
    contentMode: "nsfw" | "sfw",
  ): Promise<StartedMedia> {
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null, role: "assistant", type: { in: ["image", "video"] } },
      select: { type: true, metadata: true },
    });
    if (!msg) throw new NotFoundException("Media message not found");

    const kind = msg.type === "video" ? "video" : "image";
    const meta = (msg.metadata ?? {}) as { spec?: Record<string, unknown>; poseName?: unknown };
    const poseName = typeof meta.poseName === "string" ? meta.poseName : undefined;
    const base = { kind, preset: "chat", characterId, contentMode };
    const spec = meta.spec
      ? parseGenerationSpec({ ...meta.spec, ...base })
      : parseGenerationSpec({
          ...base,
          // Подпись «photo»/«video» — не поза (фото по просьбе без сохранённой спецификации).
          ...(poseName && poseName !== "photo" && poseName !== "video" ? { pose: { poses: [poseName] } } : {}),
        });
    return this.start(chatId, actor, spec, { caption: poseName || (kind === "video" ? "video" : "photo"), source: "web" });
  }

  /** Отмечает предложение подтверждённым (кнопка в интерфейсе скрывается). */
  private async markConfirmed(messageId: string, jobId: string): Promise<void> {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
    const metadata = (msg?.metadata ?? {}) as Record<string, unknown>;
    const confirm = (metadata.mediaConfirm ?? {}) as Record<string, unknown>;
    await this.prisma.message.update({
      where: { id: messageId },
      data: { metadata: { ...metadata, mediaConfirm: { ...confirm, status: "confirmed", jobId } } as Prisma.InputJsonValue },
    });
  }

}
