import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { AI_QUEUE } from "../queue/queue.module";
import { JOB_NAMES } from "../queue/queue.types";
import { PrismaService } from "../prisma.service";
import type { ImageJobData } from "../queue/queue.types";

const IMAGE_MODELS = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
];

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_QUEUE) private readonly queue: Queue,
  ) {}

  async createImageJob(
    userId: string,
    data: { prompt: string; negativePrompt?: string; model?: string; aspectRatio?: string },
  ) {
    const aiJob = await this.prisma.aiJob.create({
      data: {
        userId,
        type: "image",
        status: "pending",
        input: {
          prompt: data.prompt,
          negativePrompt: data.negativePrompt,
          model: data.model,
          aspectRatio: data.aspectRatio,
        },
      },
    });

    const jobData: ImageJobData = {
      jobId: aiJob.id,
      userId,
      prompt: data.prompt,
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

  async getHistory(userId: string) {
    const jobs = await this.prisma.aiJob.findMany({
      where: { userId, type: "image", status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return jobs.map((job) => ({
      jobId: job.id,
      output: job.output,
      input: job.input,
      createdAt: job.createdAt,
    }));
  }
}
