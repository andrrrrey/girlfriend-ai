import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Тело запроса на запуск автогенерации: сколько персонажей создать. */
export class StartAutogenDto {
  @IsInt()
  @Min(1)
  @Max(200)
  count!: number;

  /** Режим генерируемых персонажей: "nsfw" | "sfw". По умолчанию nsfw. */
  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: "nsfw" | "sfw";

  /**
   * id опций STYLE (Настройки генераций → Style), в которых создавать персонажей.
   * Пусто/не задано — все стили. Несколько — поровну от count (по кругу).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  styleIds?: string[];
}
