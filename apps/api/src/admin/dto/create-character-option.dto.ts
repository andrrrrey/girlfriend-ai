import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCharacterOptionDto {
  @IsString()
  @MinLength(1)
  category!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
