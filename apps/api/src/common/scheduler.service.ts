/**
 * @file scheduler.service.ts
 * @description Планировщик фоновых задач, безопасный при нескольких инстансах API.
 *
 * Каждый запуск задачи выполняется под распределённым локом sched:{name}:
 * если задачу уже выполняет другой инстанс, этот запуск пропускается.
 * Таймеры — обычные setTimeout/setInterval (без сторонних cron-библиотек).
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { RedisLockService } from "./redis-lock.service";

/** Максимальное время, на которое задача удерживает лок (продлевается автоматически). */
const JOB_LOCK_TTL_MS = 60_000;

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;

  constructor(private readonly locks: RedisLockService) {}

  onModuleDestroy() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  /**
   * Запускает задачу каждый день в hourUtc:00 UTC.
   *
   * @param name    — уникальное имя задачи (ключ лока)
   * @param hourUtc — час запуска по UTC (0–23)
   * @param fn      — тело задачи
   */
  scheduleDaily(name: string, hourUtc: number, fn: () => Promise<void>): void {
    const planNext = () => {
      if (this.stopped) return;
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(hourUtc, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      this.setTimer(() => {
        this.runExclusive(name, fn).finally(planNext);
      }, next.getTime() - now.getTime());
    };
    planNext();
  }

  /**
   * Запускает задачу с интервалом intervalMs (следующий запуск — после окончания
   * предыдущего, поэтому запуски одной задачи на инстансе не перекрываются).
   *
   * @param exclusive — true: выполнять только на одном инстансе (под локом);
   *                    false: на каждом инстансе (задача сама обеспечивает
   *                    безопасность, например через SKIP LOCKED)
   */
  scheduleInterval(name: string, intervalMs: number, fn: () => Promise<void>, exclusive = true): void {
    const tick = () => {
      if (this.stopped) return;
      const run = exclusive ? this.runExclusive(name, fn) : this.runSafe(name, fn);
      run.finally(() => this.setTimer(tick, intervalMs));
    };
    this.setTimer(tick, intervalMs);
  }

  /** Выполняет задачу под локом; если лок занят — тихо пропускает запуск. */
  async runExclusive(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await this.locks.withLock(`sched:${name}`, JOB_LOCK_TTL_MS, () => this.runSafe(name, fn));
    } catch (err: any) {
      this.logger.error(`job ${name}: lock error: ${err?.message}`);
    }
  }

  private async runSafe(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err: any) {
      this.logger.error(`job ${name} failed: ${err?.message}`);
    }
  }

  private setTimer(fn: () => void, delayMs: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, delayMs);
    t.unref?.();
    this.timers.add(t);
  }
}
