/**
 * @file media-cache.service.ts
 * @description Общий кэш медиа персонажа в чате (фото/видео на сайте и в Telegram).
 *
 * Одинаковый запрос (те же промпт, модель, стиль, формат) не генерируется заново:
 * - cacheKey = sha256 канонических параметров задания. Публичные/платформенные
 *   персонажи — scope PUBLIC (общий пул); приватный персонаж или свободный текст
 *   пользователя — scope OWNER (в ключ входит владелец, другим не выдаётся);
 * - пул вариантов: по ключу копятся готовые MediaAsset; пользователь получает
 *   самый старый вариант, которого ещё не видел (MediaDelivery). Видел все —
 *   генерируется новый, он пополняет пул;
 * - coalesce: пока по ключу идёт генерация другого пользователя, повторный запрос
 *   не запускает вторую, а ждёт эту (follower-задание) и получает тот же результат;
 * - цена выдачи из кэша — полная (как у генерации).
 *
 * Решение (hit / coalesce / miss) принимается под Redis-локом ключа — два
 * параллельных одинаковых запроса не запускают две генерации.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../prisma.service";
import { RedisLockService } from "../common/redis-lock.service";
import { WalletService, generationReservationKey } from "../billing/wallet.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { GenerationService, type ChatMediaTarget, type MediaCacheTag } from "./generation.service";
import type { ImageJobInput, VideoJobInput } from "./prompt/generation-spec.service";

/** Версия схемы ключа: смена состава/формата ключа → старые ассеты не выдаются. */
export const MEDIA_CACHE_KEY_VERSION = 2;

const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 150;
const LOCK_ATTEMPTS = 40;
/** Сколько ждать чужую генерацию: дольше — считаем её зависшей и генерируем сами. */
const LEASE_MS = { image: 10 * 60_000, video: 30 * 60_000 } as const;

/** Запрос медиа в чат (параметры задания уже собраны из спецификации). */
export interface CachedMediaRequest {
  kind: "image" | "video";
  userId: string;
  /** Персонаж чата: от его видимости зависит scope. */
  characterId?: string;
  /** Свободный текст пользователя в спецификации — кэш только для владельца. */
  hasUserText?: boolean;
  job: ImageJobInput | VideoJobInput;
  chat: ChatMediaTarget;
}

/** Итог запроса: id задания и, при выдаче из кэша, готовый результат. */
export interface CachedMediaResult {
  jobId: string;
  via: "generated" | "cache" | "coalesced" | "uncached";
  /** Есть при via=cache: задание уже завершено. */
  hit?: { assetId: string; output: { url: string } };
}

type CacheScope = MediaCacheTag["scope"];

/** Служебные слова, которые не меняют картинку: «on the beach» = «at the beach». */
const PROMPT_STOPWORDS = new Set([
  "a", "an", "the", "on", "at", "in", "into", "inside", "with", "of", "to", "by", "and",
  "her", "she", "is", "while", "wearing",
]);

/**
 * Промпт для ключа: фразы между запятыми без регистра, пунктуации и служебных
 * слов, без повторов и в отсортированном порядке — детали от классификатора
 * («on the beach» / «beach, at the beach») не должны давать разные ключи.
 */
