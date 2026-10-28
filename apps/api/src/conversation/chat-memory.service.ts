/**
 * @file chat-memory.service.ts
 * @description Долговременная память диалога: краткое содержание (summary).
 *
 * В запрос к модели идут последние DEFAULT_HISTORY_LIMIT сообщений; всё, что
 * старше, сворачивается в ChatSession.summary (до summaryUpToSeq). Обновление —
 * подписчик outbox на message.created: когда за окном истории накопилось
 * SUMMARY_BATCH несвёрнутых сообщений, они дописываются в summary через
 * /ai/text/completion. ContextBuilder передаёт summary в системный промпт.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { OUTBOX_EVENTS, OutboxService } from "../outbox/outbox.service";
import { RedisLockService } from "../common/redis-lock.service";
import { AI_BASE } from "./ai-client";
import { DEFAULT_HISTORY_LIMIT } from "./context-builder";

/** Сколько несвёрнутых сообщений за окном истории запускают обновление summary. */
export const SUMMARY_BATCH = 20;
const MAX_SUMMARY_CHARS = 3000;
const SUMMARY_LOCK_TTL_MS = 120_000;

const SUMMARY_SYSTEM = [
  "You maintain long-term memory for an AI companion chat.",
  "Update the summary with the new messages. Keep durable facts: the user's name, preferences, plans,",
  "important events, promises, the relationship's tone and running jokes. Drop small talk.",
  "Write in the language of the conversation, in short third-person notes, at most 15 lines.",
  "Answer with the updated summary only.",
].join(" ");

/** Сообщения, которые пора свернуть: всё, кроме последних historyLimit. */
export function messagesToSummarize<T>(pending: T[], historyLimit = DEFAULT_HISTORY_LIMIT, batch = SUMMARY_BATCH): T[] {
  return pending.length - historyLimit >= batch ? pending.slice(0, pending.length - historyLimit) : [];
}

@Injectable()
export class ChatMemoryService implements OnModuleInit {
  private readonly logger = new Logger(ChatMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly locks: RedisLockService,
  ) {}

  onModuleInit(): void {
    this.outbox.registerHandler(OUTBOX_EVENTS.MESSAGE_CREATED, async (event) => {
      const payload = event.payload as { chatSessionId?: string; role?: string };
      if (payload.role === "assistant" && payload.chatSessionId) await this.maybeSummarize(payload.chatSessionId);
    });
  }

  /** Дописывает в summary сообщения, вышедшие за окно истории (если их набралось достаточно). */
  async maybeSummarize(chatSessionId: string): Promise<boolean> {
    const res = await this.locks.withLock(`chat-summary:${chatSessionId}`, SUMMARY_LOCK_TTL_MS, () => this.summarize(chatSessionId));
    return res.acquired ? Boolean(res.result) : false;
  }

  private async summarize(chatSessionId: string): Promise<boolean> {
    const chat = await this.prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { summary: true, summaryUpToSeq: true, deletedAt: true },
    });
    if (!chat || chat.deletedAt) return false;

    const pending = await this.prisma.message.findMany({
      where: {
        chatSessionId,
        deletedAt: null,
        type: "text",
        role: { in: ["user", "assistant"] },
        ...(chat.summaryUpToSeq !== null ? { seq: { gt: chat.summaryUpToSeq } } : {}),
      },
      orderBy: { seq: "asc" },
      select: { role: true, content: true, seq: true },
    });
    const batch = messagesToSummarize(pending);
    if (batch.length === 0) return false;

    const transcript = batch.map((m) => `${m.role === "user" ? "User" : "Character"}: ${m.content}`).join("\n");
    const prompt = `Current summary:\n${chat.summary?.trim() || "(empty)"}\n\nNew messages:\n${transcript}`;
    const summary = (await this.complete(prompt)).slice(0, MAX_SUMMARY_CHARS);
    if (!summary) return false;

    // Сброс чата во время запроса: память не перезаписываем устаревшей.
    const updated = await this.prisma.chatSession.updateMany({
      where: { id: chatSessionId, summaryUpToSeq: chat.summaryUpToSeq },
      data: { summary, summaryUpToSeq: batch[batch.length - 1].seq },
    });
    return updated.count > 0;
  }

  private async complete(prompt: string): Promise<string> {
    const res = await fetch(`${AI_BASE}/ai/text/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: SUMMARY_SYSTEM, prompt: prompt.slice(0, 30_000), maxTokens: 800, temperature: 0.2 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`summary completion failed: HTTP ${res.status}`);
    const data = (await res.json()) as { content?: string };
    return (data.content ?? "").trim();
  }
}
