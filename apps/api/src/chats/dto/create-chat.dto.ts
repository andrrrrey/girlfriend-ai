/**
 * @file create-chat.dto.ts
 * @description DTO для создания нового чата (POST /chats).
 */

import { IsOptional, IsString, IsUUID } from "class-validator";

/**
 * Тело запроса POST /chats.
 * Создаёт новую ChatSession для текущего пользователя с указанным персонажем.
 */
export class CreateChatDto {
  /**
   * UUID персонажа, с которым открывается чат.
   * Персонаж должен существовать и быть публичным (isPublic: true)
   * или принадлежать пользователю.
   */
  @IsUUID()
  characterId!: string;

  /**
   * Название чата (опционально).
   * Если не задано — отображается имя персонажа или автогенерируется.
   */
  @IsOptional()
  @IsString()
  title?: string;
}
