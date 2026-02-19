/**
 * @file update-profile.dto.ts
 * @description DTO для частичного обновления профиля пользователя.
 * Все поля опциональны — можно передать только те, что изменились.
 */

import { IsOptional, IsString, MaxLength, IsIn } from "class-validator";

/**
 * Тело запроса PATCH /users/me
 */
export class UpdateProfileDto {
  /**
   * Отображаемое имя пользователя.
   * Максимум 50 символов. Опциональное.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  /**
   * URL аватара пользователя.
   * Обычно ссылка на загруженное изображение в S3/MinIO.
   */
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /**
   * Язык интерфейса.
   * Допустимые значения: "en" | "ru".
   * Используется фронтендом для локализации.
   */
  @IsOptional()
  @IsString()
  @IsIn(["en", "ru"])
  lang?: string;
}
