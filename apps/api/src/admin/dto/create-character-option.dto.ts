import { IsBoolean, IsInt, IsOptional, IsString, MinLength, IsArray, ArrayMaxSize, MaxLength } from "class-validator";

export class CreateCharacterOptionDto {
  @IsString()
  @MinLength(1)
  category!: string;

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

  @IsOptional()
  @IsString()
  generationStyle?: string;

  /** Опция NSFW: при SFW-режиме скрывается в пикерах генерации. */
  @IsOptional()
  @IsBoolean()
  nsfw?: boolean;

  /** Синонимы (ru/en) — как пользователь может назвать опцию в сообщении. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  synonyms?: string[];
}
