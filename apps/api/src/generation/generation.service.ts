import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { AI_QUEUE } from "../queue/queue.module";
import { JOB_NAMES } from "../queue/queue.types";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import type { ImageJobData, VideoJobData } from "../queue/queue.types";
import { loadEnv } from "@repo/config";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

const CYRILLIC_RE = /[а-яА-ЯёЁ]/;

const IMAGE_MODELS = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
];

const VIDEO_MODELS = [
  { id: "atlascloud/van-2.6/text-to-video", name: "Van 2.6 (NSFW)", description: "Text-to-video, uncensored", provider: "atlascloud" },
];

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
    private readonly s3: S3Service,
  ) {}

  /** Заменяет публичный URL на presigned, если S3 настроен. */
  private async toSignedUrl(url: string | undefined | null): Promise<string | null> {
    if (!url || !this.s3.isConfigured()) return url ?? null;
    const publicBase = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
    if (!publicBase) return url;
    const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
    if (!key) return url;
    try {
      return await this.s3.getSignedUrl(key);
    } catch {
      return url;
    }
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

  async createImageJob(
    userId: string,
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string },
  ) {
    let prompt = data.prompt;
    const originalPrompt = data.prompt;

    if (CYRILLIC_RE.test(prompt)) {
      this.logger.log("Cyrillic detected in prompt, translating to English");
      prompt = await this.translateToEnglish(prompt);
    }

    const aiJob = await this.prisma.aiJob.create({
      data: {
        userId,
        type: "image",
        status: "pending",
        input: {
          prompt,
          originalPrompt: originalPrompt !== prompt ? originalPrompt : undefined,
          negativePrompt: data.negativePrompt,
          model: data.model,
          aspectRatio: data.aspectRatio,
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
    };

    await this.queue.add(JOB_NAMES.IMAGE, jobData);

    return { jobId: aiJob.id, status: "pending" };
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

  getImageStyles() {
    return IMAGE_MODELS;
  }

  async getCharacterOptions(category?: string) {
    return this.prisma.characterOption.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async getAppearanceOptions() {
    const categories = await this.prisma.appearanceCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: { OUTFITS: typeof categories; OUTFIT_DETAILS: typeof categories } = {
      OUTFITS: [],
      OUTFIT_DETAILS: [],
    };
    for (const cat of categories) {
      if (cat.tab === "OUTFITS") result.OUTFITS.push(cat);
      else if (cat.tab === "OUTFIT_DETAILS") result.OUTFIT_DETAILS.push(cat);
    }
    return result;
  }

  async getPoseOptions() {
    const categories = await this.prisma.poseCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: { FACIAL_EXPRESSION: typeof categories; POSE: typeof categories } = {
      FACIAL_EXPRESSION: [],
      POSE: [],
    };
    for (const cat of categories) {
      if (cat.tab === "FACIAL_EXPRESSION") result.FACIAL_EXPRESSION.push(cat);
      else if (cat.tab === "POSE") result.POSE.push(cat);
    }
    return result;
  }

  async getSceneOptions() {
    const categories = await this.prisma.sceneCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: { LOCATION: typeof categories } = { LOCATION: [] };
    for (const cat of categories) {
      if (cat.tab === "LOCATION") result.LOCATION.push(cat);
    }
    return result;
  }

  async getCameraOptions() {
    const options = await this.prisma.cameraOption.findMany({
      orderBy: [{ section: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
    const result: { FRAMING: typeof options; CAMERA_ANGLE: typeof options } = {
      FRAMING: [],
      CAMERA_ANGLE: [],
    };
    for (const opt of options) {
      if (opt.section === "FRAMING") result.FRAMING.push(opt);
      else if (opt.section === "CAMERA_ANGLE") result.CAMERA_ANGLE.push(opt);
    }
    return result;
  }

  async createVideoJob(
    userId: string,
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string; provider?: string },
  ) {
    let prompt = data.prompt;
    const originalPrompt = data.prompt;

    if (CYRILLIC_RE.test(prompt)) {
      this.logger.log("Cyrillic detected in video prompt, translating to English");
      prompt = await this.translateToEnglish(prompt);
    }

    // Auto-detect provider from model if not explicitly set
    const provider = data.provider || VIDEO_MODELS.find((m) => m.id === data.model)?.provider || "modelslab";

    const aiJob = await this.prisma.aiJob.create({
      data: {
        userId,
        type: "video",
        status: "pending",
        input: {
          prompt,
          originalPrompt: originalPrompt !== prompt ? originalPrompt : undefined,
          negativePrompt: data.negativePrompt,
          model: data.model,
          aspectRatio: data.aspectRatio,
          provider,
        },
      },
    });

    const jobData: VideoJobData = {
      jobId: aiJob.id,
      userId,
      prompt,
      negativePrompt: data.negativePrompt,
      aspectRatio: data.aspectRatio,
      model: data.model,
      provider,
    };

    await this.queue.add(JOB_NAMES.VIDEO, jobData);

    return { jobId: aiJob.id, status: "pending" };
  }

  getVideoStyles() {
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

  async getGallery(limit = 50, type?: string) {
    const typeFilter = type === "image" || type === "video"
      ? type
      : { in: ["image", "video"] as string[] };

    const jobs = await this.prisma.aiJob.findMany({
      where: {
        status: "completed",
        type: typeFilter,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Promise.all(jobs.map(async (job) => ({
      jobId: job.id,
      type: job.type,
      output: await this.signOutput(job.output),
      input: (() => {
        const input = job.input as Record<string, unknown> | null;
        if (!input) return {};
        return { prompt: input["prompt"], model: input["model"] };
      })(),
      createdAt: job.createdAt,
    })));
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
