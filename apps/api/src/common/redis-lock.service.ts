/**
 * @file redis-lock.service.ts
 * @description Распределённые блокировки на Redis (SET NX PX + освобождение Lua-скриптом).
 *
 * Используется для:
 * - последовательной обработки сообщений внутри одного диалога (chat:{id});
 * - выполнения фоновых задач ровно на одном инстансе API (sched:{name}).
 *
 * Токен владельца — случайный UUID: освободить или продлить лок может только тот,
 * кто его взял (защита от снятия чужого лока после истечения TTL).
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import type Redis from "ioredis";
import { REDIS } from "./redis.constants";

/** Удаляет ключ, только если значение совпадает с токеном владельца. */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/** Продлевает TTL, только если значение совпадает с токеном владельца. */
const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

/** Префикс всех ключей блокировок. */
const KEY_PREFIX = "lock:";

/** Взятый лок: ключ + токен владельца. */
export interface LockHandle {
  key: string;
  token: string;
}

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Пытается взять лок без ожидания.
   *
   * @param key   — имя лока (без префикса), например "chat:<uuid>"
   * @param ttlMs — время жизни лока; по истечении он освобождается сам
   * @returns LockHandle или null, если лок уже занят
   */
  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    const res = await this.redis.set(KEY_PREFIX + key, token, "PX", ttlMs, "NX");
    return res === "OK" ? { key, token } : null;
  }

  /** Освобождает лок, если он всё ещё принадлежит этому владельцу. */
  async release(lock: LockHandle): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, KEY_PREFIX + lock.key, lock.token);
  }

  /** Продлевает лок. Возвращает false, если лок уже потерян. */
  async extend(lock: LockHandle, ttlMs: number): Promise<boolean> {
    const res = await this.redis.eval(EXTEND_SCRIPT, 1, KEY_PREFIX + lock.key, lock.token, String(ttlMs));
    return res === 1;
  }

  /**
   * Держит лок, пока жива операция: продлевает его каждые ttlMs/3.
   * Возвращает функцию остановки продления (сам лок она не освобождает).
   */
  keepAlive(lock: LockHandle, ttlMs: number): () => void {
    const timer = setInterval(() => {
      this.extend(lock, ttlMs)
        .then((ok) => {
          if (!ok) this.logger.warn(`lock lost: ${lock.key}`);
        })
        .catch((err) => this.logger.warn(`lock extend failed: ${lock.key}: ${err?.message}`));
    }, Math.max(1000, Math.floor(ttlMs / 3)));
    timer.unref?.();
    return () => clearInterval(timer);
  }

  /**
   * Выполняет fn под локом с автопродлением.
   *
   * @returns { acquired: false } если лок занят, иначе { acquired: true, result }
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: false } | { acquired: true; result: T }> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock) return { acquired: false };
    const stop = this.keepAlive(lock, ttlMs);
    try {
      return { acquired: true, result: await fn() };
    } finally {
      stop();
      await this.release(lock).catch(() => undefined);
    }
  }
}
