import { IsOptional, IsString, MinLength, MaxLength } from "class-validator";

/**
 * Тело запроса для обновления чат-профиля. Все поля опциональны.
 */
export class UpdateChatProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description?: string;
}
