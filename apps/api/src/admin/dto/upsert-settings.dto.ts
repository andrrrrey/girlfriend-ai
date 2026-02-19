/**
 * @file upsert-settings.dto.ts
 * @description DTO для массового создания или обновления настроек приложения.
 *
 * Используется в маршруте `PUT /admin/settings`.
 * Принимает произвольный набор пар ключ/значение, где каждая пара соответствует
 * одной записи `AppSetting` в базе данных. Операция является идемпотентной:
 * существующие ключи обновляются, отсутствующие создаются.
 *
 * Типичные ключи настроек: `OPENAI_API_KEY`, `OPENAI_MODEL`,
 * `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` и другие конфигурационные параметры,
 * которые могут меняться без перезапуска сервиса.
 */

import { IsObject } from "class-validator";

/**
 * DTO массового обновления настроек приложения.
 *
 * Оборачивает карту настроек в поле `settings`, что обеспечивает
 * валидацию типа на уровне NestJS/class-validator и явную структуру
 * тела запроса.
 *
 * @example
 * ```json
 * {
 *   "settings": {
 *     "OPENAI_API_KEY": "sk-proj-...",
 *     "OPENAI_MODEL": "gpt-4o",
 *     "ELEVENLABS_API_KEY": "sk_...",
 *     "ELEVENLABS_MODEL": "eleven_multilingual_v2"
 *   }
 * }
 * ```
 */
export class UpsertSettingsDto {
  /**
   * Карта настроек для создания или обновления.
   *
   * Объект, где:
   * - ключи — уникальные идентификаторы настроек (например, `"OPENAI_MODEL"`).
   * - значения — строковые значения настроек.
   *
   * Все переданные пары применяются в рамках одной транзакции.
   * Настройки, не указанные в запросе, не затрагиваются.
   *
   * @example { "OPENAI_API_KEY": "sk-proj-...", "OPENAI_MODEL": "gpt-4o" }
   */
  @IsObject()
  settings!: Record<string, string>;
}
