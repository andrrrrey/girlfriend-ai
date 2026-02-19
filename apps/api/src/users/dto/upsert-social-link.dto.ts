/**
 * @file upsert-social-link.dto.ts
 * @description DTO для создания или обновления ссылки на социальную сеть.
 *
 * Используется в PUT /users/me/social-links.
 * Допустимые провайдеры жёстко ограничены — добавление нового провайдера
 * требует обновления @IsIn() и, возможно, схемы БД.
 */

import { IsIn, IsString, IsUrl } from "class-validator";

/**
 * Тело запроса PUT /users/me/social-links
 */
export class UpsertSocialLinkDto {
  /**
   * Идентификатор социальной сети.
   * Допустимые значения: "vk" | "instagram" | "x"
   * Используется как часть уникального ключа { userId, provider } в таблице SocialLink.
   */
  @IsString()
  @IsIn(["vk", "instagram", "x"])
  provider!: string;

  /**
   * URL профиля пользователя в социальной сети.
   * Должен быть валидным URL (@IsUrl валидатор class-validator).
   * Пример: "https://vk.com/username"
   */
  @IsString()
  @IsUrl()
  url!: string;
}
