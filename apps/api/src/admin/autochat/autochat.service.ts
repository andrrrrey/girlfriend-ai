/**
 * @file autochat.service.ts
 * @description Оркестратор автопереписки робота с персонажами (QA-инструмент админки).
 *
 * Для каждой задачи (AutoChatTask) по каждому выбранному персонажу:
 *   1. создаёт (или переиспользует) реальный ChatSession в аккаунте админа;
 *   2. крутит цикл на turnsPerChar реплик персонажа:
 *        - робот (LLM в роли живого пользователя) генерирует user-сообщение
 *          через /ai/text/completion — БЕЗ учёта расходов (симуляция человека);
 *        - персонаж отвечает через /ai/chat/completion (SSE аккумулируется на
 *          сервере) — как обычный чат, С учётом расходов (AiJob type=chat).
 *
 * Управление: пауза/возобновление/отмена через поле status (перечитывается между
 * ходами). Прогресс — счётчик succeeded (сделанных реплик персонажа). Устойчивость
 * к рестарту: onModuleInit возобновляет задачи со статусом running, а прогресс по
 * каждому персонажу выводится из числа assistant-сообщений в его сессии.
 *
 * Анализ: analyzeCharacter / analyzeSummary читают расшифровку диалогов и через
 * /ai/text/completion (QA-аналитик) находят дефекты промптов персонажей. Анализ
 * расходы НЕ учитывает (внутренний QA).
 */

import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../../prisma.service";
import { ChatsService } from "../../chats/chats.service";
import { pickRandomPersona, type Persona } from "./personas";
import { pickRandomTopic } from "./topic-pools";
import {
  buildSimulatedUserSystem,
  buildSimulatedUserTurnPrompt,
  type TranscriptTurn,
} from "./simulated-user-prompt";
import {
  buildAnalysisSystem,
  buildAnalysisUserPrompt,
  buildSummarySystem,
  parseAnalysisJson,
  type AnalysisResult,
} from "./analysis-prompt";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/** Максимум сообщений истории, передаваемых в контекст (как в обычном чате). */
const HISTORY_LIMIT = 20;
/** Небольшая пауза между ходами — не долбим провайдер вплотную. */
const TURN_DELAY_MS = 400;

/** Ошибка «нет баланса» — останавливает всю задачу. */
class BalanceError extends Error {}

/** Классифицирует сообщение ошибки провайдера как нехватку баланса/кредитов. */
function isBalanceError(message: string): boolean {
  return /INSUFFICIENT_BALANCE|insufficient|balance|not enough|no credit|out of credit|credits?\b|payment required|\b402\b/i.test(
    message,
  );
}

