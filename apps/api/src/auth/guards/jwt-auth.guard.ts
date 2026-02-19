/**
 * @file jwt-auth.guard.ts
 * @description Guard для защиты эндпоинтов JWT-аутентификацией.
 *
 * Применяется декоратором @UseGuards(JwtAuthGuard) к контроллеру или методу.
 * Использует стратегию "jwt" (JwtStrategy), которая:
 * 1. Извлекает JWT из заголовка Authorization: Bearer
 * 2. Верифицирует подпись
 * 3. Загружает пользователя из БД и помещает в req.user
 *
 * При неуспешной аутентификации возвращает HTTP 401 Unauthorized.
 *
 * @example
 * @Controller("chats")
 * @UseGuards(JwtAuthGuard)  // Защищает весь контроллер
 * export class ChatsController { ... }
 */

import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT Guard — тонкая обёртка над Passport AuthGuard("jwt").
 * Никакой дополнительной логики — только именованный класс для удобства импорта.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
