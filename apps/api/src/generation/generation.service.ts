import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { AI_QUEUE } from "../queue/queue.module";
import { JOB_NAMES } from "../queue/queue.types";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import type { ImageJobData, VideoJobData } from "../queue/queue.types";
import { loadEnv } from "@repo/config";
import { resolveEnabledGenders } from "../common/genders";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

const CYRILLIC_RE = /[а-яА-ЯёЁ]/;

/** Допустимое количество элементов за одну генерацию (создаётся N заданий). */
const ALLOWED_GEN_COUNTS = [1, 4, 8, 16];

const IMAGE_MODELS = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
  { id: "alibaba/wan-2.6/text-to-image", name: "Wan 2.6 (NSFW)", description: "Uncensored image generation", provider: "atlascloud" },
  { id: "civitai", name: "Civitai RED", description: "Civitai Orchestration API", provider: "civitai" },
];

const VIDEO_MODELS = [
  { id: "atlascloud/van-2.6/text-to-video", name: "Van 2.6 (NSFW)", description: "Text-to-video, uncensored", provider: "atlascloud" },
  { id: "atlascloud/wan-2.6-spicy/image-to-video", name: "Wan 2.6 Spicy (I2V)", description: "Image-to-video, uncensored", provider: "atlascloud" },
  { id: "alibaba/wan-2.7/image-to-video", name: "Wan 2.7 (Continue)", description: "Continue / extend existing video", provider: "atlascloud" },
];

/** Дефолтные модели видео по режиму генерации. */
const VIDEO_MODE_DEFAULT_MODEL: Record<string, string> = {
  img2vid: "atlascloud/wan-2.6-spicy/image-to-video",
  continue: "alibaba/wan-2.7/image-to-video",
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
    private readonly s3: S3Service,
  ) {}

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
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string; provider?: string; generationStyle?: string; count?: number; initImageUrl?: string; characterId?: string; seed?: number; contentMode?: "nsfw" | "sfw" },
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

    // Создаём N отдельных заданий (1 job → 1 изображение).
    const jobIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const aiJob = await this.prisma.aiJob.create({
        data: {
          userId,
          type: "image",
          status: "pending",
          characterId: data.characterId || null,
          nsfw: contentMode !== "sfw",
          input: {
            prompt,
            originalPrompt: originalPrompt !== prompt ? originalPrompt : undefined,
            negativePrompt: data.negativePrompt,
            model: data.model,
            aspectRatio: data.aspectRatio,
            provider: resolvedProvider,
            generationStyle: data.generationStyle,
            img2img: initImageUrl ? true : undefined,
            seed: data.seed,
            contentMode,
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
        seed: data.seed,
        contentMode,
      };

      await this.queue.add(JOB_NAMES.IMAGE, jobData);
      jobIds.push(aiJob.id);
    }

    return { jobId: jobIds[0], jobIds, status: "pending" };
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
    },
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

    const jobIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const aiJob = await this.prisma.aiJob.create({
        data: {
          userId,
          type: "video",
          status: "pending",
          nsfw: contentMode !== "sfw",
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

  async getGallery(limit = 50, type?: string, sortBy?: string, page = 1, userId?: string, gender?: string, style?: string, mode?: string) {
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
    };
    if (userId) {
      where["userId"] = userId;
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
      andConditions.push({ input: { path: ["prompt"], string_contains: style.toLowerCase() } });
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
        return { prompt: input["prompt"], model: input["model"] };
      })(),
      createdAt: job.createdAt,
      user: job.user,
    })));

    return { items, total };
  }

  async getGalleryTags() {
    const STOP_WORDS = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "as", "is", "was", "are", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will", "would",
      "could", "should", "may", "might", "must", "shall", "can", "need",
      "not", "no", "nor", "so", "if", "then", "than", "too", "very",
      "just", "about", "above", "after", "again", "all", "also", "any",
      "because", "before", "between", "both", "each", "few", "her", "here",
      "him", "his", "how", "its", "let", "more", "most", "my", "new",
      "now", "old", "only", "other", "our", "out", "own", "same", "she",
      "some", "still", "such", "tell", "that", "their", "them", "there",
      "these", "they", "this", "those", "through", "under", "until", "up",
      "upon", "what", "when", "where", "which", "while", "who", "whom",
      "why", "you", "your", "into", "over", "down", "off", "once",
      "during", "without", "within", "along", "among", "around",
      "style", "quality", "high", "resolution", "detailed", "ultra",
      "photo", "image", "video", "prompt", "generate", "creating",
    ]);

    const jobs = await this.prisma.aiJob.findMany({
      where: { status: "completed", type: { in: ["image", "video"] } },
      select: { input: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });

    const freq = new Map<string, number>();
    for (const job of jobs) {
      const input = job.input as Record<string, unknown> | null;
      const prompt = input?.["prompt"] as string | undefined;
      if (!prompt) continue;
      const words = prompt.toLowerCase().split(/[,\s]+/).filter(
        (w) => w.length > 2 && w.length < 20 && /^[a-z]+$/.test(w) && !STOP_WORDS.has(w),
      );
      for (const word of words) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }

    return Array.from(freq.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([tag, count]) => ({ tag, count }));
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