@Injectable()
export class AutochatService implements OnModuleInit {
  private readonly logger = new Logger(AutochatService.name);
  /** id задач, для которых уже крутится цикл (защита от двойного запуска). */
  private readonly active = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
  ) {}

  /** При старте API — возобновить задачи, оставшиеся в статусе running (после рестарта). */
  async onModuleInit(): Promise<void> {
    const running = await this.prisma.autoChatTask.findMany({
      where: { status: "running" },
      select: { id: true },
    });
    for (const { id } of running) {
      this.logger.log(`resuming autochat task ${id} after restart`);
      void this.runTask(id);
    }
  }

  // ─── Публичный API (используется контроллером) ──────────────────────────────

  async createTask(
    adminId: string,
    characterIds: string[],
    turnsPerChar: number,
    contentMode?: "nsfw" | "sfw",
  ) {
    const mode: "nsfw" | "sfw" = contentMode === "sfw" ? "sfw" : "nsfw";
    const task = await this.prisma.autoChatTask.create({
      data: {
        status: "running",
        characterIds,
        turnsPerChar,
        total: characterIds.length * turnsPerChar,
        createdBy: adminId,
        params: { contentMode: mode },
      },
    });
    void this.runTask(task.id);
    return task;
  }

  async list() {
    const tasks = await this.prisma.autoChatTask.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return this.attach(tasks);
  }

  async get(id: string) {
    const task = await this.prisma.autoChatTask.findUnique({ where: { id } });
    if (!task) return task;
    const [enriched] = await this.attach([task]);
    return enriched;
  }

  /**
   * Дополняет задачи данными персонажей (id/name/avatarUrl) и созданных сессий
   * (id/characterId) — для показа целей и ссылок на чаты в админке.
   */
  private async attach<T extends { characterIds: string[]; sessionIds: string[] }>(tasks: T[]) {
    const charIds = Array.from(new Set(tasks.flatMap((t) => t.characterIds)));
    const sessionIds = Array.from(new Set(tasks.flatMap((t) => t.sessionIds)));
    const [chars, sessions] = await Promise.all([
      charIds.length
        ? this.prisma.character.findMany({
            where: { id: { in: charIds } },
            select: { id: true, name: true, avatarUrl: true },
          })
        : Promise.resolve([]),
      sessionIds.length
        ? this.prisma.chatSession.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, characterId: true },
          })
        : Promise.resolve([]),
    ]);
    const charById = new Map(chars.map((c) => [c.id, c]));
    const sessionByChar = new Map(sessions.map((s) => [s.characterId, s.id]));
    return tasks.map((t) => ({
      ...t,
      characters: t.characterIds
        .map((cid) => {
          const c = charById.get(cid);
          if (!c) return null;
          return { ...c, sessionId: sessionByChar.get(cid) ?? null };
        })
        .filter((c): c is NonNullable<typeof c> => c != null),
    }));
  }

  /** Пауза: задача останавливается после текущего хода, остаётся возобновляемой. */
  async pause(id: string) {
    const task = await this.prisma.autoChatTask.findUnique({ where: { id } });
    if (task && task.status === "running") {
      return this.prisma.autoChatTask.update({ where: { id }, data: { status: "paused" } });
    }
    return task;
  }

  /** Возобновление приостановленной задачи. */
  async resume(id: string) {
    const task = await this.prisma.autoChatTask.findUnique({ where: { id } });
    if (task && (task.status === "paused" || task.status === "stopped_no_balance")) {
      const updated = await this.prisma.autoChatTask.update({
        where: { id },
        data: { status: "running", lastError: null },
      });
      void this.runTask(id);
      return updated;
    }
    return task;
  }

  /** Отмена: задача останавливается окончательно. */
  async cancel(id: string) {
    const task = await this.prisma.autoChatTask.findUnique({ where: { id } });
    if (task && (task.status === "running" || task.status === "paused")) {
      return this.prisma.autoChatTask.update({
        where: { id },
        data: { status: "cancelled", finishedAt: new Date() },
      });
    }
    return task;
  }

  // ─── Цикл автопереписки ─────────────────────────────────────────────────────

  private async runTask(taskId: string): Promise<void> {
    if (this.active.has(taskId)) return;
    this.active.add(taskId);
    try {
      const task = await this.prisma.autoChatTask.findUnique({ where: { id: taskId } });
      if (!task) return;

      const contentMode: "nsfw" | "sfw" =
        (task.params as { contentMode?: string } | null)?.contentMode === "sfw" ? "sfw" : "nsfw";

      for (const characterId of task.characterIds) {
        // Проверяем статус перед каждым персонажем.
        if (!(await this.isRunning(taskId))) return;

        const character = await this.prisma.character.findFirst({
          where: { id: characterId, deletedAt: null },
          select: { id: true, name: true },
        });
        if (!character) {
          this.logger.warn(`autochat ${taskId}: character ${characterId} not found, skipping`);
          continue;
        }

        // Каждому персонажу — своя персона и тема на весь диалог.
        const persona = pickRandomPersona();
        const topic = pickRandomTopic(contentMode);

        try {
          const sessionId = await this.ensureSession(task.id, task.createdBy, characterId, character.name);
          // Сколько реплик персонажа уже сделано в этой сессии (для возобновления).
          let repliesDone = await this.prisma.message.count({
            where: { chatSessionId: sessionId, role: "assistant", deletedAt: null },
          });

          while (repliesDone < task.turnsPerChar) {
            if (!(await this.isRunning(taskId))) return;

            await this.runOneTurn(task.id, task.createdBy, sessionId, characterId, persona, topic, contentMode);
            repliesDone++;

            await this.prisma.autoChatTask.update({
              where: { id: taskId },
              data: { succeeded: { increment: 1 } },
            });
            if (TURN_DELAY_MS) await new Promise((r) => setTimeout(r, TURN_DELAY_MS));
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (err instanceof BalanceError) {
            this.logger.warn(`autochat ${taskId} stopped: no balance — ${message}`);
            await this.prisma.autoChatTask.update({
              where: { id: taskId },
              data: { status: "stopped_no_balance", lastError: message, finishedAt: new Date() },
            });
            return;
          }
          // Прочая ошибка на персонаже — засчитываем оставшиеся ходы как failed и идём дальше.
          this.logger.error(`autochat ${taskId}: character ${characterId} failed — ${message}`);
          await this.prisma.autoChatTask.update({
            where: { id: taskId },
            data: { failed: { increment: 1 }, lastError: message },
          });
        }
      }

      // Все персонажи обработаны.
      if (await this.isRunning(taskId)) {
        await this.prisma.autoChatTask.update({
          where: { id: taskId },
          data: { status: "completed", finishedAt: new Date() },
        });
      }
    } finally {
      this.active.delete(taskId);
    }
  }

  /** true, если задача всё ещё в статусе running (иначе цикл должен остановиться). */
  private async isRunning(taskId: string): Promise<boolean> {
    const t = await this.prisma.autoChatTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    return t?.status === "running";
  }

  /**
   * Возвращает id сессии для (задача, персонаж). Переиспользует уже созданную
   * (по task.sessionIds), иначе создаёт новую в аккаунте админа и добавляет её id
   * в task.sessionIds.
   */
  private async ensureSession(
    taskId: string,
    adminId: string,
    characterId: string,
    characterName: string,
  ): Promise<string> {
    const task = await this.prisma.autoChatTask.findUnique({
      where: { id: taskId },
      select: { sessionIds: true },
    });
    if (task?.sessionIds.length) {
      const existing = await this.prisma.chatSession.findFirst({
        where: { id: { in: task.sessionIds }, characterId, deletedAt: null },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    const session = await this.chats.createChat(adminId, characterId, `[AUTO] ${characterName}`);
    await this.prisma.autoChatTask.update({
      where: { id: taskId },
      data: { sessionIds: { push: session.id } },
    });
    return session.id;
  }

  /**
   * Один ход: робот пишет user-сообщение (без расходов), персонаж отвечает
   * (с учётом расходов как обычный чат).
   */
  private async runOneTurn(
    taskId: string,
    adminId: string,
    sessionId: string,
    characterId: string,
    persona: Persona,
    topic: ReturnType<typeof pickRandomTopic>,
    contentMode: "nsfw" | "sfw",
  ): Promise<void> {
    // 1. Робот генерирует человеческое user-сообщение.
    const history = await this.chats.getMessageHistory(sessionId, HISTORY_LIMIT);
    const userText = await this.callText(
      buildSimulatedUserSystem(persona, topic, contentMode),
      buildSimulatedUserTurnPrompt(history as TranscriptTurn[]),
      512,
    );
    if (!userText) throw new Error("simulated user produced empty message");
    // Сообщение робота НЕ создаёт AiJob — по решению расходы на него не считаем.
    await this.chats.saveMessage(sessionId, "user", userText, {
      metadata: { autochat: true, robot: true },
    });

    // 2. Персонаж отвечает — обычный чат-пайплайн с учётом расходов.
    const aiJob = await this.chats.createAiJob(adminId, "chat", {
      chatSessionId: sessionId,
      characterId,
      autochat: true,
      taskId,
    });

    const fullHistory = await this.chats.getMessageHistory(sessionId, HISTORY_LIMIT);
    const userProfile = `${persona.name} (${persona.gender}, age ${persona.age}): ${persona.statedFacts}`;

    let reply: { content: string; tokens: number };
    try {
      reply = await this.callChat(fullHistory, characterId, contentMode, userProfile);
    } catch (err) {
      // Помечаем джобу как проваленную, чтобы не висела в pending, и пробрасываем.
      await this.prisma.aiJob
        .update({ where: { id: aiJob.id }, data: { status: "failed", error: err instanceof Error ? err.message : String(err) } })
        .catch(() => undefined);
      throw err;
    }

    if (reply.content) {
      await this.chats.saveMessage(sessionId, "assistant", reply.content, {
        metadata: { autochat: true },
      });
    }
    await this.chats.completeAiJob(aiJob.id, reply.tokens || undefined);
    await this.chats.logUsage(adminId, "chat_message", reply.tokens || undefined);
  }

  // ─── Вызовы AI-сервиса ──────────────────────────────────────────────────────

  /** Не-стрим текстовая генерация (робот/аналитик). Бросает BalanceError при 402. */
  private async callText(system: string, prompt: string, maxTokens: number): Promise<string> {
    const res = await fetch(`${AI_BASE}/ai/text/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, prompt, maxTokens }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = err.error || `AI text completion error ${res.status}`;
      if (res.status === 402 || isBalanceError(msg)) throw new BalanceError(msg);
      throw new Error(msg);
    }
    const data = (await res.json()) as { content?: string };
    return (data.content || "").trim();
  }

  /**
   * Реплика персонажа через SSE-эндпоинт /ai/chat/completion, аккумулированная на
   * сервере (тот же формат разбора, что в chats.controller). Возвращает полный
   * текст и число токенов.
   */
  private async callChat(
    history: { role: string; content: string }[],
    characterId: string,
    contentMode: "nsfw" | "sfw",
    userProfile: string,
  ): Promise<{ content: string; tokens: number }> {
    const res = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId,
        contentMode,
        userProfile,
      }),
    });
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = err.error || `AI chat completion error ${res.status}`;
      if (res.status === 402 || isBalanceError(msg)) throw new BalanceError(msg);
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokens = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokens = parsed.usage.totalTokens;
              if (parsed.error) throw new Error(String(parsed.error));
            } catch (e) {
              // Строки без валидного JSON игнорируем; настоящую ошибку пробрасываем.
              if (e instanceof Error && /INSUFFICIENT|balance|error/i.test(e.message)) {
                if (isBalanceError(e.message)) throw new BalanceError(e.message);
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return { content: fullContent.trim(), tokens };
  }

  // ─── Анализ ─────────────────────────────────────────────────────────────────

  /** Собирает расшифровку диалога персонажа в рамках задачи. */
  private async buildTranscript(taskId: string, characterId: string): Promise<TranscriptTurn[]> {
    const task = await this.prisma.autoChatTask.findUnique({
      where: { id: taskId },
      select: { sessionIds: true },
    });
    if (!task?.sessionIds.length) return [];
    const session = await this.prisma.chatSession.findFirst({
      where: { id: { in: task.sessionIds }, characterId, deletedAt: null },
      select: { id: true },
    });
    if (!session) return [];
    const messages = await this.prisma.message.findMany({
      where: { chatSessionId: session.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    return messages;
  }

  /** Анализирует поведение одного персонажа в рамках задачи. */
  async analyzeCharacter(taskId: string, characterId: string, adminId: string): Promise<AnalysisResult & { messagesAnalyzed: number }> {
    const character = await this.prisma.character.findFirst({
      where: { id: characterId },
      select: { id: true, name: true, systemPrompt: true },
    });
    if (!character) throw new NotFoundException("Character not found");

    const transcript = await this.buildTranscript(taskId, characterId);
    if (transcript.length === 0) {
      const empty: AnalysisResult = { summary: "Нет сообщений для анализа по этому персонажу.", findings: [] };
      await this.saveAnalysis(taskId, characterId, "character", empty, 0, adminId);
      return { ...empty, messagesAnalyzed: 0 };
    }

    const raw = await this.callText(
      buildAnalysisSystem(character.name, character.systemPrompt),
      buildAnalysisUserPrompt(transcript),
      3072,
    );
    const result = parseAnalysisJson(raw);
    await this.saveAnalysis(taskId, characterId, "character", result, transcript.length, adminId);
    return { ...result, messagesAnalyzed: transcript.length };
  }

  /** Строит сводный вывод по всем per-character анализам задачи. */
  async analyzeSummary(taskId: string, adminId: string): Promise<AnalysisResult> {
    const perChar = await this.prisma.autoChatAnalysis.findMany({
      where: { taskId, scope: "character" },
      orderBy: { createdAt: "desc" },
    });
    if (perChar.length === 0) {
      throw new NotFoundException("Сначала выполните анализ хотя бы одного персонажа.");
    }
    // Берём самый свежий анализ на каждого персонажа.
    const latestByChar = new Map<string, (typeof perChar)[number]>();
    for (const a of perChar) {
      if (a.characterId && !latestByChar.has(a.characterId)) latestByChar.set(a.characterId, a);
    }
    const charNames = await this.prisma.character.findMany({
      where: { id: { in: Array.from(latestByChar.keys()) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(charNames.map((c) => [c.id, c.name]));

    const reports = Array.from(latestByChar.entries()).map(([cid, a]) => {
      const name = nameById.get(cid) || cid;
      return `### ${name}\nSummary: ${a.summary}\nFindings: ${JSON.stringify(a.findings)}`;
    });
    const prompt = "Here are the per-character QA reports:\n\n" + reports.join("\n\n");

    const raw = await this.callText(buildSummarySystem(), prompt, 3072);
    const result = parseAnalysisJson(raw);
    await this.saveAnalysis(taskId, null, "summary", result, reports.length, adminId);
    return result;
  }

  /** Возвращает сохранённые анализы задачи (для отрисовки в UI). */
  async getAnalyses(taskId: string) {
    return this.prisma.autoChatAnalysis.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
  }

  private async saveAnalysis(
    taskId: string,
    characterId: string | null,
    scope: "character" | "summary",
    result: AnalysisResult,
    messagesAnalyzed: number,
    adminId: string,
  ) {
    await this.prisma.autoChatAnalysis.create({
      data: {
        taskId,
        characterId,
        scope,
        summary: result.summary,
        findings: result.findings as unknown as Prisma.InputJsonValue,
        messagesAnalyzed,
        createdBy: adminId,
      },
    });
  }
}
