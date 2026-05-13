import { ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export const FREE_LIMITS = {
  characters: 1,
  chatSessions: 3,
  messagesPerChat: 20,
  imageGenerations: 2,
  videoGenerations: 1,
} as const;

export type LimitType = keyof typeof FREE_LIMITS;

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  private isFree(subscription: string): boolean {
    return subscription === "free";
  }

  checkVoiceAllowed(subscription: string): void {
    if (this.isFree(subscription)) {
      throw new ForbiddenException({
        error: "DEMO_FEATURE_BLOCKED",
        feature: "voice",
        message: "Голосовые функции доступны только по подписке",
      });
    }
  }

  async checkCharacterCreation(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const used = await this.prisma.character.count({
      where: { createdBy: userId, deletedAt: null },
    });

    if (used >= FREE_LIMITS.characters) {
      throw new ForbiddenException({
        error: "FREE_LIMIT_REACHED",
        limitType: "characters",
        limit: FREE_LIMITS.characters,
        used,
        message: `Достигнут лимит: можно создать не более ${FREE_LIMITS.characters} персонажа. Оформите подписку для безлимитного доступа.`,
      });
    }
  }

  async checkChatSessionCreation(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const used = await this.prisma.chatSession.count({
      where: { userId, deletedAt: null },
    });

    if (used >= FREE_LIMITS.chatSessions) {
      throw new ForbiddenException({
        error: "FREE_LIMIT_REACHED",
        limitType: "chatSessions",
        limit: FREE_LIMITS.chatSessions,
        used,
        message: `Достигнут лимит: максимум ${FREE_LIMITS.chatSessions} диалога. Оформите подписку для безлимитного общения.`,
      });
    }
  }

  async checkMessageLimit(chatSessionId: string, userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const used = await this.prisma.message.count({
      where: { chatSessionId, role: "user", deletedAt: null },
    });

    if (used >= FREE_LIMITS.messagesPerChat) {
      throw new HttpException(
        {
          error: "FREE_LIMIT_REACHED",
          limitType: "messagesPerChat",
          limit: FREE_LIMITS.messagesPerChat,
          used,
          message: `Достигнут лимит ${FREE_LIMITS.messagesPerChat} сообщений в этом чате. Оформите подписку для безлимитного общения.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async checkImageGeneration(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const used = await this.prisma.aiJob.count({
      where: { userId, type: "image", status: { not: "failed" } },
    });

    if (used >= FREE_LIMITS.imageGenerations) {
      throw new ForbiddenException({
        error: "FREE_LIMIT_REACHED",
        limitType: "imageGenerations",
        limit: FREE_LIMITS.imageGenerations,
        used,
        message: `Достигнут лимит: ${FREE_LIMITS.imageGenerations} генерации картинок. Оформите подписку для безлимитного доступа.`,
      });
    }
  }

  async checkVideoGeneration(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const used = await this.prisma.aiJob.count({
      where: { userId, type: "video", status: { not: "failed" } },
    });

    if (used >= FREE_LIMITS.videoGenerations) {
      throw new ForbiddenException({
        error: "FREE_LIMIT_REACHED",
        limitType: "videoGenerations",
        limit: FREE_LIMITS.videoGenerations,
        used,
        message: `Достигнут лимит: ${FREE_LIMITS.videoGenerations} генерация видео. Оформите подписку для безлимитного доступа.`,
      });
    }
  }

  async getUserLimitsStatus(userId: string, subscription: string) {
    const isPaid = !this.isFree(subscription);

    const [characters, chatSessions, imageGenerations, videoGenerations] = await Promise.all([
      this.prisma.character.count({ where: { createdBy: userId, deletedAt: null } }),
      this.prisma.chatSession.count({ where: { userId, deletedAt: null } }),
      this.prisma.aiJob.count({ where: { userId, type: "image", status: { not: "failed" } } }),
      this.prisma.aiJob.count({ where: { userId, type: "video", status: { not: "failed" } } }),
    ]);

    return {
      subscription,
      limits: {
        characters: { used: characters, limit: isPaid ? null : FREE_LIMITS.characters },
        chatSessions: { used: chatSessions, limit: isPaid ? null : FREE_LIMITS.chatSessions },
        imageGenerations: { used: imageGenerations, limit: isPaid ? null : FREE_LIMITS.imageGenerations },
        videoGenerations: { used: videoGenerations, limit: isPaid ? null : FREE_LIMITS.videoGenerations },
      },
    };
  }
}
