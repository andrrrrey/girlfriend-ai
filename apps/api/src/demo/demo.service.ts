/**
 * @file demo.service.ts
 * @description Сервис управления лимитами демо-пользователей (бесплатный тарифный план).
 *
 * Логика работы:
 * - Пользователи на тарифе "free" считаются демо-пользователями с ограниченным доступом.
 * - Голосовые функции (STT и TTS) полностью заблокированы для бесплатных пользователей.
 * - Количество сообщений в чате ограничено суточным лимитом ({@link DEMO_LIMITS}).
 * - Счётчик использования хранится в таблице `UsageCounter` в БД.
 * - Счётчик сбрасывается в 23:59:59 текущего дня (по локальному времени сервера).
 *
 * Типы действий (DemoAction):
 * - `chat_message` — отправка сообщения в чат (лимитируется)
 * - `stt` — распознавание речи (полностью заблокировано для free)
 * - `tts` — синтез речи (полностью заблокировано для free)
 */

import { ForbiddenException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/**
 * Суточные лимиты для пользователей на бесплатном тарифе.
 * Ключ — тип действия, значение — максимальное количество операций в день.
 */
export const DEMO_LIMITS = {
  chat_message: 20,
} as const;

/**
 * Тип действия, отслеживаемого системой демо-лимитов.
 * - `chat_message` — отправка текстового сообщения в чат
 * - `stt` — преобразование речи в текст (Speech-to-Text)
 * - `tts` — преобразование текста в речь (Text-to-Speech)
 */
export type DemoAction = "chat_message" | "stt" | "tts";

/**
 * Возвращает объект Date, соответствующий концу текущего дня (23:59:59.999).
 * Используется как время сброса счётчика использования.
 *
 * @returns {Date} Конец текущего дня по локальному времени сервера
 */
function endOfDay(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Сервис управления лимитами для демо-пользователей (тариф "free").
 *
 * Отвечает за:
 * - Проверку доступа к голосовым функциям
 * - Контроль и инкремент суточного счётчика сообщений
 * - Получение текущей статистики использования по пользователю
 */
@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Проверяет, является ли пользователь бесплатным (демо).
   *
   * @param {string} subscription - Идентификатор тарифного плана пользователя
   * @returns {boolean} `true`, если пользователь на тарифе "free"
   */
  private isFree(subscription: string): boolean {
    return subscription === "free";
  }

  /**
   * Проверяет доступность голосовых функций (STT и TTS) для пользователя.
   *
   * Для бесплатных пользователей голосовые функции полностью заблокированы.
   * Метод должен вызываться перед запуском любой голосовой операции.
   *
   * @param {string} subscription - Идентификатор тарифного плана пользователя
   * @throws {ForbiddenException} Если пользователь на тарифе "free" —
   *   выбрасывает исключение с кодом `DEMO_FEATURE_BLOCKED`
   */
  checkVoiceAllowed(subscription: string): void {
    if (this.isFree(subscription)) {
      throw new ForbiddenException({
        error: "DEMO_FEATURE_BLOCKED",
        feature: "voice",
        message: "Голосовые функции доступны только по подписке",
      });
    }
  }

  /**
   * Проверяет суточный лимит сообщений для бесплатного пользователя и увеличивает счётчик.
   *
   * Алгоритм работы:
   * 1. Если пользователь не на тарифе "free" — завершает выполнение без действий.
   * 2. Ищет запись `UsageCounter` для пары (userId, "chat_message").
   * 3. Если запись не найдена или истёк срок сброса (`resetAt < now`) — создаёт/обновляет
   *    запись с count=1 и новым временем сброса (конец текущего дня).
   * 4. Если счётчик достиг лимита — выбрасывает HTTP 429 с деталями превышения.
   * 5. В противном случае инкрементирует счётчик на 1.
   *
   * @param {string} userId - Идентификатор пользователя в системе
   * @param {string} subscription - Идентификатор тарифного плана пользователя
   * @returns {Promise<void>} Завершается без значения при успешной проверке
   * @throws {HttpException} HTTP 429 (Too Many Requests) с кодом `DEMO_LIMIT_REACHED`,
   *   если пользователь исчерпал дневной лимит сообщений. Тело ответа содержит:
   *   - `error`: код ошибки `"DEMO_LIMIT_REACHED"`
   *   - `action`: тип действия `"chat_message"`
   *   - `limit`: максимальное количество сообщений в день
   *   - `used`: текущее количество использованных сообщений
   *   - `message`: читаемое сообщение об ошибке на русском языке
   *   - `resetAt`: время сброса счётчика
   */
  async checkAndIncrementMessage(userId: string, subscription: string): Promise<void> {
    if (!this.isFree(subscription)) return;

    const now = new Date();
    const limit = DEMO_LIMITS.chat_message;

    const counter = await this.prisma.usageCounter.findUnique({
      where: { userId_action: { userId, action: "chat_message" } },
    });

    // Reset or create counter if expired
    if (!counter || counter.resetAt < now) {
      await this.prisma.usageCounter.upsert({
        where: { userId_action: { userId, action: "chat_message" } },
        create: { userId, action: "chat_message", count: 1, resetAt: endOfDay() },
        update: { count: 1, resetAt: endOfDay() },
      });
      return;
    }

    if (counter.count >= limit) {
      throw new HttpException(
        {
          error: "DEMO_LIMIT_REACHED",
          action: "chat_message",
          limit,
          used: counter.count,
          message: `Достигнут дневной лимит ${limit} сообщений. Оформите подписку для безлимитного общения.`,
          resetAt: counter.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.usageCounter.update({
      where: { userId_action: { userId, action: "chat_message" } },
      data: { count: { increment: 1 } },
    });
  }

  /**
   * Возвращает текущую статистику использования для указанного пользователя.
   *
   * Для каждого действия возвращает текущий счётчик, установленный лимит и время сброса.
   * Если для действия нет записи в БД — оно не будет включено в результат.
   *
   * @param {string} userId - Идентификатор пользователя в системе
   * @returns {Promise<Array<{ action: string; count: number; limit: number; resetAt: Date }>>}
   *   Массив объектов с информацией об использовании:
   *   - `action`: тип действия (например, `"chat_message"`)
   *   - `count`: количество совершённых действий за текущий период
   *   - `limit`: суточный лимит для данного действия (0 если лимит не задан)
   *   - `resetAt`: время сброса счётчика
   */
  async getUsage(userId: string): Promise<{ action: string; count: number; limit: number; resetAt: Date }[]> {
    const counters = await this.prisma.usageCounter.findMany({
      where: { userId },
    });

    return counters.map((c) => ({
      action: c.action,
      count: c.count,
      limit: DEMO_LIMITS[c.action as keyof typeof DEMO_LIMITS] ?? 0,
      resetAt: c.resetAt,
    }));
  }
}
