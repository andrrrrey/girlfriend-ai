/**
 * @file cleanup.service.ts
 * @description Сервис автоматической очистки неактивных чатов.
 *
 * Выполняет ежедневное мягкое удаление ChatSession, в которых не было
 * активности более INACTIVE_DAYS дней.
 *
 * Расписание:
 * - Запускается ровно в 03:00 UTC каждый день через SchedulerService
 * - Под распределённым локом: при нескольких инстансах API выполняется один раз
 *
 * Логика мягкого удаления:
 * - Устанавливает deletedAt = now и isActive = false
 * - Физические записи остаются в БД для истории/аудита
 * - Критерий неактивности: lastMessageAt < (now - 7 дней)
 *   ИЛИ lastMessageAt IS NULL AND createdAt < (now - 7 дней) (пустые чаты)
 *
 * Жизненный цикл:
 * - onModuleInit: регистрирует задачу в планировщике (таймеры гасит SchedulerService)
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";

/** Количество дней без активности до мягкого удаления чата */
const INACTIVE_DAYS = 7;

/** Миллисекунд в одном дне (для вычисления cutoff даты) */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Сервис очистки неактивных чатов.
 *
 * Запускается автоматически при старте приложения через SchedulerService:
 * при нескольких инстансах API очистка выполняется только на одном (Redis-лок).
 */
@Injectable()
export class CleanupService implements OnModuleInit {
  /** NestJS-логгер (выводит имя класса в лог-сообщениях) */
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Регистрирует ежедневный запуск очистки в 03:00 UTC. */
  onModuleInit(): void {
    this.scheduler.scheduleDaily("cleanup-inactive-chats", 3, () => this.cleanupInactiveChats());
  }

  /**
   * Выполняет мягкое удаление неактивных чатов.
   *
   * Критерии отбора чатов для удаления:
   * - Ещё не удалены (deletedAt IS NULL)
   * - lastMessageAt < (now - INACTIVE_DAYS) — есть сообщения, но давно
   *   ИЛИ lastMessageAt IS NULL AND createdAt < (now - INACTIVE_DAYS) — пустой чат
   *
   * Операция: updateMany — устанавливает deletedAt = now, isActive = false.
   * Логирует количество удалённых чатов.
   */
  async cleanupInactiveChats(): Promise<void> {
    // Граничная дата: N дней назад от текущего момента
    const cutoff = new Date(Date.now() - INACTIVE_DAYS * MS_PER_DAY);

    const result = await this.prisma.chatSession.updateMany({
      where: {
        deletedAt: null, // Только активные (не уже удалённые)
        OR: [
          { lastMessageAt: { lt: cutoff } },             // Последнее сообщение > 7 дней назад
          { lastMessageAt: null, createdAt: { lt: cutoff } }, // Пустой чат старше 7 дней
        ],
      },
      data: {
        deletedAt: new Date(), // Мягкое удаление
        isActive: false,
      },
    });

    this.logger.log(
      `cleanup_inactive_chats: soft-deleted ${result.count} chats (inactive > ${INACTIVE_DAYS} days)`
    );
  }
}
