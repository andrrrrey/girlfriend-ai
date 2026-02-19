/**
 * @file auth.service.ts
 * @description Бизнес-логика аутентификации: регистрация, вход, ротация токенов, выход.
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

/** Cost-factor bcrypt (10 ≈ 100ms — баланс безопасности и производительности) */
const BCRYPT_ROUNDS = 10;

/** Время жизни refresh-токена в днях (хранится в таблице Session в PostgreSQL) */
const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Пара токенов, возвращаемая при успешном auth.
 * Клиент хранит оба (например в localStorage).
 */
export interface TokenPair {
  /** JWT для авторизации запросов (заголовок: Authorization: Bearer <accessToken>) */
  accessToken: string;
  /** Долгоживущий UUID-токен для обновления пары через POST /auth/refresh */
  refreshToken: string;
}

/**
 * Сервис аутентификации и управления сессиями.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Регистрация нового пользователя.
   *
   * @param email — должен быть уникальным (иначе ConflictException)
   * @param password — открытый пароль, будет захеширован bcrypt
   * @returns TokenPair — пользователь сразу авторизован после регистрации
   * @throws ConflictException — если email уже существует
   */
  async register(
    email: string,
    password: string,
  ): Promise<TokenPair> {
    // Проверяем уникальность email до создания записи
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });

    // Создаём токены — пользователь сразу входит после регистрации
    return this.createTokenPair(user.id);
  }

  /**
   * Вход по email/паролю.
   *
   * @param email — email пользователя
   * @param password — открытый пароль
   * @param userAgent — User-Agent браузера (сохраняется в сессии для аудита)
   * @param ip — IP-адрес клиента (сохраняется в сессии для аудита)
   * @returns TokenPair
   * @throws UnauthorizedException — если пользователь не найден, удалён или пароль неверный
   */
  async login(
    email: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // deletedAt != null — мягко удалённый аккаунт, доступ закрыт
    // Одинаковое сообщение "Invalid credentials" скрывает факт существования email
    if (!user || user.deletedAt) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // bcrypt.compare — timing-safe сравнение (защита от timing attacks)
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createTokenPair(user.id, userAgent, ip);
  }

  /**
   * Обновление access-токена (Refresh Token Rotation).
   *
   * При каждом refresh:
   * 1. Старая сессия удаляется из БД
   * 2. Новая сессия создаётся с новым refresh-токеном
   *
   * Это предотвращает повторное использование перехваченного refresh-токена.
   *
   * @param refreshToken — UUID из предыдущего ответа
   * @returns TokenPair — новая пара (старый refreshToken больше не действует)
   * @throws UnauthorizedException — если токен не существует или истёк
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
    });

    if (!session || session.expiresAt < new Date()) {
      // Удаляем истекшую сессию чтобы не засорять БД (если она была найдена)
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Ротация: удаляем старую сессию, создаём новую пару
    await this.prisma.session.delete({ where: { id: session.id } });
    return this.createTokenPair(session.userId);
  }

  /**
   * Выход: инвалидирует refresh-токен (удаляет сессию из БД).
   * Идемпотентен — если сессия уже удалена, ошибки не будет.
   *
   * @param refreshToken — UUID токен для удаления
   */
  async logout(refreshToken: string): Promise<void> {
    // deleteMany не кидает ошибку если запись не найдена (идемпотентность)
    await this.prisma.session.deleteMany({ where: { refreshToken } });
  }

  /**
   * Создаёт JWT access-токен и UUID refresh-токен, записывает Session в БД.
   *
   * @param userId — ID пользователя (идёт в JWT claim `sub`)
   * @param userAgent — для сохранения в сессии (аудит)
   * @param ip — для сохранения в сессии (аудит)
   */
  private async createTokenPair(
    userId: string,
    userAgent?: string,
    ip?: string,
  ): Promise<TokenPair> {
    // Подписываем JWT: payload { sub: userId }, TTL из JWT_TTL_SECONDS
    const accessToken = this.jwt.sign({ sub: userId });

    // Refresh-токен — случайный UUID (непредсказуемый, не содержит данных)
    const refreshToken = randomUUID();

    // Дата истечения refresh-токена
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    // Сохраняем сессию в PostgreSQL (позволяет отозвать токен через logout)
    await this.prisma.session.create({
      data: { userId, refreshToken, userAgent, ip, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
