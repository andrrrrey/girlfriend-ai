import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Chat Sessions ─────────────────────────────────────────

  async createChat(userId: string, characterId: string, title?: string) {
    // Verify character exists
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, deletedAt: null },
    });
    if (!character) throw new NotFoundException("Character not found");

    return this.prisma.chatSession.create({
      data: {
        userId,
        characterId,
        title: title || `Chat with ${character.name}`,
      },
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true },
        },
      },
    });
  }

  async getUserChats(userId: string, cursor?: string, limit = 20) {
    const chats = await this.prisma.chatSession.findMany({
      where: { userId, deletedAt: null },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
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
        lastMessage: c.messages[0] || null,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  }

  async getChat(chatId: string, userId: string) {
    const chat = await this.prisma.chatSession.findFirst({
      where: { id: chatId, deletedAt: null },
      include: {
        character: {
          select: { id: true, name: true, avatarUrl: true, systemPrompt: true, voiceId: true },
        },
      },
    });
    if (!chat) throw new NotFoundException("Chat not found");
    if (chat.userId !== userId) throw new ForbiddenException();
    return chat;
  }

  async updateChat(chatId: string, userId: string, title: string) {
    const chat = await this.getChat(chatId, userId);
    return this.prisma.chatSession.update({
      where: { id: chat.id },
      data: { title },
    });
  }

  async deleteChat(chatId: string, userId: string) {
    const chat = await this.getChat(chatId, userId);
    return this.prisma.chatSession.update({
      where: { id: chat.id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Messages ──────────────────────────────────────────────

  async getMessages(chatId: string, userId: string, cursor?: string, limit = 50) {
    await this.getChat(chatId, userId); // verify access

    const messages = await this.prisma.message.findMany({
      where: { chatSessionId: chatId, deletedAt: null },
      orderBy: { createdAt: "desc" },
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
      items: items.reverse(), // chronological order
      nextCursor: hasMore ? items[0]?.id : null,
    };
  }

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
        type: opts?.type || "text",
        mediaUrl: opts?.mediaUrl,
        metadata: opts?.metadata as Prisma.InputJsonValue,
      },
    });

    await this.prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { lastMessageAt: new Date() },
    });

    return message;
  }

  async getMessage(messageId: string, chatId: string, userId: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");
    return message;
  }

  async getMessageHistory(chatSessionId: string, limit = 20) {
    const messages = await this.prisma.message.findMany({
      where: { chatSessionId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { role: true, content: true },
    });
    return messages.reverse();
  }

  async deleteMessage(messageId: string, chatId: string, userId: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");

    return this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async getMessagesAfter(chatSessionId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) return [];

    return this.prisma.message.findMany({
      where: {
        chatSessionId,
        createdAt: { gt: msg.createdAt },
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async softDeleteMessages(ids: string[]) {
    if (ids.length === 0) return;
    await this.prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
  }

  async updateMessageContent(messageId: string, chatId: string, userId: string, content: string) {
    await this.getChat(chatId, userId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, chatSessionId: chatId, deletedAt: null },
    });
    if (!message) throw new NotFoundException("Message not found");

    await this.prisma.message.update({
      where: { id: messageId },
      data: { content },
    });

    // Soft-delete all assistant messages after the edited one so AI can regenerate from new content
    const after = await this.getMessagesAfter(chatId, messageId);
    if (after.length > 0) {
      await this.softDeleteMessages(after.map((m) => m.id));
    }
  }

  // ─── AiJob tracking ────────────────────────────────────────

  async createAiJob(userId: string, type: string, input?: Record<string, unknown>) {
    return this.prisma.aiJob.create({
      data: {
        userId,
        type,
        status: "pending",
        input: input as any,
      },
    });
  }

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

  async logUsage(userId: string, action: string, tokensUsed?: number) {
    await this.prisma.usageLog.create({
      data: { userId, action, tokensUsed },
    });
  }

  // ─── Message Copy Audit ─────────────────────────────────────

  async recordCopy(messageId: string, userId: string) {
    return this.prisma.messageCopyAudit.create({
      data: { messageId, userId },
    });
  }
}
