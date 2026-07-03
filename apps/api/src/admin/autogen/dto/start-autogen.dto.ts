import { IsInt, Max, Min } from "class-validator";

/** Тело запроса на запуск автогенерации: сколько персонажей создать. */
export class StartAutogenDto {
  @IsInt()
  @Min(1)
  @Max(200)
  count!: number;
}
