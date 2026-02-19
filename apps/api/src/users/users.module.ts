/**
 * @file users.module.ts
 * @description NestJS-модуль управления профилем пользователя.
 *
 * Предоставляет эндпоинты для работы с собственным профилем (только "me" — текущий юзер).
 * Все эндпоинты защищены JwtAuthGuard — доступны только аутентифицированным.
 *
 * UsersService экспортируется для использования в других модулях при необходимости.
 */

import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [UsersController], // Обрабатывает HTTP /users/me, /users/me/password и т.д.
  providers: [
    UsersService,   // Бизнес-логика: профиль, смена пароля, соц. ссылки
    PrismaService,  // Доступ к таблицам User и SocialLink
  ],
  exports: [UsersService], // Доступен для других модулей через DI
})
export class UsersModule {}
