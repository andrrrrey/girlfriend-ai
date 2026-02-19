import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

const INACTIVE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.scheduleNextRun();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Schedule next run at 03:00 UTC */
  private scheduleNextRun(): void {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setUTCHours(3, 0, 0, 0);
    if (next3am <= now) next3am.setUTCDate(next3am.getUTCDate() + 1);

    const delay = next3am.getTime() - now.getTime();
    this.timer = setTimeout(() => {
      this.cleanupInactiveChats().finally(() => this.scheduleNextRun());
    }, delay);
  }

  async cleanupInactiveChats(): Promise<void> {
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * MS_PER_DAY);

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
