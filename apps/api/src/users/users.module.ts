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
import { DemoModule } from "../demo/demo.module";

@Module({
  imports: [DemoModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaService,
  ],
  exports: [UsersService],
})
export class UsersModule {}
