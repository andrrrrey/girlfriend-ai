/**
 * @file auth.service.ts
 * @description Бизнес-логика аутентификации: регистрация, вход, ротация токенов, выход, верификация email.
 *
 * Схема токенов:
 * - Access-token:  JWT, подписан JWT_SECRET, TTL = JWT_TTL_SECONDS (по умолчанию 7 дней).
 *                  Payload: { sub: userId }. Не хранится в БД — stateless.
 * - Refresh-token: UUID v4, хранится в таблице Session.
 *                  TTL = REFRESH_TOKEN_TTL_DAYS (30 дней).
 *                  Ротируется при каждом использовании (старая сессия удаляется).
 *
 * Безопасность:
 * - Пароли: bcrypt, cost-factor = BCRYPT_ROUNDS = 10 (~100ms на современном CPU)
 * - Мягко удалённые юзеры (deletedAt != null) не могут войти
 * - Только верифицированные пользователи (emailVerified = true) могут войти
 * - При refresh с невалидным/истекшим токеном — сессия удаляется (защита от replay)
 * - Одинаковое сообщение ошибки для "не найден" и "неверный пароль" (анти-enumeration)
 */

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma.service";
import { EmailService } from "./email.service";
import { AnalyticsService } from "../analytics/analytics.service";

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_TTL_DAYS = 30;
const VERIFICATION_TOKEN_TTL_HOURS = 24;
const PASSWORD_RESET_TOKEN_TTL_HOURS = 1;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Регистрация нового пользователя.
   * После регистрации отправляет письмо с верификацией.
   * Не возвращает токены — пользователь должен подтвердить email перед входом.
   */
  async register(
    email: string,
    password: string,
    isAdult?: boolean,
  ): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = randomUUID();
    const verificationTokenExpiresAt = new Date();
    verificationTokenExpiresAt.setHours(
      verificationTokenExpiresAt.getHours() + VERIFICATION_TOKEN_TTL_HOURS,
    );

    // Несовершеннолетним (isAdult === false) форсим SFW-режим по умолчанию.
    const adult = isAdult !== false;
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        verificationToken,
        verificationTokenExpiresAt,
        emailVerified: false,
        isAdult: adult,
        contentMode: adult ? "nsfw" : "sfw",
      },
    });

    // distinct_id = User.id, чтобы событие склеилось с клиентским профилем PostHog.
    this.analytics.capture(user.id, "user_registered", {
      is_adult: adult,
      content_mode: user.contentMode,
    });

    await this.email.sendVerificationEmail(email, verificationToken);

    return { message: "Verification email sent" };
  }

  /**
   * Вход по email/паролю.
   * Требует подтверждённого email (emailVerified = true).
   */
  async login(
    email: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException("Please verify your email first");
    }

    this.analytics.capture(user.id, "user_logged_in", {
      subscription: user.subscription,
      content_mode: user.contentMode,
    });

    return this.createTokenPair(user.id, userAgent, ip);
  }

  /**
   * Верификация email по токену из письма.
   * Устанавливает emailVerified = true и возвращает TokenPair (автоматический вход).
   */
  async verifyEmail(token: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
    });

    if (
      !user ||
      !user.verificationTokenExpiresAt ||
      user.verificationTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException("Invalid or expired verification token");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });

    return this.createTokenPair(user.id);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.createTokenPair(session.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { refreshToken } });
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt) {
      return { message: "If this email exists, a reset link has been sent" };
    }

    const passwordResetToken = randomUUID();
    const passwordResetTokenExpiresAt = new Date();
    passwordResetTokenExpiresAt.setHours(
      passwordResetTokenExpiresAt.getHours() + PASSWORD_RESET_TOKEN_TTL_HOURS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken, passwordResetTokenExpiresAt },
    });

    await this.email.sendPasswordResetEmail(email, passwordResetToken);

    return { message: "If this email exists, a reset link has been sent" };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    if (
      !user ||
      !user.passwordResetTokenExpiresAt ||
      user.passwordResetTokenExpiresAt < new Date()
    ) {
      throw new UnauthorizedException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    await this.prisma.session.deleteMany({ where: { userId: user.id } });

    return { message: "Password has been reset successfully" };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.deletedAt || user.emailVerified) {
      return { message: "If this email needs verification, a new link has been sent" };
    }

    const verificationToken = randomUUID();
    const verificationTokenExpiresAt = new Date();
    verificationTokenExpiresAt.setHours(
      verificationTokenExpiresAt.getHours() + VERIFICATION_TOKEN_TTL_HOURS,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { verificationToken, verificationTokenExpiresAt },
    });

    await this.email.sendVerificationEmail(email, verificationToken);

    return { message: "If this email needs verification, a new link has been sent" };
  }

  private async createTokenPair(
    userId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<TokenPair> {
    const accessToken = this.jwt.sign({ sub: userId });
    const refreshToken = randomUUID();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    await this.prisma.session.create({
      data: { userId, refreshToken, userAgent, ip, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
