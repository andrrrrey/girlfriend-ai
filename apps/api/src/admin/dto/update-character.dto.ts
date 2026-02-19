/**
 * @file update-character.dto.ts
 * @description DTO для частичного обновления существующего AI-персонажа.
 *
 * Используется в маршруте `PATCH /admin/characters/:id`.
 * В отличие от {@link CreateCharacterDto}, все поля являются опциональными —
 * в теле запроса достаточно передать только те поля, которые нужно изменить.
 * Отсутствующие поля остаются без изменений в базе данных.
 *
 * Валидация выполняется с помощью декораторов `class-validator`.
 */

import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

/**
 * DTO обновления AI-персонажа.
 *
 * Описывает структуру тела HTTP-запроса при частичном обновлении персонажа.
 * Все поля опциональны — можно обновить как одно поле, так и несколько сразу.
 * Семантика каждого поля идентична {@link CreateCharacterDto}.
 *
 * @example
 * ```json
 * {
 *   "systemPrompt": "Обновлённые инструкции для персонажа...",
 *   "isPublic": false
 * }
 * ```
 */
export class UpdateCharacterDto {
  /**
   * Новое отображаемое имя персонажа.
   *
   * Если передано — заменяет текущее имя в базе данных.
   *
   * @example "Маша"
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Новый системный промпт персонажа.
   *
   * Полностью заменяет текущие инструкции для языковой модели.
   * Определяет личность, манеру речи и контекст персонажа.
   *
   * @example "Ты — загадочная девушка по имени Маша с острым умом..."
   */
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  /**
   * Обновлённый JSON-объект с чертами личности персонажа.
   *
   * Полностью заменяет текущий объект `personality`. Может содержать
   * произвольные структурированные данные о характере персонажа.
   *
   * @example { "tone": "mysterious", "interests": ["books", "chess"] }
   */
  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

  /**
   * Новый URL изображения аватара персонажа.
   *
   * Заменяет текущую ссылку на аватар. Отображается в интерфейсе чата.
   *
   * @example "https://cdn.example.com/avatars/masha.jpg"
   */
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  /**
   * Новый идентификатор голоса ElevenLabs.
   *
   * Заменяет текущий голосовой профиль персонажа. Используется при
   * синтезе речи в голосовых ответах AI.
   *
   * @example "pNInz6obpgDQGcFmaJgB"
   */
  @IsOptional()
  @IsString()
  voiceId?: string;

  /**
   * Новый массив тегов персонажа.
   *
   * Полностью заменяет текущий набор тегов. Каждый элемент должен
   * быть строкой. Используется для фильтрации и категоризации.
   *
   * @example ["mysterious", "intellectual"]
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /**
   * Новое значение флага публичности персонажа.
   *
   * `true` — персонаж виден всем пользователям.
   * `false` — персонаж скрыт, доступен только администраторам.
   *
   * @example false
   */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
