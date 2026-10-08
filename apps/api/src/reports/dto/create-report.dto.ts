import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayMaxSize,
} from "class-validator";

export class CreateReportDto {
  /** Легаси-поле: цель-персонаж (эквивалент targetType="character"). */
  @IsOptional()
  @IsUUID()
  characterId?: string;

  /** Полиморфная цель: "character" | "short" | "image" (фото из галереи). */
  @IsOptional()
  @IsString()
  @IsIn(["character", "short", "image"])
  targetType?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  reasons: string[] = [];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
