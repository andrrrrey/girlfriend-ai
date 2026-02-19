/**
 * @file change-password.dto.ts
 * @description DTO для смены пароля пользователя.
 *
 * Требует подтверждение текущего пароля — защита от несанкционированного
 * изменения при перехвате активной сессии (CSRF/сессионный hijacking).
 */

import { IsString, MinLength } from "class-validator";

/**
 * Тело запроса PATCH /users/me/password
 */
export class ChangePasswordDto {
  /**
   * Текущий пароль для подтверждения личности.
   * Проверяется через bcrypt.compare() в UsersService.changePassword().
   */
  @IsString()
  currentPassword!: string;

  /**
   * Новый пароль.
   * Минимум 6 символов. Будет захеширован bcrypt перед сохранением.
   */
  @IsString()
  @MinLength(6)
  newPassword!: string;
}
