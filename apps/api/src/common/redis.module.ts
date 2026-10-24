/**
 * @file redis.module.ts
 * @description Глобальный модуль общей инфраструктуры: Redis-клиент, распределённые
 * блокировки, планировщик фоновых задач и шифрование секретов.
 *
 * Отдельное соединение ioredis (BullMQ держит своё) — для локов и лёгких
 * служебных операций. Получить клиент: @Inject(REDIS) private redis: Redis.
 */

import { Global, Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@repo/config";
import { RedisLockService } from "./redis-lock.service";
import { SchedulerService } from "./scheduler.service";
import { CryptoService } from "./crypto.service";
import { REDIS } from "./redis.constants";

export { REDIS };

/** Закрывает Redis-соединение при остановке приложения. */
@Injectable()
class RedisShutdown implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: 3 }),
    },
    RedisShutdown,
    RedisLockService,
    SchedulerService,
    CryptoService,
  ],
  exports: [REDIS, RedisLockService, SchedulerService, CryptoService],
})
export class RedisModule {}
