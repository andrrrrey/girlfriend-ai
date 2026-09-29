/**
 * @file comment-gen.service.ts
 * @description Фоновая автогенерация комментариев (админка → «Вовлечённость»).
 *
 * Механика:
 *   1. пул бот-пользователей (почта @bots.local) с правдоподобными никами;
 *      старые ники вида bot_xxxx переименовываются автоматически;
 *   2. на каждую цель — ОДИН вызов LLM, который возвращает JSON-массив из N
 *      комментариев; каждому слоту заранее назначен автор (со своим «голосом»)
 *      и тип комментария, а в промпт передаются витринные поля персонажа и
 *      уже существующие комментарии (чтобы не повторяться);
 *   3. ответ фильтруется (ремарки, метаданные, упоминания AI, пошлость, дубли),
 *      недостающие слоты догенерируются одной повторной попыткой;
 *   4. даты комментариев раскидываются по последним 30 дням.
 *
 * Модель — отдельная настройка COMMENTS_MODEL (OpenRouter): ролевая чат-модель
 * компаньона для этой задачи не годится (пишет ремарки и мусор).
 *
 * Задача выполняется в фоне (HTTP-запрос сразу возвращает jobId), прогресс
 * хранится в памяти процесса — при рестарте API незавершённая задача теряется,
 * уже созданные комментарии остаются.
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../../prisma.service";
import {
  BOT_EMAIL_DOMAIN,
  COMMENT_SYSTEM_PROMPT,
  buildCommentPrompt,
  cleanComment,
  dedupeKey,
  describeCharacter,
  parseCommentArray,
  pickAngles,
  randomNickname,
  randomPastDate,
  voiceFor,
} from "./comment-gen.util";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/** Модель OpenRouter по умолчанию, если COMMENTS_MODEL не задан. */
export const DEFAULT_COMMENTS_MODEL = "mistralai/mistral-small-3.2-24b-instruct";
/** Размер пула бот-авторов. */
const BOT_POOL_SIZE = 50;
/** Максимум комментариев на цель за один запуск. */
const MAX_PER_TARGET = 50;
/** Сколько комментариев просим у модели за один вызов. */
const CHUNK = 10;
/** Параллельно обрабатываемых целей. */
const CONCURRENCY = 3;
/** Таймаут одного вызова AI-сервиса. */
const AI_TIMEOUT_MS = 90_000;
/** Сколько держим завершённые задачи в памяти. */
const JOB_TTL_MS = 60 * 60_000;

type TargetKind = "character" | "short";

export interface CommentJob {
  id: string;
  status: "running" | "done" | "failed";
  targets: number;
  targetsDone: number;
  requested: number;
  created: number;
  /** Последние ошибки (для показа в админке). */
  errors: string[];
  startedAt: string;
  finishedAt?: string;
}

/** Ошибка, после которой продолжать бессмысленно (нет баланса/ключа). */
class FatalAiError extends Error {}

interface Bot {
  id: string;
}

interface TargetInfo {
  kind: TargetKind;
  id: string;
  context: string;
  notBefore: Date;
}

@Injectable()
export class CommentGenService {
  private readonly logger = new Logger(CommentGenService.name);
  private readonly jobs = new Map<string, CommentJob>();

  constructor(private readonly prisma: PrismaService) {}

  // ─── Публичный API ─────────────────────────────────────────────────────────

  /** Запускает фоновую генерацию и сразу возвращает задачу. */
  async start(targetType: string, targetIds: string[], count: number): Promise<CommentJob> {
    const kind = this.normalizeKind(targetType);
    const ids = Array.from(new Set((targetIds || []).filter(Boolean)));
    if (ids.length === 0) throw new BadRequestException("No targets selected");
    const n = Math.min(Math.max(1, Math.floor(count || 0)), MAX_PER_TARGET);

    this.gcJobs();
    const job: CommentJob = {
      id: randomUUID(),
      status: "running",
      targets: ids.length,
      targetsDone: 0,
      requested: ids.length * n,
      created: 0,
      errors: [],
      startedAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);

    void this.run(job, kind, ids, n).catch((err) => {
      this.logger.error(`comment job ${job.id} crashed: ${err?.message ?? err}`);
      this.pushError(job, err?.message ?? String(err));
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
    });
    return job;
  }

