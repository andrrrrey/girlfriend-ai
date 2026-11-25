import { IsBoolean, IsInt, IsOptional, IsString, MinLength, IsArray, ArrayMaxSize, MaxLength } from "class-validator";

export class UpdateSceneOptionDto {
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

  /** Показывать ли вариант на сайте (скрытые варианты видны только в админке). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Синонимы (ru/en) — как пользователь может назвать опцию в сообщении. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  synonyms?: string[];
}
