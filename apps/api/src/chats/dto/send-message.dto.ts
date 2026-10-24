/**
 * @file send-message.dto.ts
 * @description DTO для отправки текстового сообщения (POST /chats/:id/messages).
 */

import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Тело запроса POST /chats/:chatId/messages.
 * После валидации передаётся в ConversationEngine.handleUserText: сообщение
 * сохраняется (role: "user"), ответ персонажа стримится через SSE.
 */
export class SendMessageDto {
  /**
   * Текст сообщения пользователя.
   * Минимум 1 символ — запрещены пустые сообщения.
   */
  @IsString()
  @MinLength(1)
  content!: string;

  /**
   * Идемпотентный ключ клиента (генерируется на фронте на каждое сообщение).
   * Повторная отправка с тем же ключом не создаёт дубль — отдаётся сохранённый ответ.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;
}
