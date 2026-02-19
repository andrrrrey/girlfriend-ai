/**
 * @file send-message.dto.ts
 * @description DTO для отправки текстового сообщения (POST /chats/:id/messages).
 */

import { IsString, MinLength } from "class-validator";

/**
 * Тело запроса POST /chats/:chatId/messages.
 * После валидации сохраняется как Message (role: "user") и ставится задание
 * ai:chat в BullMQ для генерации AI-ответа.
 */
export class SendMessageDto {
  /**
   * Текст сообщения пользователя.
   * Минимум 1 символ — запрещены пустые сообщения.
   */
  @IsString()
  @MinLength(1)
  content!: string;
}
