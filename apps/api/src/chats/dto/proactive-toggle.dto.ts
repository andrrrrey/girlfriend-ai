import { IsBoolean } from "class-validator";

/** Тело POST /chats/:id/proactive — может ли персонаж писать первым в этом чате. */
export class ProactiveToggleDto {
  @IsBoolean()
  enabled!: boolean;
}
