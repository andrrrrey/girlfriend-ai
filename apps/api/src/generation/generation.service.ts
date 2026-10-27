import { Inject, Injectable, Logger } from "@nestjs/common";
import { GALLERY_TAGS, promptMatchesTag, styleCondition, tagsCondition } from "./gallery-filters";
import { Queue } from "bullmq";
import { AI_QUEUE } from "../queue/queue.module";
import { JOB_NAMES } from "../queue/queue.types";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import type { Prisma } from "@prisma/client";
import { IMAGE_MODELS, VIDEO_MODELS, VIDEO_MODE_DEFAULT_MODEL } from "./models";
import { randomUUID } from "crypto";
import { WalletService, generationReservationKey } from "../billing/wallet.service";
import type { BillableOperation } from "../billing/pricing";
import type { ImageJobData, VideoJobData } from "../queue/queue.types";
import { loadEnv } from "@repo/config";
import { resolveEnabledGenders } from "../common/genders";
import { currentBillingContext } from "../billing/billing-context";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

const CYRILLIC_RE = /[а-яА-ЯёЁ]/;

/** Допустимое количество элементов за одну генерацию (создаётся N заданий). */
const ALLOWED_GEN_COUNTS = [1, 4, 8, 16];

/** Параметры постановки задания генерации. */
export interface GenerationJobOptions {
  /** false — служебная генерация админки, без списания кредитов. */
  billable?: boolean;
  /**
   * Генерация для чата: по завершении сервер сам создаёт медиасообщение
   * в этом диалоге (см. ChatMediaService), клиенту ничего сохранять не нужно.
   */
  chat?: ChatMediaTarget;
  /** Генерация под общий кэш медиа: результат станет вариантом в пуле (см. MediaCacheService). */
  cache?: MediaCacheTag;
}

/**
 * Пометка задания для общего кэша медиа (JSON в AiJob.input.cache).
 * role: leader — реальная генерация; follower — ждёт генерацию leaderJobId;
 * hit — выдано из кэша (assetId).
 */
export type MediaCacheTag = {
  key: string;
  scope: "PUBLIC" | "OWNER";
  role: "leader" | "follower" | "hit";
  leaderJobId?: string;
  assetId?: string;
};

/** Задание без обращения к провайдеру: выдача из кэша или ожидание идущей генерации. */
export interface DerivedJobParams {
  kind: "image" | "video";
  /** Операция для резерва кредитов (цена — как у обычной генерации). */
  op: BillableOperation;
  contentMode: "nsfw" | "sfw";
  characterId?: string;
  /** Поля AiJob.input (промпт, модель…) — как у исходного задания. */
  input: Prisma.InputJsonObject;
  /** Готовый результат: задание сразу completed, кредиты списываются. Без него — pending. */
  output?: Prisma.InputJsonObject;
  /** Задание, чей результат копируется (в публичные ленты копия не попадает). */
  cachedFrom: string;
}

/**
 * Куда положить результат генерации в чате. Тип-алиас (не interface) — чтобы
 * значение можно было записать в JSON-поле AiJob.input.
 */
