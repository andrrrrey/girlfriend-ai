/**
 * @file roles.guard.ts
 * @description Guard для ролевой авторизации (RBAC — Role-Based Access Control).
 *
 * Работает в связке с декоратором @Roles():
 * 1. @Roles("admin") устанавливает метаданные "roles" на обработчик/класс
 * 2. RolesGuard читает эти метаданные через Reflector
 * 3. Сравнивает с req.user.role (установленным JwtStrategy.validate())
 * 4. Возвращает true (разрешить) или false (403 Forbidden)
 *
 * ВАЖНО: RolesGuard должен применяться ПОСЛЕ JwtAuthGuard,
 * иначе req.user будет undefined.
 *
 * @example
 * // Разрешить только пользователям с ролью "admin":
 * @Controller("admin")
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles("admin")
 * export class AdminController { ... }
 *
 * // Для эндпоинта без @Roles — доступ разрешён всем аутентифицированным
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

/** Ключ метаданных для хранения требуемых ролей */
export const ROLES_KEY = "roles";

/**
 * Декоратор для установки требуемых ролей на контроллере или методе.
 *
 * @param roles — список допустимых ролей (например "admin", "user")
 *
 * @example
 * @Roles("admin")           // Только администраторы
 * @Roles("admin", "moderator")  // Несколько ролей
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Guard для проверки роли пользователя.
 *
 * Реализует CanActivate — возвращает boolean синхронно (без БД-запросов,
 * т.к. роль уже загружена JwtStrategy в req.user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Проверяет, имеет ли текущий пользователь одну из требуемых ролей.
   *
   * getAllAndOverride — читает метаданные с приоритетом метода над классом:
   * если метод имеет @Roles("admin") и класс @Roles("user") — побеждает метод.
   *
   * @returns true — если ролей не требуется ИЛИ роль пользователя в списке
   * @returns false — если роль не подходит (NestJS вернёт 403 Forbidden)
   */
  canActivate(context: ExecutionContext): boolean {
    // Читаем требуемые роли из метаданных (сначала метод, потом класс)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(), // Метод-обработчик (приоритет)
      context.getClass(),   // Класс-контроллер (fallback)
    ]);

    // Если роли не указаны (@Roles не применялся) — доступ разрешён всем аутентифицированным
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // req.user устанавливается JwtStrategy.validate() — поле role из БД
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
