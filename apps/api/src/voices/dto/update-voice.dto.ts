import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

/** DTO частичного обновления голоса (`PATCH /admin/voices/:id`). */
export class UpdateVoiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  voiceId?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