export type ChatMediaTarget = {
  sessionId: string;
  /** Подпись медиасообщения (например, название позы). */
  caption: string;
  /** Канал, из которого пришёл запрос: web | telegram … */
  source: string;
  /** Спецификация генерации (JSON) — по ней медиа можно перегенерировать. */
  spec?: Prisma.InputJsonObject;
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
    private readonly s3: S3Service,
    private readonly wallet: WalletService,
  ) {}

  /**
   * Резервирует кредиты под N заданий генерации до постановки в очередь.
   * id заданий генерируются заранее — по ним строятся ключи резервов, а воркер
   * потом списывает/возвращает кредиты по id AiJob. Если на k-м задании не хватило
   * кредитов — уже взятые резервы возвращаются, задания не создаются.
   *
   * @param billable — false для служебных генераций админки (без списаний)
   * @returns заранее сгенерированные id заданий
   */
  private async reserveJobs(userId: string, op: BillableOperation, count: number, billable: boolean): Promise<string[]> {
    const ids = Array.from({ length: count }, () => randomUUID());
    if (!billable) return ids;
    const reserved: string[] = [];
    try {
      for (const id of ids) {
        const handle = await this.wallet.reserveOperation(userId, op, generationReservationKey(id), id);
        if (handle) reserved.push(handle.operationKey);
      }
    } catch (err) {
      for (const key of reserved) await this.wallet.release(key, "batch_rejected").catch(() => false);
      throw err;
    }
    return ids;
  }

  /** Возвращает резерв задания, которое не удалось создать или поставить в очередь. */
  private async releaseJob(jobId: string): Promise<void> {
    await this.wallet.release(generationReservationKey(jobId), "enqueue_failed").catch(() => false);
  }

  /** Возвращает публичный URL объекта S3 через /media/stream. */
  private keyToStreamUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    return `/api-proxy/media/stream?key=${encodeURIComponent(key)}`;
  }

  /** Добавляет imageThumbUrl/imageFullUrl к опции на основе ключей S3. */
  private withOptionImageUrls<T extends { imageThumbKey?: string | null; imageFullKey?: string | null }>(
    opt: T,
  ): T & { imageThumbUrl: string | null; imageFullUrl: string | null } {
    return {
      ...opt,
      imageThumbUrl: this.keyToStreamUrl(opt.imageThumbKey),
      imageFullUrl: this.keyToStreamUrl(opt.imageFullKey),
    };
  }

  /**
   * URL изображения, доступный внешнему провайдеру (подписанный S3 URL): для
   * img2img и для описания аватара моделью со зрением.
   */
  async toProviderImageUrl(url: string | undefined | null): Promise<string | undefined> {
    return this.toPublicImageUrl(url);
  }

  /** URL результата генерации в том виде, в каком его получает клиент (через media-прокси). */
  async toClientMediaUrl(url: string | undefined | null): Promise<string | null> {
    return this.toSignedUrl(url);
  }

  /** Заменяет S3 URL на путь через media-прокси API. Внешние URL проксируются через /media/proxy. */
  private async toSignedUrl(url: string | undefined | null): Promise<string | null> {
    if (!url) return null;
    const publicBase = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
    if (publicBase) {
      const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
      if (key) return `/api-proxy/media/stream?key=${encodeURIComponent(key)}`;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return `/api-proxy/media/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  /** Заменяет url в объекте output на presigned, возвращает новый output. */
  private async signOutput(output: unknown): Promise<unknown> {
    if (!output || typeof output !== "object") return output;
    const o = output as Record<string, unknown>;
    if (typeof o["url"] === "string") {
      return { ...o, url: await this.toSignedUrl(o["url"] as string) };
    }
    return output;
  }

  private async translateToEnglish(text: string): Promise<string> {
    try {
      const res = await fetch(`${AI_BASE}/ai/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang: "English" }),
      });
      if (!res.ok) {
        this.logger.warn(`Translation failed with status ${res.status}, using original prompt`);
        return text;
      }
      const data = await res.json() as { translated: string };
      return data.translated || text;
    } catch (err) {
      this.logger.warn(`Translation request failed, using original prompt: ${err}`);
      return text;
    }
  }

  /**
   * Превращает URL аватара персонажа (как его знает фронт) в публично доступный
   * URL для img2img: фронт хранит проксированный путь вида
   * `/api-proxy/media/stream?key=...`, который внешний AI-провайдер (ModelsLab)
   * скачать не может. Достаём S3-ключ и подписываем прямой GET-URL.
   */
  private async toPublicImageUrl(url: string | undefined | null): Promise<string | undefined> {
    if (!url) return undefined;
    try {
      // Вытаскиваем ключ из `?key=...` (наш media-прокси).
      const keyMatch = url.match(/[?&]key=([^&]+)/);
      if (keyMatch) {
        const key = decodeURIComponent(keyMatch[1]);
        return await this.s3.getSignedUrl(key);
      }
      // Прямой S3 URL → извлекаем ключ и подписываем.
      const publicBase = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
      if (publicBase) {
        const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
        if (key) return await this.s3.getSignedUrl(key);
      }
      // Внешний http(s) URL — отдаём как есть.
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
    } catch (err) {
      this.logger.warn(`Failed to build public init image url: ${err}`);
    }
    return undefined;
  }

  async createImageJob(
    userId: string,
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string; provider?: string; generationStyle?: string; count?: number; initImageUrl?: string; characterId?: string; seed?: number; contentMode?: "nsfw" | "sfw"; denoise?: number; engine?: "sdxl" | "kontext"; hiresFix?: boolean },
    opts: GenerationJobOptions = {},
  ) {
    let prompt = data.prompt;
    const originalPrompt = data.prompt;
    // Режим контента: sfw помечает джобу nsfw=false (скрыта в SFW-фидах) и
    // передаёт SFW-набор промптов в AI-сервис.
    const contentMode: "nsfw" | "sfw" = data.contentMode === "sfw" ? "sfw" : "nsfw";

    if (CYRILLIC_RE.test(prompt)) {
      this.logger.log("Cyrillic detected in prompt, translating to English");
      prompt = await this.translateToEnglish(prompt);
    }

    const resolvedProvider = data.provider || IMAGE_MODELS.find((m) => m.id === data.model)?.provider;
    const count = ALLOWED_GEN_COUNTS.includes(data.count as number) ? (data.count as number) : 1;
    // Для img2img конвертируем фото персонажа в публичный URL (один раз на запрос).
    const initImageUrl = await this.toPublicImageUrl(data.initImageUrl);
    // Grok (xAI) не принимает seed — стабильность внешности персонажа держим,
    // передавая его аватар референсом (Grok editImage). Только если нет явного
    // img2img-фото и модель — Grok-чекпоинт (закреплённый за персонажем AIR).
    let referenceImageUrl: string | undefined;
    if (!initImageUrl && data.characterId && /^urn:air:grok:/i.test(data.model || "")) {
      const character = await this.prisma.character.findUnique({
        where: { id: data.characterId },
        select: { avatarUrl: true },
      });
      referenceImageUrl = await this.toPublicImageUrl(character?.avatarUrl);
    }

    // Резерв кредитов под все N изображений — до создания заданий.
    const plannedIds = await this.reserveJobs(
      userId,
      { kind: "image", model: data.model, hiresFix: data.hiresFix },
      count,
      opts.billable !== false,
    );

    // Создаём N отдельных заданий (1 job → 1 изображение).
    const jobIds: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const aiJob = await this.prisma.aiJob.create({
          data: {
            id: plannedIds[i],
            userId,
            type: "image",
            status: "pending",
            characterId: data.characterId || null,
            nsfw: contentMode !== "sfw",
            endUserId: currentBillingContext()?.endUserId,
            input: {
              prompt,
              originalPrompt: originalPrompt !== prompt ? originalPrompt : undefined,
              negativePrompt: data.negativePrompt,
              model: data.model,
              aspectRatio: data.aspectRatio,
              provider: resolvedProvider,
              generationStyle: data.generationStyle,
              img2img: initImageUrl ? true : undefined,
              avatarReference: referenceImageUrl ? true : undefined,
              seed: data.seed,
              contentMode,
              denoise: data.denoise,
              hiresFix: data.hiresFix || undefined,
              reservationKey: opts.billable !== false ? generationReservationKey(plannedIds[i]) : undefined,
              chat: opts.chat,
              cache: opts.cache,
            },
          },
        });

        const jobData: ImageJobData = {
          jobId: aiJob.id,
          userId,
          prompt,
          negativePrompt: data.negativePrompt,
          aspectRatio: data.aspectRatio,
          model: data.model,
          provider: resolvedProvider,
          generationStyle: data.generationStyle,
          initImageUrl,
          referenceImageUrl,
          seed: data.seed,
          contentMode,
          denoise: data.denoise,
          engine: data.engine,
          hiresFix: data.hiresFix,
        };

        await this.queue.add(JOB_NAMES.IMAGE, jobData);
        jobIds.push(aiJob.id);
      } catch (err) {
        // Это и оставшиеся задания не созданы — возвращаем их резервы.
        for (const id of plannedIds.slice(i)) await this.releaseJob(id);
        throw err;
      }
    }

    return { jobId: jobIds[0], jobIds, status: "pending" };
  }

  /**
   * Создаёт задание без постановки в очередь провайдера (общий кэш медиа):
   * с output — сразу завершённое (выдача из кэша, кредиты списываются полностью),
   * без output — ожидающее чужую идущую генерацию (резерв, списание по её завершении).
   *
   * @returns id задания
   * @throws InsufficientCreditsException — до создания задания
   */
  async createDerivedJob(userId: string, params: DerivedJobParams, opts: GenerationJobOptions = {}): Promise<string> {
    const billable = opts.billable !== false;
    const [id] = await this.reserveJobs(userId, params.op, 1, billable);
    const reservationKey = billable ? generationReservationKey(id) : undefined;
    try {
      await this.prisma.aiJob.create({
        data: {
          id,
          userId,
          type: params.kind,
          status: params.output ? "completed" : "pending",
          characterId: params.characterId || null,
          nsfw: params.contentMode !== "sfw",
          cachedFrom: params.cachedFrom,
          endUserId: currentBillingContext()?.endUserId,
          input: { ...params.input, contentMode: params.contentMode, reservationKey, chat: opts.chat, cache: opts.cache },
          ...(params.output ? { output: params.output, completedAt: new Date() } : {}),
        },
      });
    } catch (err) {
      await this.releaseJob(id);
      throw err;
    }
    if (params.output && reservationKey) await this.wallet.capture(reservationKey);
    return id;
  }

  async getJobStatus(jobId: string, userId: string) {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status,
      output: await this.signOutput(job.output),
      input: job.input,
      error: job.error,
      createdAt: job.createdAt,
    };
  }

  /** Публично возвращает один завершённый медиа-элемент (image|video) по id — для шеринга. */
  async getPublicJob(jobId: string) {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, status: "completed", type: { in: ["image", "video"] } },
      include: {
        user: { select: { id: true, nickname: true, avatarUrl: true } },
      },
    });

    if (!job) return null;

    const input = job.input as Record<string, unknown> | null;
    return {
      jobId: job.id,
      type: job.type,
      output: await this.signOutput(job.output),
      input: input ? { prompt: input["prompt"], model: input["model"] } : {},
      createdAt: job.createdAt,
      user: job.user,
    };
  }

  async getImageStyles() {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: "ENABLED_IMAGE_MODELS" },
    });
    if (!setting) return IMAGE_MODELS;
    try {
      const enabledIds: string[] = JSON.parse(setting.value);
      const filtered = IMAGE_MODELS.filter((m) => enabledIds.includes(m.id));
      return filtered.length > 0 ? filtered : IMAGE_MODELS;
    } catch {
      return IMAGE_MODELS;
    }
  }

  getAllImageModels() {
    return IMAGE_MODELS;
  }

  async getEnabledGenders(): Promise<string[]> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: "ENABLED_GENDERS" },
    });
    return resolveEnabledGenders(setting?.value);
  }

  async getCharacterOptions(category?: string, mode?: string) {
    const sfw = mode === "sfw";
    const options = await this.prisma.characterOption.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(sfw ? { nsfw: false } : {}),
      },
      orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
    return options.map((o) => this.withOptionImageUrls(o));
  }

  async getAppearanceOptions(mode?: string) {
    const optionsWhere = mode === "sfw" ? { nsfw: false } : undefined;
    const categories = await this.prisma.appearanceCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { where: optionsWhere, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const mapped = categories.map((cat) => ({
      ...cat,
      options: cat.options.map((o) => this.withOptionImageUrls(o)),
    }));
    const result: { OUTFITS: typeof mapped; OUTFIT_DETAILS: typeof mapped } = {
      OUTFITS: [],
      OUTFIT_DETAILS: [],
    };
    for (const cat of mapped) {
      if (cat.tab === "OUTFITS") result.OUTFITS.push(cat);
      else if (cat.tab === "OUTFIT_DETAILS") result.OUTFIT_DETAILS.push(cat);
    }
    return result;
  }

  async getPoseOptions(mode?: string) {
    const optionsWhere = mode === "sfw" ? { nsfw: false } : undefined;
    const categories = await this.prisma.poseCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { where: optionsWhere, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const mapped = categories.map((cat) => ({
      ...cat,
      options: cat.options.map((o) => this.withOptionImageUrls(o)),
    }));
    const result: { FACIAL_EXPRESSION: typeof mapped; POSE: typeof mapped } = {
      FACIAL_EXPRESSION: [],
      POSE: [],
    };
    for (const cat of mapped) {
      if (cat.tab === "FACIAL_EXPRESSION") result.FACIAL_EXPRESSION.push(cat);
      else if (cat.tab === "POSE") result.POSE.push(cat);
    }
    return result;
  }

  async getSceneOptions(mode?: string) {
    const optionsWhere = mode === "sfw" ? { nsfw: false } : undefined;
    const categories = await this.prisma.sceneCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { where: optionsWhere, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const mapped = categories.map((cat) => ({
      ...cat,
      options: cat.options.map((o) => this.withOptionImageUrls(o)),
    }));
    const result: { LOCATION: typeof mapped } = { LOCATION: [] };
    for (const cat of mapped) {
      if (cat.tab === "LOCATION") result.LOCATION.push(cat);
    }
    return result;
  }

  async getCameraOptions(mode?: string) {
    const options = await this.prisma.cameraOption.findMany({
      where: mode === "sfw" ? { nsfw: false } : undefined,
      orderBy: [{ section: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
    const mapped = options.map((o) => this.withOptionImageUrls(o));
    const result: { FRAMING: typeof mapped; CAMERA_ANGLE: typeof mapped } = {
      FRAMING: [],
      CAMERA_ANGLE: [],
    };
    for (const opt of mapped) {
      if (opt.section === "FRAMING") result.FRAMING.push(opt);
      else if (opt.section === "CAMERA_ANGLE") result.CAMERA_ANGLE.push(opt);
    }
    return result;
  }

  async createVideoJob(
    userId: string,
    data: {
      prompt: string;
      negativePrompt?: string;
      model?: string;
      aspectRatio?: string;
      provider?: string;
      mode?: string;
      initImageKey?: string;
      initVideoKey?: string;
      count?: number;
      seed?: number;
      contentMode?: "nsfw" | "sfw";
      characterId?: string;
    },
    opts: GenerationJobOptions = {},
  ) {
    let prompt = data.prompt;
    const originalPrompt = data.prompt;

    if (CYRILLIC_RE.test(prompt)) {
      this.logger.log("Cyrillic detected in video prompt, translating to English");
      prompt = await this.translateToEnglish(prompt);
    }

    const mode = data.mode || "scratch";
    // Режим контента (nsfw|sfw) — независим от режима видео (scratch|img2vid).
    const contentMode: "nsfw" | "sfw" = data.contentMode === "sfw" ? "sfw" : "nsfw";
    // Для режимов img2vid/continue модель определяется режимом, если не задана явно.
    const model = data.model || VIDEO_MODE_DEFAULT_MODEL[mode];
    // Auto-detect provider from model if not explicitly set
    const provider = data.provider || VIDEO_MODELS.find((m) => m.id === model)?.provider || "modelslab";
    const count = ALLOWED_GEN_COUNTS.includes(data.count as number) ? (data.count as number) : 1;

    // Резерв кредитов под все N видео — до создания заданий.
    const plannedIds = await this.reserveJobs(userId, { kind: "video", model }, count, opts.billable !== false);

    const jobIds: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const aiJob = await this.prisma.aiJob.create({
          data: {
            id: plannedIds[i],
            userId,
            type: "video",
            status: "pending",
            characterId: data.characterId || null,
            nsfw: contentMode !== "sfw",
            endUserId: currentBillingContext()?.endUserId,
            input: {
              prompt,
              originalPrompt: originalPrompt !== prompt ? originalPrompt : undefined,
              negativePrompt: data.negativePrompt,
              model,
              aspectRatio: data.aspectRatio,
              provider,
              mode,
              initImageKey: data.initImageKey,
              initVideoKey: data.initVideoKey,
              seed: data.seed,
              contentMode,
              reservationKey: opts.billable !== false ? generationReservationKey(plannedIds[i]) : undefined,
              chat: opts.chat,
              cache: opts.cache,
            },
          },
        });

        const jobData: VideoJobData = {
          jobId: aiJob.id,
          userId,
          prompt,
          negativePrompt: data.negativePrompt,
          aspectRatio: data.aspectRatio,
          model,
          provider,
          mode,
          initImageKey: data.initImageKey,
          initVideoKey: data.initVideoKey,
          seed: data.seed,
          contentMode,
        };

        await this.queue.add(JOB_NAMES.VIDEO, jobData);
        jobIds.push(aiJob.id);
      } catch (err) {
        // Это и оставшиеся задания не созданы — возвращаем их резервы.
        for (const id of plannedIds.slice(i)) await this.releaseJob(id);
        throw err;
      }
    }

    return { jobId: jobIds[0], jobIds, status: "pending" };
  }

  async getVideoStyles() {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: "ENABLED_VIDEO_MODELS" },
    });
    if (!setting) return VIDEO_MODELS;
    try {
      const enabledIds: string[] = JSON.parse(setting.value);
      const filtered = VIDEO_MODELS.filter((m) => enabledIds.includes(m.id));
      return filtered.length > 0 ? filtered : VIDEO_MODELS;
    } catch {
      return VIDEO_MODELS;
    }
  }

  getAllVideoModels() {
    return VIDEO_MODELS;
  }

  async getHistory(userId: string, type?: string) {
    const where: { userId: string; status: string; type?: string | { in: string[] } } = {
      userId,
      status: "completed",
    };
    if (type && (type === "image" || type === "video")) {
      where.type = type;
    } else {
      where.type = { in: ["image", "video"] };
    }

    const jobs = await this.prisma.aiJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return Promise.all(jobs.map(async (job) => ({
      jobId: job.id,
      type: job.type,
      output: await this.signOutput(job.output),
      input: job.input,
      createdAt: job.createdAt,
    })));
  }

  async getGallery(limit = 50, type?: string, sortBy?: string, page = 1, userId?: string, gender?: string, style?: string, mode?: string, tags?: string[]) {
    const typeFilter = type === "image" || type === "video"
      ? type
      : { in: ["image", "video"] as string[] };

    const skip = (page - 1) * limit;

    let orderBy: { createdAt: "desc" | "asc" } = { createdAt: "desc" };
    if (sortBy === "oldest") {
      orderBy = { createdAt: "asc" };
    }

    const where: Record<string, unknown> = {
      status: "completed" as const,
      type: typeFilter,
      // Медиа клиентов бота владельца (RESELLER) не показываются ни владельцу, ни в ленте.
      endUserId: null,
    };
    if (userId) {
      where["userId"] = userId;
    } else {
      // Копии из общего кэша медиа — тот же кадр, что у исходного задания: без дублей в ленте.
      where["cachedFrom"] = null;
    }
    // Режим контента задаёт класс: SFW → только nsfw=false, NSFW → только
    // nsfw=true; без режима не фильтруем.
    if (mode === "sfw") {
      where["nsfw"] = false;
    } else if (mode === "nsfw") {
      where["nsfw"] = true;
    }

    const andConditions: Record<string, unknown>[] = [];
    if (gender) {
      andConditions.push({ input: { path: ["prompt"], string_contains: gender.toLowerCase() } });
    }
    if (style) {
      const cond = styleCondition(style);
      if (cond) andConditions.push(cond);
    }
    if (tags?.length) {
      const cond = tagsCondition(tags);
      if (cond) andConditions.push(cond);
    }
    if (andConditions.length > 0) {
      where["AND"] = andConditions;
    }

    const [jobs, total] = await Promise.all([
      this.prisma.aiJob.findMany({
        where,
        orderBy,
        take: limit,
        skip,
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true } },
        },
      }),
      this.prisma.aiJob.count({ where }),
    ]);

    const items = await Promise.all(jobs.map(async (job) => ({
      jobId: job.id,
      type: job.type,
      output: await this.signOutput(job.output),
      input: (() => {
        const input = job.input as Record<string, unknown> | null;
        if (!input) return {};
        return { prompt: input["prompt"], model: input["model"], aspectRatio: input["aspectRatio"] };
      })(),
      createdAt: job.createdAt,
      user: job.user,
    })));

    return { items, total };
  }

  async getGalleryTags() {
    // Фиксированный словарь тегов; считаем, сколько свежих работ под каждый
    // подходит, и отдаём только непустые (по убыванию популярности).
    const jobs = await this.prisma.aiJob.findMany({
      where: { status: "completed", type: { in: ["image", "video"] }, cachedFrom: null, endUserId: null },
      select: { input: true },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });

    const prompts = jobs
      .map((job) => ((job.input as Record<string, unknown> | null)?.["prompt"] as string | undefined)?.toLowerCase())
      .filter((p): p is string => !!p);

    return GALLERY_TAGS
      .map((def) => ({ tag: def.key, count: prompts.filter((p) => promptMatchesTag(p, def)).length }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  async deleteJob(jobId: string, userId: string) {
    const job = await this.prisma.aiJob.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) return null;

    await this.prisma.aiJob.delete({ where: { id: jobId } });
    return { deleted: true };
  }
}
