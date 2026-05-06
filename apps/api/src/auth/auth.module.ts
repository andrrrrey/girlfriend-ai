/**
 * @file auth.module.ts
 * @description NestJS-модуль аутентификации.
 *
 * Регистрирует:
 * - PassportModule с JWT-стратегией по умолчанию
 * - JwtModule с ключом и TTL из переменных окружения
 * - AuthController — HTTP-эндпоинты: POST /auth/register, /login, /refresh, /logout
 * - AuthService    — бизнес-логика аутентификации и ротации токенов
 * - JwtStrategy    — Passport-стратегия для валидации JWT из Authorization Bearer заголовка
 *
 * Экспортирует AuthService и JwtModule для переиспользования в других модулях.
 * env загружается на уровне модуля (не в провайдере) — fail-fast при отсутствии JWT_SECRET.
 */

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { loadEnv } from "@repo/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailService } from "./email.service";
import { TurnstileService } from "./turnstile.service";
import { JwtStrategy } from "./jwt.strategy";
import { PrismaService } from "../prisma.service";

// Загружаем env один раз на уровне модуля (не в factory-провайдере)
const env = loadEnv();

@Module({
  imports: [
    // defaultStrategy: "jwt" — JwtAuthGuard будет использовать эту стратегию по умолчанию
    PassportModule.register({ defaultStrategy: "jwt" }),

    // Синхронная регистрация JWT с параметрами из переменных окружения:
    // - secret: HMAC ключ подписи токенов (из JWT_SECRET)
    // - expiresIn: TTL access-токена в секундах (из JWT_TTL_SECONDS, по умолчанию 604800 = 7 дней)
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: { expiresIn: env.JWT_TTL_SECONDS },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,       // Бизнес-логика: bcrypt-хеширование, создание токенов, ротация refresh
    EmailService,      // Отправка писем через Resend (верификация email)
    TurnstileService,  // Верификация Cloudflare Turnstile капчи
    JwtStrategy,       // Passport-стратегия: извлекает JWT из Bearer и загружает пользователя
    PrismaService,     // Доступ к таблицам User и Session
  ],
  exports: [
    AuthService, // Доступен другим модулям (если нужны прямые вызовы)
    JwtModule,   // JwtService доступен другим модулям через этот экспорт
  ],
})
export class AuthModule {}
