import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

/** Тело запроса на запуск автопереписки. */
export class StartAutochatDto {
  /** Персонажи, с которыми робот будет вести автопереписку. */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  characterIds!: string[];

  /** Сколько реплик персонажа сгенерировать на каждого персонажа. */
  @IsInt()
  @Min(1)
  @Max(500)
  turnsPerChar!: number;

  /** Режим контента диалогов: "nsfw" | "sfw". По умолчанию nsfw. */
  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: "nsfw" | "sfw";
}
