/**
 * @file prisma.service.ts
 * @description NestJS-сервис для работы с Prisma ORM (PostgreSQL).
 *
 * Расширяет PrismaClient и интегрируется с жизненным циклом NestJS-модулей:
 * - `onModuleInit`    — устанавливает соединение с БД при старте модуля
 * - `onModuleDestroy` — закрывает соединение при остановке приложения (graceful shutdown)
 *
 * Является глобальным синглтоном — подключается в AppModule и переиспользуется
 * во всех сервисах через DI. Альтернативно, каждый модуль может объявить его
 * в своём providers массиве.
 *
 * Пул соединений управляется Prisma автоматически (по умолчанию: cpu_count * 2 + 1).
 * Для тюнинга пула добавь `?connection_limit=N` в DATABASE_URL.
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Injectable Prisma-клиент для доступа к PostgreSQL.
 *
 * Используй как обычный DI-сервис:
 * @example
 * constructor(private readonly prisma: PrismaService) {}
 * const user = await this.prisma.user.findUnique({ where: { id } });
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Вызывается NestJS при инициализации модуля.
   * Открывает пул соединений с PostgreSQL.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Вызывается NestJS при уничтожении модуля (SIGTERM, перезапуск).
   * Закрывает все соединения с БД — предотвращает утечки при graceful shutdown.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
