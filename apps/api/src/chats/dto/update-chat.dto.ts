/**
 * @file update-chat.dto.ts
 * @description DTO для обновления названия чата (PATCH /chats/:id).
 */

import { IsOptional, IsString } from "class-validator";

/**
 * Тело запроса PATCH /chats/:id.
 * В текущей реализации позволяет изменить только название чата.
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
}
