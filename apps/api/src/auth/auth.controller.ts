/**
 * @file auth.controller.ts
 * @description HTTP-контроллер для эндпоинтов аутентификации.
 *
 * Маршруты (все публичные, не требуют JWT):
 * - POST /auth/register — создание аккаунта → возвращает TokenPair
 * - POST /auth/login    — вход по email/паролю → возвращает TokenPair
 * - POST /auth/refresh  — обновление access-токена → возвращает TokenPair
 * - POST /auth/logout   — выход (204 No Content)
 *
 * IP-адрес клиента извлекается из X-Forwarded-For (за прокси) или req.ip.
 * Первый IP в X-Forwarded-For — реальный клиент (остальные могут быть прокси).
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { TurnstileService } from "./turnstile.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResendVerificationDto } from "./dto/resend-verification.dto";
import { Request } from "express";
import { UnauthorizedException } from "@nestjs/common";

/**
 * Контроллер аутентификации.
 * Все эндпоинты публичны (без @UseGuards) — аутентификация не требуется.
 * Тег "auth" группирует эндпоинты в Swagger UI.
 */
// Жёсткий лимит для auth: 10 запросов в минуту с одного IP (защита от brute-force)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly turnstile: TurnstileService,
  ) {}

  /**
   * POST /auth/register
   *
   * Создаёт нового пользователя и сразу возвращает TokenPair.
   * Статус 201 Created (по умолчанию для @Post).
   *
   * @body RegisterDto — { email, password (минимум 6 символов) }
   * @returns TokenPair — { accessToken, refreshToken }
   */
  @ApiOperation({ summary: "Register a new user" })
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const ok = await this.turnstile.verify(dto.turnstileToken, ip);
    if (!ok) throw new UnauthorizedException("Captcha verification failed");
    return this.authService.register(dto.email, dto.password);
  }

  /**
   * POST /auth/login
   *
   * Аутентификация по email/паролю.
   * Возвращает 200 (не 201) — @HttpCode(OK).
   *
   * Извлекает User-Agent и IP для записи в Session (аудит активных сессий).
   * IP берётся из X-Forwarded-For[0] (за reverse proxy) или req.ip.
   *
   * @body LoginDto — { email, password }
   * @returns TokenPair — { accessToken, refreshToken }
   */
  @ApiOperation({ summary: "Login with email and password" })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers["user-agent"];
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
    const ok = await this.turnstile.verify(dto.turnstileToken, ip);
    if (!ok) throw new UnauthorizedException("Captcha verification failed");
    return this.authService.login(dto.email, dto.password, userAgent, ip);
  }

  /**
   * POST /auth/refresh
   *
   * Обменивает действующий refresh-токен на новую пару токенов (Token Rotation).
   * Статус 200 OK.
   *
   * @body RefreshDto — { refreshToken: UUID }
   * @returns TokenPair — новая пара (старый refreshToken инвалидирован)
   */
  @ApiOperation({ summary: "Refresh access token using refresh token" })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * POST /auth/logout
   *
   * Инвалидирует refresh-токен (удаляет сессию из БД).
   * Статус 204 No Content — тело ответа пустое.
   *
   * @body RefreshDto — { refreshToken: UUID }
   */
  @ApiOperation({ summary: "Logout and invalidate refresh token" })
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @ApiOperation({ summary: "Verify email address with token from email link" })
  @Get("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query("token") token: string) {
    return this.authService.verifyEmail(token);
  }

  @ApiOperation({ summary: "Request password reset email" })
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @ApiOperation({ summary: "Reset password using token from email" })
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @ApiOperation({ summary: "Resend email verification link" })
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }
}