  getJob(id: string): CommentJob {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException("Job not found (API restarted or expired)");
    return job;
  }

  /** Мягко удаляет комментарии бот-пользователей у выбранных целей. */
  async deleteBotComments(targetType: string, targetIds: string[]): Promise<{ deleted: number }> {
    const kind = this.normalizeKind(targetType);
    const ids = (targetIds || []).filter(Boolean);
    if (ids.length === 0) throw new BadRequestException("No targets selected");
    const res = await this.prisma.comment.updateMany({
      where: {
        targetType: kind,
        targetId: { in: ids },
        deletedAt: null,
        user: { email: { endsWith: BOT_EMAIL_DOMAIN } },
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: res.count };
  }

  // ─── Выполнение задачи ─────────────────────────────────────────────────────

  private async run(job: CommentJob, kind: TargetKind, ids: string[], n: number) {
    const bots = await this.ensureBotPool();
    const model = await this.commentsModel();

    const queue = [...ids];
    let fatal: string | null = null;
    const worker = async () => {
      while (queue.length > 0 && !fatal) {
        const targetId = queue.shift()!;
        try {
          const target = await this.loadTarget(kind, targetId);
          if (target) await this.generateForTarget(target, n, bots, model, job);
          else this.pushError(job, `Цель ${targetId} не найдена`);
        } catch (err: any) {
          if (err instanceof FatalAiError) fatal = err.message;
          this.pushError(job, err?.message ?? String(err));
        }
        job.targetsDone++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

    job.status = fatal || (job.created === 0 && job.errors.length > 0) ? "failed" : "done";
    job.finishedAt = new Date().toISOString();
    this.logger.log(`comment job ${job.id}: ${job.created}/${job.requested} created, status=${job.status}`);
  }

  /** Генерирует до n комментариев к одной цели (прогресс — в job.created). */
  private async generateForTarget(
    target: TargetInfo,
    n: number,
    bots: Bot[],
    model: string,
    job: CommentJob,
  ): Promise<void> {
    const existingRows = await this.prisma.comment.findMany({
      where: { targetType: target.kind, targetId: target.id, deletedAt: null },
      select: { content: true, userId: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const existing = existingRows.map((r) => r.content);
    const seen = new Set(existing.map(dedupeKey));

    // Авторы: сначала те, кто ещё не комментировал эту цель; без повторов в пачке.
    const used = new Set(existingRows.map((r) => r.userId));
    const authors = shuffle(bots.filter((b) => !used.has(b.id)));
    if (authors.length < n) authors.push(...shuffle(bots.filter((b) => used.has(b.id))));

    let created = 0;
    let authorIdx = 0;
    // До двух проходов: второй догенерирует слоты, отброшенные фильтром.
    for (let attempt = 0; attempt < 2 && created < n; attempt++) {
      while (created < n) {
        const want = Math.min(CHUNK, n - created);
        const slotAuthors = Array.from({ length: want }, (_, i) => authors[(authorIdx + i) % authors.length]);
        const angles = pickAngles(target.kind, want);
        const slots = slotAuthors.map((a, i) => ({ voice: voiceFor(a.id), angle: angles[i] }));

        const raw = await this.callAi(model, buildCommentPrompt({ kind: target.kind, context: target.context, slots, existing }));
        const texts = parseCommentArray(raw);

        let accepted = 0;
        for (let i = 0; i < slots.length && i < texts.length; i++) {
          const text = cleanComment(texts[i]);
          if (!text) continue;
          const key = dedupeKey(text);
          if (seen.has(key)) continue;
          seen.add(key);
          existing.unshift(text);
          await this.prisma.comment.create({
            data: {
              userId: slotAuthors[i].id,
              targetType: target.kind,
              targetId: target.id,
              content: text,
              createdAt: randomPastDate(target.notBefore),
            },
          });
          accepted++;
          job.created++;
        }
        authorIdx += want;
        created += accepted;
        // Пачка почти целиком отбракована — не крутимся, идём на следующий проход.
        if (accepted < Math.ceil(want / 2)) break;
      }
    }
    if (created < n) this.logger.warn(`target ${target.kind}/${target.id}: ${created}/${n} comments passed filter`);
  }

  /** Вызов AI-сервиса; бросает с понятным текстом ошибки. */
  private async callAi(model: string, prompt: string): Promise<string> {
    const res = await fetch(`${AI_BASE}/ai/text/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system: COMMENT_SYSTEM_PROMPT,
        prompt,
        model,
        maxTokens: 1200,
        temperature: 0.95,
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `AI ${res.status}: ${body.slice(0, 300)}`;
      this.logger.error(`comment generation failed: ${msg}`);
      if (res.status === 402 || /INSUFFICIENT_BALANCE|API key not configured/i.test(body)) {
        throw new FatalAiError(msg);
      }
      throw new Error(msg);
    }
    const data = (await res.json()) as { content?: string };
    return data.content || "";
  }

  // ─── Цели ──────────────────────────────────────────────────────────────────

  private normalizeKind(targetType: string): TargetKind {
    if (targetType === "character") return "character";
    if (targetType === "short" || targetType === "gallery_item") return "short";
    throw new BadRequestException(`Unsupported target type "${targetType}"`);
  }

  private async loadTarget(kind: TargetKind, id: string): Promise<TargetInfo | null> {
    if (kind === "character") {
      const c = await this.prisma.character.findUnique({ where: { id } });
      if (!c) return null;
      return {
        kind,
        id,
        context: describeCharacter(c.name, (c.personality as Record<string, unknown>) || {}),
        notBefore: c.createdAt,
      };
    }
    const j = await this.prisma.aiJob.findUnique({ where: { id }, include: { character: true } });
    if (!j) return null;
    const input = (j.input as Record<string, unknown>) || {};
    const prompt = typeof input.prompt === "string" ? input.prompt.slice(0, 300) : "";
    const parts: string[] = [];
    if (j.character) parts.push(describeCharacter(j.character.name, (j.character.personality as Record<string, unknown>) || {}));
    if (prompt) parts.push(`Video scene (for mood only, keep comments tasteful): ${prompt}`);
    return { kind, id, context: parts.join("\n") || "A short video of an attractive young woman.", notBefore: j.createdAt };
  }

  // ─── Бот-пользователи ──────────────────────────────────────────────────────

  /**
   * Гарантирует пул из BOT_POOL_SIZE ботов (почта @bots.local, логин невозможен:
   * passwordHash = "!"). Заодно переименовывает старых ботов с ником bot_xxxx.
   */
  private async ensureBotPool(): Promise<Bot[]> {
    const bots = await this.prisma.user.findMany({
      where: { email: { endsWith: BOT_EMAIL_DOMAIN }, deletedAt: null },
      select: { id: true, nickname: true },
    });

    for (const b of bots) {
      if (!b.nickname || b.nickname.startsWith("bot_")) {
        await this.withUniqueNickname((nickname) =>
          this.prisma.user.update({ where: { id: b.id }, data: { nickname } }),
        );
      }
    }

    const result: Bot[] = bots.map((b) => ({ id: b.id }));
    while (result.length < BOT_POOL_SIZE) {
      const u = await this.withUniqueNickname((nickname) =>
        this.prisma.user.create({
          data: {
            email: `${randomUUID().slice(0, 12)}${BOT_EMAIL_DOMAIN}`,
            passwordHash: "!",
            nickname,
            isDemo: true,
            emailVerified: true,
          },
          select: { id: true },
        }),
      );
      result.push(u);
    }
    return result;
  }

  /** Повторяет операцию с новым случайным ником при конфликте уникальности. */
  private async withUniqueNickname<T>(op: (nickname: string) => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      const nickname = i < 8 ? randomNickname() : `${randomNickname()}${Math.floor(Math.random() * 1000)}`;
      try {
        return await op(nickname);
      } catch (err) {
        const unique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!unique || i >= 20) throw err;
      }
    }
  }

  // ─── Прочее ────────────────────────────────────────────────────────────────

  private async commentsModel(): Promise<string> {
    const s = await this.prisma.appSetting.findUnique({ where: { key: "COMMENTS_MODEL" } });
    return s?.value?.trim() || DEFAULT_COMMENTS_MODEL;
  }

  private pushError(job: CommentJob, msg: string) {
    job.errors.push(msg);
    if (job.errors.length > 10) job.errors.shift();
  }

  private gcJobs() {
    const now = Date.now();
    for (const [id, j] of this.jobs) {
      if (j.finishedAt && now - Date.parse(j.finishedAt) > JOB_TTL_MS) this.jobs.delete(id);
    }
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
