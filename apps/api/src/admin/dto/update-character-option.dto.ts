import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateCharacterOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
