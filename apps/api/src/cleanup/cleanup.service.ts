/**
 * @file cleanup.service.ts
 * @description Сервис автоматической очистки неактивных чатов.
 *
 * Выполняет ежедневное мягкое удаление ChatSession, в которых не было
 * активности более INACTIVE_DAYS дней.
 *
 * Расписание:
 * - Запускается ровно в 03:00 UTC каждый день
 * - Реализовано через рекурсивный setTimeout (не cron, без сторонних зависимостей)
 * - После каждого запуска планируется следующий
 *
 * Логика мягкого удаления:
 * - Устанавливает deletedAt = now и isActive = false
 * - Физические записи остаются в БД для истории/аудита
 * - Критерий неактивности: lastMessageAt < (now - 7 дней)
 *   ИЛИ lastMessageAt IS NULL AND createdAt < (now - 7 дней) (пустые чаты)
 *
 * Жизненный цикл:
 * - onModuleInit: запускает планировщик при старте модуля
 * - onModuleDestroy: отменяет таймер при остановке (graceful shutdown)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/** Количество дней без активности до мягкого удаления чата */
const INACTIVE_DAYS = 7;

/** Миллисекунд в одном дне (для вычисления cutoff даты) */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Сервис очистки неактивных чатов.
 *
 * Запускается автоматически при старте приложения.
 * Не требует ручного вызова — работает по расписанию через setTimeout.
 */
@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  /** NestJS-логгер (выводит имя класса в лог-сообщениях) */
  private readonly logger = new Logger(CleanupService.name);
  /** Ссылка на setTimeout для возможности отмены при остановке */
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Вызывается NestJS при инициализации модуля.
   * Запускает первое планирование задачи.
   */
  onModuleInit(): void {
    this.scheduleNextRun();
  }

  /**
   * Вызывается NestJS при остановке модуля (graceful shutdown).
   * Отменяет запланированный таймер чтобы предотвратить утечки.
   */
  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Вычисляет задержку до ближайшего 03:00 UTC и планирует выполнение.
   *
   * Алгоритм:
   * 1. Берём текущее время UTC
   * 2. Устанавливаем время 03:00:00.000 UTC для сегодня
   * 3. Если 03:00 уже прошло — берём завтра в 03:00
   * 4. Устанавливаем setTimeout на вычисленную задержку
   * 5. После выполнения задачи — рекурсивно планируем следующий запуск
   */
  private scheduleNextRun(): void {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setUTCHours(3, 0, 0, 0);
    // Если 03:00 сегодня уже прошло — переносим на завтра
    if (next3am <= now) next3am.setUTCDate(next3am.getUTCDate() + 1);

    const delay = next3am.getTime() - now.getTime();
    this.timer = setTimeout(() => {
      // cleanupInactiveChats выполняется, затем планируется следующий запуск
      this.cleanupInactiveChats().finally(() => this.scheduleNextRun());
    }, delay);
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
