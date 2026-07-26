import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

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
}
