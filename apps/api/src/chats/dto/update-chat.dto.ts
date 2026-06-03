/**
 * @file update-chat.dto.ts
 * @description DTO для обновления названия чата (PATCH /chats/:id).
 */

import { IsOptional, IsString, IsUUID, ValidateIf } from "class-validator";

/**
 * Тело запроса PATCH /chats/:id.
 * Позволяет изменить название чата и/или выбранный чат-профиль (персону).
 * Все поля опциональны — передавайте только то, что нужно изменить.
 */
export class UpdateChatDto {
  /**
   * Новое название чата.
   * Если не передано — название не меняется.
   */
  @IsOptional()
  @IsString()
  title?: string;

  /**
   * ID выбранного чат-профиля (персоны пользователя), который персонаж учитывает
   * в диалоге. Передайте null, чтобы сбросить выбор ("без профиля").
   */
  @IsOptional()
  @ValidateIf((o) => o.chatProfileId !== null)
  @IsUUID()
  chatProfileId?: string | null;
}
