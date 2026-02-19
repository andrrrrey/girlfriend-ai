/**
 * @file jwt.strategy.ts
 * @description Passport JWT-стратегия для аутентификации входящих запросов.
 *
 * Как работает:
 * 1. @UseGuards(JwtAuthGuard) активирует эту стратегию для эндпоинта
 * 2. Passport извлекает JWT из заголовка: Authorization: Bearer <token>
 * 3. Verifies подпись токена с использованием JWT_SECRET
 * 4. Вызывает validate(payload) с декодированным payload
 * 5. Результат validate() присваивается req.user и становится доступным в контроллере
 *
 * Поля req.user: { id, email, nickname, role, subscription, lang }
 * (passwordHash и другие чувствительные поля намеренно исключены через select)
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../prisma.service";
import { loadEnv } from "@repo/config";

/**
 * Интерфейс декодированного JWT payload.
 * Стандартный claim `sub` (subject) содержит userId.
 */
interface JwtPayload {
  sub: string; // userId — устанавливается в AuthService.createTokenPair()
}

/**
 * Passport-стратегия для JWT аутентификации.
 *
 * Наследует от PassportStrategy(Strategy) где Strategy — passport-jwt Strategy.
 * Имя стратегии: "jwt" (по умолчанию для passport-jwt).
 * Используется в JwtAuthGuard через AuthGuard("jwt").
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const env = loadEnv();
    super({
      // Извлекаем JWT из заголовка Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Секрет для верификации подписи (должен совпадать с ключом подписи в AuthService)
      secretOrKey: env.JWT_SECRET,
      // ignoreExpiration: false (по умолчанию) — истёкшие токены отклоняются
    });
  }

  /**
   * Вызывается Passport после успешной верификации JWT.
   * Загружает актуальные данные пользователя из БД.
   *
   * Зачем загружать из БД, а не брать из токена?
   * - Токен может быть действующим, но пользователь удалён/заблокирован
   * - Данные в токене могут устареть (изменилась роль, подписка)
   *
   * @param payload — декодированный JWT payload { sub: userId }
   * @returns объект пользователя — будет присвоен req.user
   * @throws UnauthorizedException — если пользователь не найден (удалён)
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,           // Нужен для RolesGuard (проверка admin-роли)
        subscription: true,   // Нужен для DemoService (проверка лимитов)
        lang: true,
        // passwordHash и другие чувствительные поля — НЕ выбираем
      },
    });

    if (!user) {
      // Токен валидный, но пользователь удалён из БД
      throw new UnauthorizedException();
    }

    // Возвращаемый объект становится req.user в контроллерах
    return user;
  }
}
