import { IsString, MinLength, MaxLength } from "class-validator";

/**
 * Тело запроса для создания чат-профиля (персоны пользователя).
 */
export class CreateChatProfileDto {
  /** Короткое имя/заголовок профиля — отображается в выпадающем списке. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** Описание персоны: кто пользователь, его интересы и контекст для диалога. */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;
}
