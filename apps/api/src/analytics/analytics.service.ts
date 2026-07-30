/**
 * @file analytics.service.ts
 * @description Тонкая обёртка над PostHog Node-клиентом для серверной продуктовой аналитики.
 *
 * Поведение:
 * - Если POSTHOG_KEY не задан — сервис работает в режиме no-op (все методы ничего не делают).
 *   Это позволяет запускать проект локально/в CI без ключа и без падений.
 * - capture() и identify() никогда не бросают исключений наружу — ошибки аналитики
 *   не должны ломать бизнес-логику (регистрацию, логин и т.д.). Ошибки логируются в pino.
 * - На завершении приложения (onModuleDestroy) вызывается shutdown() — дожидается
 *   отправки буферизованных событий (иначе часть событий потеряется при рестарте контейнера).
 *
 * distinct_id — это User.id (UUID) из Postgres. Он же используется на фронте (posthog.identify),
 * поэтому серверные и клиентские события склеиваются в один профиль пользователя.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PostHog } from "posthog-node";
import { loadEnv } from "@repo/config";

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private client: PostHog | null = null;

  onModuleInit() {
    const env = loadEnv();
    if (!env.POSTHOG_KEY) {
      this.logger.log("PostHog disabled (POSTHOG_KEY not set) — analytics is a no-op");
      return;
    }
    this.client = new PostHog(env.POSTHOG_KEY, {
      host: env.POSTHOG_HOST,
      // Небольшой буфер + короткий интервал: события уходят быстро, но батчами.
      flushAt: 20,
      flushInterval: 10_000,
    });
    this.logger.log(`PostHog enabled (host=${env.POSTHOG_HOST})`);
  }

  /**
   * Отправляет продуктовое событие.
   * @param distinctId — User.id (UUID). Для анонимных потоков передавайте стабильный anon-id.
   * @param event — имя события в snake_case, например "user_registered".
   * @param properties — дополнительные свойства события.
   */
  capture(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.client) return;
    try {
      this.client.capture({ distinctId, event, properties });
    } catch (err) {
      this.logger.warn(`PostHog capture failed for "${event}": ${String(err)}`);
    }
  }

  /**
   * Обновляет свойства профиля пользователя (person properties) на стороне сервера.
   * Полезно, когда изменение произошло без участия фронта (напр. смена подписки воркером).
   */
  identify(distinctId: string, properties: Record<string, unknown>): void {
    if (!this.client) return;
    try {
      this.client.identify({ distinctId, properties });
    } catch (err) {
      this.logger.warn(`PostHog identify failed: ${String(err)}`);
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    try {
      await this.client.shutdown();
    } catch (err) {
      this.logger.warn(`PostHog shutdown failed: ${String(err)}`);
    }
  }
}
