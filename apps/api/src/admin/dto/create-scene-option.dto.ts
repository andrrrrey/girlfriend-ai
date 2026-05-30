import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSceneOptionDto {
  @IsString()
  @MinLength(1)
  categoryId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageThumbKey?: string;

  @IsOptional()
  @IsString()
  imageFullKey?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
