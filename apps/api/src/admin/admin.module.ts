/**
 * @file admin.module.ts
 * @description NestJS-модуль административного раздела приложения.
 *
 * Объединяет все компоненты, необходимые для работы административного API:
 * - {@link AdminController} — HTTP-контроллер с маршрутами `/admin/*`.
 * - {@link AdminService}    — сервис с бизнес-логикой управления персонажами,
 *                             настройками и пользователями.
 * - {@link PrismaService}   — сервис доступа к базе данных через Prisma ORM.
 *
 * `AdminService` экспортируется из модуля, что позволяет другим модулям
 * приложения импортировать `AdminModule` и использовать его сервис
 * без повторного объявления зависимостей.
 */

import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminUploadController } from "./upload.controller";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma.service";
import { S3Module } from "../s3/s3.module";

/**
 * Модуль администрирования.
 *
 * Регистрирует контроллер и провайдеры административного раздела.
 * Для подключения административного функционала достаточно импортировать
 * данный модуль в корневой `AppModule`.
 *
 * Экспортирует `AdminService` для возможного повторного использования
 * в других модулях приложения.
 */
@Module({
  imports: [S3Module],
  controllers: [AdminController, AdminUploadController],
  providers: [AdminService, PrismaService],
  exports: [AdminService],
})
export class AdminModule {}
