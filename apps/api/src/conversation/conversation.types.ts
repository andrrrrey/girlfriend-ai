/**
 * @file conversation.types.ts
 * @description Типы единого ядра обработки сообщений (ConversationEngine).
 */

import type { ChatsService } from "../chats/chats.service";

/** Чат с персонажем и профилем — результат ChatsService.getChat. */
export type ChatWithContext = Awaited<ReturnType<ChatsService["getChat"]>>;

/** Канал, из которого пришло сообщение. */
export type MessageSource = "web" | "telegram" | "system" | "proactive";

/** Кто действует в диалоге (владелец чата). */
export interface ConversationActor {
  id: string;
  subscription: string;
  contentMode?: string;
  /** false — пользователь не подтвердил 18+, контент принудительно SFW. */
  isAdult?: boolean | null;
}

/**
 * Событие ядра. Адаптер канала превращает их в свой формат
 * (SSE для сайта, сообщения Bot API для Telegram).
 */
export type EngineEvent =
  /** Распознанный текст голосового сообщения (идёт первым в голосовом потоке). */
  | { type: "transcription"; text: string }
  /** Событие стрима модели как есть: { content } | { done, usage } | { error }. */
  | { type: "llm"; data: Record<string, unknown> }
  /** Обработка завершена. messageId — сохранённый ответ ассистента (если есть). */
  | {
      type: "done";
      messageId?: string;
      /** Ответ не генерировался заново — отдан сохранённый (повтор запроса). */
      replayed?: boolean;
      /** Ответ оборван или модель вернула ошибку. */
      failed?: boolean;
      error?: string;
    };

/** Общие параметры всех операций ядра. */
export interface EngineBaseInput {
  chatId: string;
  actor: ConversationActor;
  /** Канал (по умолчанию "web"). Ответ ассистента сохраняется с тем же источником. */
  source?: MessageSource;
  /** Отмена клиентом: ответ модели прерывается, частичный текст сохраняется как failed. */
  signal?: AbortSignal;
  /** Проверять лимиты бесплатного тарифа (по умолчанию true; false — системные вызовы). */
  enforceLimits?: boolean;
  /** Списывать кредиты с кошелька владельца (по умолчанию true; false — служебные вызовы админки). */
  billable?: boolean;
}

/** Текстовое сообщение пользователя. */
export interface UserTextInput extends EngineBaseInput {
  content: string;
  /** Идемпотентный ключ клиента: повтор с тем же ключом не создаёт дубль. */
  clientMessageId?: string;
  /** Внешний ID в канале (update_id Telegram): повтор не обрабатывается дважды. */
  externalId?: string;
}

/** Голосовое сообщение пользователя. */
export interface UserVoiceInput extends EngineBaseInput {
  audio: { buffer: Buffer; mimetype: string; originalname?: string };
  /** Подсказка языка для распознавания. */
  language?: string;
  clientMessageId?: string;
  externalId?: string;
}

/** Первое приветствие персонажа в пустом чате. */
export interface GreetingInput extends EngineBaseInput {
  lang?: "en" | "ru";
}

/** Правка сообщения пользователя с перегенерацией ответа. */
export interface EditInput extends EngineBaseInput {
  messageId: string;
  content: string;
}

/** Перегенерация ответа ассистента. */
export interface RegenerateInput extends EngineBaseInput {
  messageId: string;
}

/** Ответ персонажа на текущую историю без нового сообщения пользователя. */
export interface RespondInput extends EngineBaseInput {
  /** Сколько последних сообщений брать в контекст (по умолчанию 20). */
  historyLimit?: number;
  /** Переопределения контекста (например, профиль робота в автопереписке). */
  contentMode?: string;
  userProfile?: string;
  /** Доп. поля для AiJob.input и metadata ответа. */
  jobInput?: Record<string, unknown>;
  replyMetadata?: Record<string, unknown>;
}
