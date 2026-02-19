/**
 * @file chats.service.ts
 * @description Сервис управления чатами, сообщениями и AI-заданиями.
 *
 * Функциональность:
 * 1. ChatSession CRUD — создание, получение, обновление, мягкое удаление чатов
 * 2. Message CRUD — пагинация курсором, сохранение, мягкое удаление
 * 3. История для AI — getMessageHistory (последние N сообщений для контекста LLM)
 * 4. Редактирование сообщений — updateMessageContent с cascade soft-delete последующих
 * 5. AiJob трекинг — создание и завершение записей об AI-операциях
 * 6. UsageLog — аудит использования AI (токены, действия)
 * 7. MessageCopyAudit — запись событий копирования сообщений
 *
 * Паттерны безопасности:
 * - Все операции проверяют владельца через getChat() (ForbiddenException если != userId)
 * - Мягкое удаление: deletedAt = new Date() вместо физического DELETE
 * - Пагинация курсором (не offset) — стабильна при добавлении новых записей
 */

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Сервис для всех операций с чатами и сообщениями.
 */
@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Chat Sessions ──────────────────────────────────────────────────────────

  /**
   * Создаёт новую сессию чата.
   *
   * @param userId — ID владельца чата
   * @param characterId — ID персонажа (должен существовать и не быть удалён)
   * @param title — опциональный заголовок (по умолчанию "Chat with {name}")
   * @returns ChatSession с включённым character { id, name, avatarUrl }
   * @throws NotFoundException — если персонаж не найден или удалён
   */
  async createChat(userId: string, characterId: string, title?: string) {
    // Проверяем что персонаж существует и не удалён (deletedAt: null)
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, deletedAt: null },
    });
    if (!character) throw new NotFoundException("Character not found");

    return this.prisma.chatSession.create({
      data: {
        userId,
        characterId,
        title: title || `Chat with ${character.name}`, // Дефолтный заголовок
      },
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });
  }

  /**
   * Возвращает список чатов пользователя с пагинацией курсором.
   *
   * Сортировка: по lastMessageAt DESC (активные чаты наверху), NULL — последними.
   * Для каждого чата включается последнее сообщение (для preview в списке).
   *
   * @param userId — фильтр по владельцу
   * @param cursor — ID последнего чата из предыдущей страницы (для пагинации)
   * @param limit — размер страницы (по умолчанию 20)
   * @returns { items: ChatSession[], nextCursor: string | null }
   */
  async getUserChats(userId: string, cursor?: string, limit = 20) {
    // Запрашиваем limit+1 чтобы определить есть ли следующая страница
    const chats = await this.prisma.chatSession.findMany({
      where: { userId, deletedAt: null }, // Только активные (не мягко удалённые)
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // Cursor-based pagination
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1, // Только последнее сообщение для preview
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    const hasMore = chats.length > limit;
    const items = hasMore ? chats.slice(0, limit) : chats;

    return {
      items: items.map((c) => ({
        id: c.id,
        title: c.title,
        character: c.character,
        lastMessage: c.messages[0] || null, // null если сообщений нет
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id : null, // null = последняя страница
    };
  }

  /**
   * Возвращает полную информацию о чате.
   * Проверяет что чат принадлежит userId.
   *
   * @param chatId — ID чата
   * @param userId — ID текущего пользователя (для проверки доступа)
   * @returns ChatSession с включённым character (включая systemPrompt и voiceId)
   * @throws NotFoundException — чат не найден или удалён
   * @throws ForbiddenException — чат принадлежит другому пользователю
   */
  async getChat(chatId: string, userId: string) {
    const chat = await this.prisma.chatSession.findFirst({
      where: { id: chatId, deletedAt: null },
      include: {
        character: {
          // systemPrompt нужен для AI-запросов; voiceId — для TTS
          select: { id: true, name: true, avatarUrl: true, systemPrompt: true, voiceId: true },
        },
      },
    });
    if (!chat) throw new NotFoundException("Chat not found");
    // Защита от IDOR — проверяем что запрашивает именно владелец
    if (chat.userId !== userId) throw new ForbiddenException();
    return chat;
  }

  /**
   * Обновляет заголовок чата.
   *
   * @param chatId — ID чата
   * @param userId — ID владельца (проверка через getChat)
   * @param title — новый заголовок
   */
  async updateChat(chatId: string, userId: string, title: string) {
    const chat = await this.getChat(chatId, userId);
    return this.prisma.chatSession.update({
      where: { id: chat.id },
      data: { title },
    });
  }

  /**
   * Мягко удаляет чат (устанавливает deletedAt и isActive=false).
   * Сообщения чата остаются в БД, но не возвращаются через API.
   *
   * @param chatId — ID чата
   * @param userId — ID владельца (проверка через getChat)
   */
  async deleteChat(chatId: string, userId: string) {
    const chat = await this.getChat(chatId, userId);
    return this.prisma.chatSession.update({
      where: { id: chat.id },
      data: {
        deletedAt: new Date(), // Мягкое удаление — не физический DELETE
        isActive: false,
      },
    });
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  /**
   * Возвращает сообщения чата с пагинацией курсором.
   *
   * Особенности:
   * - Запрашивает в порядке DESC (новые первые), возвращает в хронологическом порядке (reverse)
   * - nextCursor — ID самого старого сообщения на странице (для загрузки предыдущих)
   * - Исключает мягко удалённые (deletedAt: null)
   *
   * @param chatId — ID чата
   * @param userId — ID владельца (проверка через getChat)
   * @param cursor — ID сообщения для продолжения пагинации (загрузка истории вверх)
   * @param limit — размер страницы (по умолчанию 50)
   * @returns { items: Message[], nextCursor: string | null }
   */
  async getMessages(chatId: string, userId: string, cursor?: string, limit = 50) {
    await this.getChat(chatId, userId); // Проверяем доступ к чату

    const messages = await this.prisma.message.findMany({
      where: { chatSessionId: chatId, deletedAt: null },
      orderBy: { createdAt: "desc" }, // DESC для cursor-пагинации
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        role: true,
        content: true,
        type: true,
        mediaUrl: true,
        metadata: true,
        createdAt: true,
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items: items.reverse(), // Возвращаем в хронологическом порядке (старые → новые)
      nextCursor: hasMore ? items[0]?.id : null, // ID самого старого на странице
    };
  }

  /**
   * Сохраняет сообщение и обновляет lastMessageAt чата.
   *
   * @param chatSessionId — ID чата
   * @param role — "user" | "assistant" | "system"
   * @param content — текст сообщения
   * @param opts — опциональные поля: type, mediaUrl, metadata
   *   - type: "text" | "voice" | "image" (по умолчанию "text")
   *   - mediaUrl: ссылка на S3-файл (аудио, изображение)
   *   - metadata: JSON с дополнительными данными (например tokenUsage)
   * @returns созданное Message
   */
  async saveMessage(
    chatSessionId: string,
    role: string,
    content: string,
    opts?: { type?: string; mediaUrl?: string; metadata?: Record<string, unknown> },
  ) {
    const message = await this.prisma.message.create({
      data: {
        chatSessionId,
        role,
        content,
        type: opts?.type || "text", // По умолчанию текстовое сообщение
        mediaUrl: opts?.mediaUrl,
        metadata: opts?.metadata as Prisma.InputJsonValue, // Приводим к типу Prisma JSON
      },
    });

    // Обновляем дату последнего сообщения для сортировки списка чатов
    await this.prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  /**
   * Получает конкретное сообщение с проверкой доступа.
   *
   * @param messageId — ID сообщения
   * @param chatId — ID чата (для верификации принадлежности)
   * @param userId — ID пользователя (проверка через getChat)
   * @throws NotFoundException — сообщение не найдено или удалено
   */
  async getMessage(messageId: string, chatId: string, userId: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");
    return message;
  }

  /**
   * Возвращает последние N сообщений для передачи в контекст LLM.
   *
   * Используется при формировании запроса к OpenAI Chat Completions.
   * Выбирает только role и content — минимум данных для AI.
   * Возвращает в хронологическом порядке (старые → новые).
   *
   * @param chatSessionId — ID чата
   * @param limit — количество последних сообщений (по умолчанию 20)
   * @returns массив { role, content }[]
   */
  async getMessageHistory(chatSessionId: string, limit = 20) {
    const messages = await this.prisma.message.findMany({
      where: { chatSessionId, deletedAt: null },
      orderBy: { createdAt: "desc" }, // Берём последние N
      take: limit,
      select: { role: true, content: true }, // Только данные для LLM
    });
    return messages.reverse(); // Хронологический порядок для OpenAI messages array
  }

  /**
   * Мягко удаляет конкретное сообщение.
   *
   * @param messageId — ID сообщения
   * @param chatId — ID чата
   * @param userId — ID пользователя (проверка доступа)
   * @throws NotFoundException — сообщение не найдено
   */
  async deleteMessage(messageId: string, chatId: string, userId: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");

    return this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() }, // Мягкое удаление
    });
  }

  /**
   * Возвращает все сообщения чата после указанного (по дате createdAt).
   * Используется при редактировании сообщения для cascade-удаления последующих.
   *
   * @param chatSessionId — ID чата
   * @param messageId — ID базового сообщения
   * @returns Message[] после указанного, в хронологическом порядке
   */
  async getMessagesAfter(chatSessionId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return [];

    return this.prisma.message.findMany({
      where: {
        chatSessionId,
        createdAt: { gt: msg.createdAt }, // После редактируемого сообщения
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Мягко удаляет массив сообщений по ID.
   * Используется для cascade-удаления при редактировании.
   *
   * @param ids — массив ID сообщений для удаления
   */
  async softDeleteMessages(ids: string[]) {
    if (ids.length === 0) return; // Оптимизация — не делаем запрос если нечего удалять
    await this.prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Обновляет содержимое пользовательского сообщения.
   *
   * Логика редактирования (cascade delete):
   * 1. Обновляем текст выбранного сообщения
   * 2. Все сообщения ПОСЛЕ него мягко удаляются
   * 3. Фронтенд затем запрашивает новый AI-ответ (regenerate)
   *
   * Это позволяет "переписать историю" — изменить вопрос и получить новый ответ.
   *
   * @param messageId — ID сообщения для редактирования
   * @param chatId — ID чата
   * @param userId — ID пользователя (проверка доступа)
   * @param content — новый текст сообщения
   */
  async updateMessageContent(messageId: string, chatId: string, userId: string, content: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");

    // Обновляем текст сообщения
    await this.prisma.message.update({
      where: { id: messageId },
      data: { content },
    });

    // Cascade soft-delete всех сообщений после редактируемого
    // (assistant ответы устарели — AI должен сгенерировать новые)
    const after = await this.getMessagesAfter(chatId, messageId);
    if (after.length > 0) {
      await this.softDeleteMessages(after.map((m) => m.id));
    }
  }

  // ─── AiJob tracking ─────────────────────────────────────────────────────────

  /**
   * Создаёт запись AiJob для отслеживания AI-операции.
   *
   * AiJob позволяет отслеживать статус, стоимость и результат AI-запросов.
   * Обновляется worker-ом через internal API.
   *
   * @param userId — кто инициировал запрос
   * @param type — тип операции: "chat" | "stt" | "tts"
   * @param input — входные данные (опционально, для аудита)
   * @returns созданный AiJob с полем id для последующего обновления
   */
  async createAiJob(userId: string, type: string, input?: Record<string, unknown>) {
    return this.prisma.aiJob.create({
      data: {
        userId,
        type,
        status: "pending", // Начальный статус — ожидание обработки
        input: input as any,
      },
    });
  }

  /**
   * Помечает AiJob как завершённый и записывает использование токенов.
   *
   * @param jobId — ID задания
   * @param tokensUsed — количество токенов (опционально, только для chat)
   */
  async completeAiJob(jobId: string, tokensUsed?: number) {
    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        tokensUsed,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Записывает событие использования AI в UsageLog.
   *
   * Используется для аудита и аналитики потребления ресурсов.
   *
   * @param userId — кто использовал
   * @param action — тип действия: "chat_message" | "stt" | "tts" | "generation"
   * @param tokensUsed — токены (только для chat)
   */
  async logUsage(userId: string, action: string, tokensUsed?: number) {
    await this.prisma.usageLog.create({
      data: { userId, action, tokensUsed },
    });
  }

  // ─── Message Copy Audit ──────────────────────────────────────────────────────

  /**
   * Записывает событие копирования сообщения в аудит-лог.
   *
   * Используется для отслеживания распространения контента.
   * Вызывается из chats.controller при POST /messages/:id/copy.
   *
   * @param messageId — ID скопированного сообщения
   * @param userId — кто скопировал
   */
  async recordCopy(messageId: string, userId: string) {
    return this.prisma.messageCopyAudit.create({
      data: { messageId, userId },
    });
  }
}
