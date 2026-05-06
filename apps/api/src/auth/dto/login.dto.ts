/**
 * @file login.dto.ts
 * @description DTO для запроса входа пользователя.
 *
 * Намеренно не валидирует длину пароля (только @IsString) — при входе
 * мы не знаем требований, только проверяем совпадение с хешем в БД.
 */

import { IsEmail, IsOptional, IsString } from "class-validator";

/**
 * Тело запроса POST /auth/login
 */
export class LoginDto {
  /** Email пользователя */
  @IsEmail()
  email!: string;

  /** Пароль в открытом виде (будет проверен через bcrypt.compare) */
  @IsString()
  password!: string;

  @IsString()
  @IsOptional()
  turnstileToken?: string;
}
