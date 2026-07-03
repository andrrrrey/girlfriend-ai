import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

/**
 * DTO создания голоса через админ-API (`POST /admin/voices`).
 * Обязательны `name` (отображаемое имя) и `voiceId` (идентификатор голоса
 * ElevenLabs, используемый при синтезе речи).
 */
export class CreateVoiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  voiceId!: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
