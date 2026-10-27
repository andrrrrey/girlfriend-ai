/**
 * @file chat-events.service.ts
 * @description События чата в реальном времени: новое сообщение в диалоге
 * (из Telegram, готовое фото, ответ персонажа) сразу видно на открытой странице.
 *
 * outbox message.created → публикация в Redis (канал chat-events:<chatId>) →
 * подписчик каждого инстанса API раздаёт событие SSE-соединениям этого чата
 * (GET /chats/:id/events). Через Redis — чтобы событие дошло до клиента, даже
 * если outbox обработал его другой инстанс.
 */

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EventEmitter } from "events";
import type Redis from "ioredis";
import { REDIS } from "../common/redis.constants";
import { OUTBOX_EVENTS, OutboxService } from "../outbox/outbox.service";

const CHANNEL_PREFIX = "chat-events:";

/** Событие чата для клиента. */
export interface ChatEvent {
  type: "message";
  messageId: string;
  role: string;
  messageType: string;
  source: string;
}

@Injectable()
export class ChatEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatEventsService.name);
  private readonly local = new EventEmitter();
  private subscriber: Redis | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly outbox: OutboxService,
  ) {
    // Открытых вкладок может быть много — снимаем ограничение на число слушателей.
    this.local.setMaxListeners(0);
  }

  async onModuleInit(): Promise<void> {
    this.outbox.registerHandler(OUTBOX_EVENTS.MESSAGE_CREATED, async (event) => {
      const p = event.payload as { messageId: string; chatSessionId: string; role: string; type: string; source: string };
      const payload: ChatEvent = { type: "message", messageId: p.messageId, role: p.role, messageType: p.type, source: p.source };
      await this.redis.publish(CHANNEL_PREFIX + p.chatSessionId, JSON.stringify(payload));
    });

    // Отдельное соединение: в режиме подписки ioredis не выполняет обычные команды.
    this.subscriber = this.redis.duplicate();
    this.subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
      try {
        this.local.emit(channel.slice(CHANNEL_PREFIX.length), JSON.parse(message) as ChatEvent);
      } catch {
        // некорректное сообщение — пропускаем
      }
    });
    await this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`).catch((err) => {
      this.logger.error(`chat events subscribe failed: ${err?.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  /**
   * Подписка на события чата.
   * @returns функция отписки
   */
  subscribe(chatId: string, listener: (event: ChatEvent) => void): () => void {
    this.local.on(chatId, listener);
    return () => this.local.off(chatId, listener);
  }
}
