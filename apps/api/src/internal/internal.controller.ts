import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Controller("internal")
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("settings")
  async getAllSettings() {
    const settings = await this.prisma.appSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }

  @Get("settings/:key")
  async getSetting(@Param("key") key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    return { key, value: setting?.value ?? null };
  }

  @Get("characters/:id")
  async getCharacter(@Param("id") id: string) {
    return this.prisma.character.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        systemPrompt: true,
        personality: true,
        voiceId: true,
      },
    });
  }

  // ─── AiJob endpoints (called by worker) ──────────────────────

  @Patch("ai-jobs/:id")
  async updateAiJob(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
      output?: unknown;
      tokensUsed?: number;
      error?: string;
    },
  ) {
    return this.prisma.aiJob.update({
      where: { id },
      data: {
        status: body.status,
        output: body.output as any,
        tokensUsed: body.tokensUsed,
        error: body.error,
        completedAt: ["completed", "failed"].includes(body.status) ? new Date() : undefined,
      },
    });
  }

  // ─── UsageLog endpoints (called by worker) ────────────────────

  @Post("usage-logs")
  async createUsageLog(
    @Body()
    body: {
      userId: string;
      action: string;
      tokensUsed?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.usageLog.create({
      data: {
        userId: body.userId,
        action: body.action,
        tokensUsed: body.tokensUsed,
        metadata: body.metadata as any,
      },
    });
  }
}
