import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from "class-validator";

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

  @IsOptional()
  @IsString()
  generationStyle?: string;

  /** Опция NSFW: при SFW-режиме скрывается в пикерах генерации. */
  @IsOptional()
  @IsBoolean()
  nsfw?: boolean;
}
