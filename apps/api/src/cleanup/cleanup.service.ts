import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service";

const INACTIVE_DAYS = 7;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs every day at 03:00 UTC */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupInactiveChats(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);

    const result = await this.prisma.chatSession.updateMany({
      where: {
        deletedAt: null,
        OR: [
          { lastMessageAt: { lt: cutoff } },
          { lastMessageAt: null, createdAt: { lt: cutoff } },
        ],
      },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`cleanup_inactive_chats: soft-deleted ${result.count} chats (inactive > ${INACTIVE_DAYS} days)`);
  }
}
