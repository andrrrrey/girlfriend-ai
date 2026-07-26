/**
 * @file register.dto.ts
 * @description DTO для запроса регистрации нового пользователя.
 *
 * Валидируется глобальным ValidationPipe (whitelist + forbidNonWhitelisted).
 * Неизвестные поля в теле запроса вызовут HTTP 400.
 */

import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

/**
 * Тело запроса POST /auth/register
 */
export class RegisterDto {
  /** Email пользователя. Должен быть валидным email-адресом. */
  @IsEmail()
  email!: string;

  /**
   * Пароль в открытом виде.
   * Минимальная длина: 6 символов.
   * Будет захеширован bcrypt (BCRYPT_ROUNDS=10) перед сохранением в БД.
   */
  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsOptional()
  turnstileToken?: string;

  /**
   * Подтверждение возраста 18+ на форме регистрации.
   * Если false (пользователь указал <18) — режим контента форсится в SFW.
   * Опционально для обратной совместимости; отсутствие трактуется как 18+.
   */
  @IsBoolean()
  @IsOptional()
  isAdult?: boolean;
}
