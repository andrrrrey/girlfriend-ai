import { IsIn, IsOptional, IsString, IsUUID, MinLength, MaxLength } from "class-validator";

export class CreateCommentDto {
  /** Легаси-поле: цель-персонаж. Эквивалент targetType="character", targetId=characterId. */
  @IsOptional()
  @IsUUID()
  characterId?: string;

  /** Полиморфная цель: "character" | "short". */
  @IsOptional()
  @IsString()
  @IsIn(["character", "short"])
  targetType?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  content!: string;
}
