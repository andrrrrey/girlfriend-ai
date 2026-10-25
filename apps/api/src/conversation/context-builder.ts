/**
 * @file context-builder.ts
 * @description Сборка контекста запроса к модели: история диалога, режим контента,
 * профиль пользователя. Единая точка, куда позже добавятся summary и долговременная память.
 */

import { Injectable } from "@nestjs/common";
import { ChatsService } from "../chats/chats.service";
import type { LlmChatRequest } from "./llm.adapter";
import type { ChatWithContext, ConversationActor } from "./conversation.types";

/** Сколько последних сообщений по умолчанию идёт в контекст модели. */
export const DEFAULT_HISTORY_LIMIT = 20;

/** Параметры сборки контекста. */
export interface ContextOptions {
  /** Готовые сообщения вместо истории из БД (скрытый kickoff приветствия). */
  messages?: { role: string; content: string }[];
  historyLimit?: number;
  contentMode?: string;
  userProfile?: string;
  /**
   * Служебная пометка к последнему сообщению пользователя — только для запроса к
   * модели, в истории не сохраняется (например: «ты отправляешь фото»).
   */
  lastUserNote?: string;
}

@Injectable()
export class ContextBuilder {
  constructor(private readonly chats: ChatsService) {}

  /** Режим контента: несовершеннолетний (isAdult=false) всегда получает SFW. */
  static resolveContentMode(actor: ConversationActor): string | undefined {
    return actor.isAdult === false ? "sfw" : actor.contentMode;
  }

  /** Описание выбранного чат-профиля (персоны) для промпта, если он не удалён. */
  static resolveUserProfile(chat: ChatWithContext): string | undefined {
    return chat.chatProfile && !chat.chatProfile.deletedAt
      ? `${chat.chatProfile.name}: ${chat.chatProfile.description}`
      : undefined;
  }

  async build(chat: ChatWithContext, actor: ConversationActor, opts: ContextOptions = {}): Promise<LlmChatRequest> {
    const messages =
      opts.messages ??
      (
        await this.chats.getMessageHistory(chat.id, opts.historyLimit ?? DEFAULT_HISTORY_LIMIT, { textOnly: true })
      ).map((m) => ({
        role: m.role,
        content: m.content,
      }));

    if (opts.lastUserNote) {
      const lastUser = messages.map((m) => m.role).lastIndexOf("user");
      if (lastUser >= 0) {
        messages[lastUser] = { ...messages[lastUser], content: `${messages[lastUser].content}\n\n${opts.lastUserNote}` };
      }
    }

    return {
      messages,
      characterId: chat.characterId,
      contentMode: opts.contentMode ?? ContextBuilder.resolveContentMode(actor),
      userProfile: opts.userProfile ?? ContextBuilder.resolveUserProfile(chat),
    };
  }
}
