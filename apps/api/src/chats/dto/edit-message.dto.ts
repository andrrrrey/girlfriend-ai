/**
 * @file edit-message.dto.ts
 * @description DTO для редактирования сообщения (PATCH /chats/:chatId/messages/:messageId).
 */

import { IsString, MinLength } from "class-validator";

/**
 * Тело запроса PATCH /chats/:chatId/messages/:messageId.
 *
 * Используется для двух операций:
 * 1. Редактирование пользовательского сообщения — обновляет content,
 *    каскадно удаляет все последующие сообщения и стримит новый AI-ответ
 * 2. Обновление AI-ответа (внутреннее использование после перегенерации)
 */
export class EditMessageDto {
  /**
   * Новый текст сообщения.
   * Минимум 1 символ — пустой текст не допускается.
   */
  @IsString()
  @MinLength(1)
  content!: string;
}
