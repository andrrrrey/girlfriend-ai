/**
 * @file greeting.dto.ts
 * @description DTO для генерации первого приветствия персонажа (POST /chats/:id/greeting).
 */

import { IsIn, IsOptional, IsString } from "class-validator";

/**
 * Тело запроса POST /chats/:chatId/greeting.
 * `lang` определяет язык приветствия (скрытый kickoff для LLM). По умолчанию "en".
 */
export class GreetingDto {
  /** Язык приветствия: "en" | "ru". */
  @IsOptional()
  @IsString()
  @IsIn(["en", "ru"])
  lang?: "en" | "ru";
}
