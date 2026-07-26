import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateAppearanceOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

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

  /** Опция NSFW: при SFW-режиме скрывается в пикерах генерации. */
  @IsOptional()
  @IsBoolean()
  nsfw?: boolean;
}
