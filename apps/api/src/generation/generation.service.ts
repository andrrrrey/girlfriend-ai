import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { AI_QUEUE } from "../queue/queue.module";
import { JOB_NAMES } from "../queue/queue.types";
import { PrismaService } from "../prisma.service";
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
  { id: "cogvideox", name: "CogVideoX", description: "High quality text-to-video" },
  { id: "hunyuan-video", name: "Hunyuan Video", description: "Realistic video generation" },
  { id: "wan-ai", name: "Wan AI", description: "Fast video synthesis" },
  { id: "animatediff", name: "AnimateDiff", description: "Animate any style" },
  { id: "stable-video-diffusion", name: "SVD", description: "Stable Video Diffusion" },
  { id: "ltx-video", name: "LTX Video", description: "Lightweight fast video" },
];

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
  ) {}

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
      output: job.output,
      error: job.error,
      createdAt: job.createdAt,
    };
  }

  getImageStyles() {
    return IMAGE_MODELS;
  }

  async createVideoJob(
    userId: string,
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string },
  ) {
    let prompt = data.prompt;
    const originalPrompt = data.prompt;

    if (CYRILLIC_RE.test(prompt)) {
      this.logger.log("Cyrillic detected in video prompt, translating to English");
      prompt = await this.translateToEnglish(prompt);
    }

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

    return jobs.map((job) => ({
      jobId: job.id,
      type: job.type,
      output: job.output,
      input: job.input,
      createdAt: job.createdAt,
    }));
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
