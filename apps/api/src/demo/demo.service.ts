import { ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

// Limits for free/demo users (per day)
export const DEMO_LIMITS = {
  chat_message: 20,
} as const;

export type DemoAction = "chat_message" | "stt" | "tts";

function endOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  private isFree(subscription: string): boolean {
    return subscription === "free";
  }

  /** STT and TTS are fully blocked for free users */
  checkVoiceAllowed(subscription: string): void {
    if (this.isFree(subscription)) {
      throw new ForbiddenException({
        error: "DEMO_FEATURE_BLOCKED",
        feature: "voice",
        message: "Голосовые функции доступны только по подписке",
      });
    }
  }

  /**
   * Check daily chat message limit for free users and increment counter.
   * Throws HTTP 429 when limit exceeded.
   */
  async checkAndIncrementMessage(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const now = new Date();
    const limit = DEMO_LIMITS.chat_message;

    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_action: { userId, action: "chat_message" } },
    });

    // Reset or create counter if expired
    if (!counter || counter.resetAt < now) {
      await this.prisma.usageCounter.upsert({
        where: { userId_action: { userId, action: "chat_message" } },
        create: { userId, action: "chat_message", count: 1, resetAt: endOfDay() },
        update: { count: 1, resetAt: endOfDay() },
      });
      return;
    }

    if (counter.count >= limit) {
      throw new HttpException(
        {
          error: "DEMO_LIMIT_REACHED",
          action: "chat_message",
          limit,
          used: counter.count,
          message: `Достигнут дневной лимит ${limit} сообщений. Оформите подписку для безлимитного общения.`,
          resetAt: counter.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.usageCounter.update({
      where: { userId_action: { userId, action: "chat_message" } },
      data: { count: { increment: 1 } },
    });
  }

  /** Returns current usage stats for the user */
  async getUsage(userId: string): Promise<{ action: string; count: number; limit: number; resetAt: Date }[]> {
    const counters = await this.prisma.usageCounter.findMany({
      where: { userId },
    });

    return counters.map((c) => ({
      action: c.action,
      count: c.count,
      limit: DEMO_LIMITS[c.action as keyof typeof DEMO_LIMITS] ?? 0,
      resetAt: c.resetAt,
    }));
  }
}