export function normalizePrompt(prompt: string): string {
  const parts = prompt
    .toLowerCase()
    .split(/[,;\n]+/)
    .map((part) =>
      part
        .replace(/[.!?"]+/g, " ")
        .split(/\s+/)
        .filter((w) => w && !PROMPT_STOPWORDS.has(w))
        .join(" "),
    )
    .filter(Boolean);
  return [...new Set(parts)].sort().join(", ");
}

/** Ключ кэша по параметрам задания или null, если запрос не кэшируется. */
export function mediaCacheKey(
  kind: "image" | "video",
  job: ImageJobInput | VideoJobInput,
  scope: CacheScope,
  ownerUserId: string,
): string | null {
  const j = job as Partial<ImageJobInput> & Partial<VideoJobInput>;
  // Несколько вариантов за раз, img2img и видео из медиа — уникальны, не кэшируем.
  if ((j.count ?? 1) > 1 || j.initImageUrl || j.initImageKey || j.initVideoKey) return null;
  if (j.mode && j.mode !== "scratch") return null;
  // Явный seed — пользователь хочет конкретный кадр; пул вариантов не подходит.
  if (typeof j.seed === "number") return null;
  const canonical = {
    v: MEDIA_CACHE_KEY_VERSION,
    kind,
    // Регистр, пробелы и точки не меняют картинку — не дробим из-за них пул.
    prompt: normalizePrompt(j.prompt ?? ""),
    negativePrompt: j.negativePrompt?.trim() || null,
    model: j.model ?? null,
    provider: j.provider ?? null,
    generationStyle: j.generationStyle ?? null,
    aspectRatio: j.aspectRatio ?? null,
    contentMode: j.contentMode === "sfw" ? "sfw" : "nsfw",
    hiresFix: j.hiresFix ? true : null,
    owner: scope === "OWNER" ? ownerUserId : null,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

@Injectable()
export class MediaCacheService {
  private readonly logger = new Logger(MediaCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: RedisLockService,
    private readonly generation: GenerationService,
    private readonly wallet: WalletService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** scope кэша: общий только для публичных (в т.ч. платформенных) персонажей и без свободного текста. */
  async scopeFor(req: Pick<CachedMediaRequest, "characterId" | "hasUserText">): Promise<CacheScope> {
    if (req.hasUserText || !req.characterId) return "OWNER";
    const character = await this.prisma.character.findUnique({
      where: { id: req.characterId },
      select: { isPublic: true },
    });
    return character?.isPublic ? "PUBLIC" : "OWNER";
  }

  /**
   * Медиа для чата через кэш: вариант из пула, ожидание идущей генерации или
   * новая генерация. Кредиты резервируются/списываются в любом случае (полная цена).
   *
   * @throws InsufficientCreditsException — до создания задания
   */
  async request(req: CachedMediaRequest): Promise<CachedMediaResult> {
    const scope = await this.scopeFor(req);
    const result = await this.requestWithScope(req, scope);
    // Видно в логах api: почему фото сгенерировано заново, а не взято из кэша.
    this.logger.log(
      `chat media ${result.via}: user=${req.userId} scope=${scope} key=${mediaCacheKey(req.kind, req.job, scope, req.userId)?.slice(0, 12) ?? "-"} prompt="${(req.job.prompt ?? "").slice(0, 160)}"`,
    );
    // hit/miss/coalesced — для метрик кэша в продуктовой аналитике.
    this.analytics.capture(req.userId, "chat_media_cache", { kind: req.kind, via: result.via, scope, source: req.chat.source });
    return result;
  }

  private async requestWithScope(req: CachedMediaRequest, scope: CacheScope): Promise<CachedMediaResult> {
    const key = mediaCacheKey(req.kind, req.job, scope, req.userId);
    if (!key) return { jobId: await this.generate(req), via: "uncached" };

    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
      const res = await this.locks.withLock(`media-cache:${key}`, LOCK_TTL_MS, () => this.resolve(req, key, scope));
      if (res.acquired) return res.result;
      await new Promise((r) => setTimeout(r, LOCK_WAIT_MS));
    }
    // Ключ долго занят (сбой Redis/зависание) — генерируем без кэша, чтобы не блокировать пользователя.
    this.logger.warn(`media cache lock busy, generating without cache: ${key}`);
    return { jobId: await this.generate(req), via: "uncached" };
  }

  /** Решение под локом ключа: hit → coalesce → miss. */
  private async resolve(req: CachedMediaRequest, key: string, scope: CacheScope): Promise<CachedMediaResult> {
    // 1. Вариант из пула, который этот пользователь ещё не получал (самый старый).
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { cacheKey: key, moderation: "ok", deliveries: { none: { userId: req.userId } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, url: true, sourceJobId: true },
    });
    if (asset) {
      const output = { url: asset.url };
      const jobId = await this.generation.createDerivedJob(
        req.userId,
        { ...this.derivedBase(req), output, cachedFrom: asset.sourceJobId },
        { chat: req.chat, cache: { key, scope, role: "hit", assetId: asset.id } },
      );
      await this.recordDelivery(asset.id, req.userId, jobId, "cache");
      return { jobId, via: "cache", hit: { assetId: asset.id, output } };
    }

    // 2. Идущая генерация другого пользователя — ждём её результат.
    const pending = await this.prisma.generationRequest.findFirst({
      where: { cacheKey: key, status: "pending", leaseUntil: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { leaderJobId: true },
    });
    if (pending && !(await this.isWaitingFor(pending.leaderJobId, req.userId))) {
      const jobId = await this.generation.createDerivedJob(req.userId, { ...this.derivedBase(req), cachedFrom: pending.leaderJobId }, {
        chat: req.chat,
        cache: { key, scope, role: "follower", leaderJobId: pending.leaderJobId },
      });
      return { jobId, via: "coalesced" };
    }

    // 3. Новая генерация — пополнит пул.
    const jobId = await this.generate(req, { key, scope, role: "leader" });
    await this.prisma.generationRequest.create({
      data: { cacheKey: key, leaderJobId: jobId, leaseUntil: new Date(Date.now() + LEASE_MS[req.kind]) },
    });
    return { jobId, via: "generated" };
  }

  /**
   * Пользователь уже получит результат этой генерации (он её запустил или уже ждёт) —
   * второй раз тот же вариант ему не выдаём, нужна новая генерация.
   */
  private async isWaitingFor(leaderJobId: string, userId: string): Promise<boolean> {
    const own = await this.prisma.aiJob.findFirst({
      where: {
        userId,
        OR: [{ id: leaderJobId }, { input: { path: ["cache", "leaderJobId"], equals: leaderJobId } }],
      },
      select: { id: true },
    });
    return own !== null;
  }

  /** Обычная генерация у провайдера. */
  private async generate(req: CachedMediaRequest, cache?: MediaCacheTag): Promise<string> {
    const opts = { chat: req.chat, ...(cache ? { cache } : {}) };
    const res =
      req.kind === "video"
        ? await this.generation.createVideoJob(req.userId, req.job as VideoJobInput, opts)
        : await this.generation.createImageJob(req.userId, req.job as ImageJobInput, opts);
    return res.jobId;
  }

  /** Параметры задания без провайдера — копия параметров исходного запроса. */
  private derivedBase(req: CachedMediaRequest) {
    const j = req.job as Partial<ImageJobInput> & Partial<VideoJobInput>;
    const model = j.model;
    return {
      kind: req.kind,
      op: req.kind === "video" ? { kind: "video" as const, model } : { kind: "image" as const, model, hiresFix: j.hiresFix },
      contentMode: j.contentMode === "sfw" ? ("sfw" as const) : ("nsfw" as const),
      characterId: j.characterId,
      input: JSON.parse(
        JSON.stringify({
          prompt: j.prompt,
          negativePrompt: j.negativePrompt,
          model,
          provider: j.provider,
          generationStyle: j.generationStyle,
          aspectRatio: j.aspectRatio,
          mode: j.mode,
        }),
      ) as Prisma.InputJsonObject,
    };
  }

  /**
   * Завершение генерации-лидера: результат становится вариантом пула, ожидающие
   * задания завершаются тем же результатом (с полным списанием их резервов).
   *
   * @param beforeFollowerComplete — вызывается до перевода ожидающего задания в
   *   completed (создать медиасообщение: клиент, увидев completed, перечитывает ленту)
   * @returns assetId (для метаданных сообщения) и id завершённых ожидающих заданий
   */
  async onJobCompleted(
    aiJobId: string,
    output: unknown,
    beforeFollowerComplete?: (followerJobId: string, assetId: string) => Promise<void>,
  ): Promise<{ assetId: string | null; followerJobIds: string[] }> {
    const job = await this.prisma.aiJob.findUnique({
      where: { id: aiJobId },
      select: { userId: true, type: true, input: true, characterId: true },
    });
    const input = (job?.input ?? {}) as { cache?: MediaCacheTag; prompt?: string; chat?: ChatMediaTarget };
    const cache = input.cache;
    if (!job || !cache) return { assetId: null, followerJobIds: [] };
    if (cache.role === "hit") return { assetId: cache.assetId ?? null, followerJobIds: [] };
    if (cache.role !== "leader") return { assetId: null, followerJobIds: [] };

    const url = (output as { url?: unknown } | null)?.url;
    if (typeof url !== "string") return { assetId: null, followerJobIds: [] };

    const chatSpec = input.chat?.spec as { characterId?: unknown } | undefined;
    const asset = await this.prisma.mediaAsset.upsert({
      where: { sourceJobId: aiJobId },
      update: {},
      create: {
        cacheKey: cache.key,
        kind: job.type === "video" ? "video" : "image",
        url,
        scope: cache.scope,
        ownerUserId: cache.scope === "OWNER" ? job.userId : null,
        characterId: job.characterId ?? (typeof chatSpec?.characterId === "string" ? chatSpec.characterId : null),
        sourceJobId: aiJobId,
        prompt: input.prompt ?? null,
      },
      select: { id: true },
    });
    await this.recordDelivery(asset.id, job.userId, aiJobId, "generated");
    await this.prisma.generationRequest.updateMany({
      where: { leaderJobId: aiJobId },
      data: { status: "ready", assetId: asset.id },
    });

    const followerJobIds: string[] = [];
    for (const follower of await this.pendingFollowers(aiJobId)) {
      await beforeFollowerComplete?.(follower.id, asset.id);
      const done = await this.prisma.aiJob.updateMany({
        where: { id: follower.id, status: "pending" },
        data: { status: "completed", output: { url } as Prisma.InputJsonObject, completedAt: new Date() },
      });
      if (done.count === 0) continue;
      await this.wallet.capture(generationReservationKey(follower.id));
      await this.recordDelivery(asset.id, follower.userId, follower.id, "coalesced");
      followerJobIds.push(follower.id);
    }
    return { assetId: asset.id, followerJobIds };
  }

  /** Генерация-лидер не удалась: ожидающие задания тоже завершаются ошибкой, резервы возвращаются. */
  async onJobFailed(aiJobId: string, error?: string): Promise<string[]> {
    await this.prisma.generationRequest.updateMany({ where: { leaderJobId: aiJobId, status: "pending" }, data: { status: "failed" } });
    const failed: string[] = [];
    for (const follower of await this.pendingFollowers(aiJobId)) {
      const res = await this.prisma.aiJob.updateMany({
        where: { id: follower.id, status: "pending" },
        data: { status: "failed", error: error ?? "generation failed", completedAt: new Date() },
      });
      if (res.count === 0) continue;
      await this.wallet.release(generationReservationKey(follower.id), "generation_failed");
      failed.push(follower.id);
    }
    return failed;
  }

  private pendingFollowers(leaderJobId: string) {
    return this.prisma.aiJob.findMany({
      where: { status: "pending", input: { path: ["cache", "leaderJobId"], equals: leaderJobId } },
      select: { id: true, userId: true },
    });
  }

  private async recordDelivery(assetId: string, userId: string, aiJobId: string, via: string): Promise<void> {
    await this.prisma.mediaDelivery.createMany({ data: [{ assetId, userId, aiJobId, via }], skipDuplicates: true });
  }

  // ─── Админка ───────────────────────────────────────────────

  /** Статистика за период: сколько выдано генерацией, из кэша, через ожидание. */
  async stats(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);
    const [byVia, assets, blocked, pending] = await Promise.all([
      this.prisma.mediaDelivery.groupBy({ by: ["via"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.mediaAsset.count(),
      this.prisma.mediaAsset.count({ where: { moderation: "blocked" } }),
      this.prisma.generationRequest.count({ where: { status: "pending", leaseUntil: { gt: new Date() } } }),
    ]);
    const count = (via: string) => byVia.find((r) => r.via === via)?._count._all ?? 0;
    const generated = count("generated");
    const cache = count("cache");
    const coalesced = count("coalesced");
    const total = generated + cache + coalesced;
    return {
      days,
      deliveries: { generated, cache, coalesced, total },
      // Доля выдач без обращения к провайдеру = сэкономленные генерации.
      hitRate: total ? (cache + coalesced) / total : 0,
      savedGenerations: cache + coalesced,
      assets,
      blocked,
      pendingGenerations: pending,
    };
  }

  /** Список вариантов (новые сверху) с числом выдач. */
  async listAssets(params: { page?: number; limit?: number; moderation?: string; kind?: string }) {
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.MediaAssetWhereInput = {
      ...(params.moderation ? { moderation: params.moderation } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { deliveries: true } } },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return {
      total,
      page,
      limit,
      items: await Promise.all(
        items.map(async (a) => ({
          id: a.id,
          kind: a.kind,
          url: (await this.generation.toClientMediaUrl(a.url)) ?? a.url,
          scope: a.scope,
          moderation: a.moderation,
          characterId: a.characterId,
          prompt: a.prompt,
          deliveries: a._count.deliveries,
          createdAt: a.createdAt,
        })),
      ),
    };
  }

  /** Блокировка варианта: больше не выдаётся из кэша (уже отправленные сообщения не трогаем). */
  async setModeration(assetId: string, moderation: "ok" | "blocked") {
    return this.prisma.mediaAsset.update({ where: { id: assetId }, data: { moderation }, select: { id: true, moderation: true } });
  }
}
