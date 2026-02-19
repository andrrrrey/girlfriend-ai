/**
 * @file refresh.dto.ts
 * @description DTO для запросов обновления токена и выхода из системы.
 *
 * Используется в двух эндпоинтах:
 * - POST /auth/refresh — обмен refresh-токена на новую пару
 * - POST /auth/logout  — инвалидация refresh-токена
 */

import { IsString } from "class-validator";

/**
 * Тело запроса с refresh-токеном.
 * Refresh-токен — это UUID v4, генерируемый в AuthService.createTokenPair().
 */
export class RefreshDto {
  /** UUID refresh-токен из предыдущего ответа /auth/login или /auth/refresh */
  @IsString()
  refreshToken!: string;
}
