/**
 * @file character-identity.service.ts
 * @description Промпт внешности персонажа (personality.avatarPrompt) по его аватару.
 *
 * Фото персонажа в чате строятся на avatarPrompt — промпте внешности, который
 * сохраняется при создании персонажа. У персонажей, созданных до этой функции,
 * его нет: промпт собирается из скудных атрибутов, и модель рисует кого угодно.
 *
 * Здесь такой промпт получается один раз по аватару моделью со зрением
 * (/ai/vision/describe) и сохраняется в personality.avatarPrompt
 * (avatarPromptSource = "vision"):
 * - лениво — при первом фото персонажа (ensureIdentity);
 * - массово — фоновой задачей из админки (startBatch), с прогрессом в Redis.
 */

import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type Redis from "ioredis";
import { PrismaService } from "../../prisma.service";
import { REDIS } from "../../common/redis.constants";
import { RedisLockService } from "../../common/redis-lock.service";
import { AI_BASE } from "../../conversation/ai-client";
import { GenerationService } from "../generation.service";

const IDENTITY_SYSTEM = [
  "You write Stable Diffusion prompts.",
  "Describe ONLY the persistent physical appearance of the single main character in the image",
  "as a comma-separated list of short English tags, in this order: gender, apparent age,",
  "ethnicity or skin tone, hair color, hair length, hair style, eye color, notable face features,",
  "body type, breast size, distinctive features (horns, animal ears, tattoos, piercings, glasses,",
  "freckles), art style (e.g. anime, photorealistic, 3d render).",
  "Do NOT mention clothing, nudity, pose, expression, background, lighting, camera or text.",
  "Output only the tags, at most 40 words, no sentences.",
].join(" ");

const LOCK_TTL_MS = 120_000;
const BATCH_LOCK_KEY = "character-identity-batch";
const STATUS_KEY = "character-identity:status";
const STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_PROMPT_LENGTH = 600;

/** Персонаж с данными, нужными для промпта внешности. */
export interface IdentityCharacter {
  id: string;
  personality: unknown;
  avatarUrl?: string | null;
}

/** Прогресс массового описания аватаров. */
export interface IdentityBatchStatus {
  state: "idle" | "running" | "done" | "failed";
  total: number;
  processed: number;
  updated: number;
  failed: number;
  /** Причины неудач с количеством (самые частые первыми) — для диагностики. */
  errors?: { reason: string; count: number }[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

/** Результат описания аватара: personality с промптом или причина неудачи. */
type DescribeResult = { personality: Record<string, unknown> } | { reason: string };

/** Добавляет причину неудачи в статус (не больше 5 разных причин). */
function addFailureReason(status: IdentityBatchStatus, reason: string): void {
  const errors = status.errors ?? [];
  const existing = errors.find((e) => e.reason === reason);
  if (existing) existing.count++;
  else if (errors.length < 5) errors.push({ reason, count: 1 });
  errors.sort((a, b) => b.count - a.count);
  status.errors = errors;
}

/**
 * Приводит ответ модели к промпту: теги через запятую, без пояснений, отказов
 * и дублей. null — ответ непригоден (отказ, слишком мало тегов).
 */
export function sanitizeIdentityPrompt(raw: string): string | null {
  const text = raw
    .replace(/```[a-z]*/gi, " ")
    .replace(/\n+/g, ", ")
    .replace(/["`*]/g, "")
    .replace(/^\s*(tags?|prompt)\s*:\s*/i, "")
    .trim();
  if (/\b(sorry|cannot|can't|unable to|i'm not able|as an ai)\b/i.test(text)) return null;

  const tags: string[] = [];
  for (const part of text.split(",")) {
    const tag = part.trim().replace(/\.$/, "").toLowerCase();
    if (!tag || tag.length > 60 || tags.includes(tag)) continue;
    tags.push(tag);
  }
  if (tags.length < 3) return null;
  return tags.join(", ").slice(0, MAX_PROMPT_LENGTH);
}

@Injectable()
export class CharacterIdentityService {
  private readonly logger = new Logger(CharacterIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
    private readonly locks: RedisLockService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * personality персонажа с гарантированным (по возможности) avatarPrompt.
   * Если промпта нет — описывает аватар и сохраняет. Любой сбой не мешает
   * генерации: возвращается исходная personality.
   */
  async ensureIdentity(character: IdentityCharacter): Promise<Record<string, unknown>> {
    const personality = (character.personality ?? {}) as Record<string, unknown>;
    if (this.hasIdentity(personality) || !character.avatarUrl) return personality;

    const lock = await this.locks.acquire(`character-identity:${character.id}`, LOCK_TTL_MS).catch(() => null);
    if (!lock) return personality; // описание уже идёт параллельно — сейчас обходимся без него
    try {
      const result = await this.describeAndSave(character);
      if ("personality" in result) return result.personality;
      this.logger.warn(`identity for character ${character.id} failed: ${result.reason}`);
      return personality;
    } catch (err: any) {
      this.logger.warn(`identity for character ${character.id} failed: ${err?.message}`);
      return personality;
    } finally {
      await this.locks.release(lock).catch(() => undefined);
    }
  }

  /** Прогресс массового описания. */
  async getStatus(): Promise<IdentityBatchStatus> {
    const raw = await this.redis.get(STATUS_KEY);
    return raw ? (JSON.parse(raw) as IdentityBatchStatus) : { state: "idle", total: 0, processed: 0, updated: 0, failed: 0 };
  }

  /**
   * Запускает в фоне описание аватаров всех персонажей без avatarPrompt.
   * @throws 409 — задача уже идёт
   */
  async startBatch(): Promise<IdentityBatchStatus> {
    const lock = await this.locks.acquire(BATCH_LOCK_KEY, LOCK_TTL_MS);
    if (!lock) throw new ConflictException({ error: "ALREADY_RUNNING", message: "Описание аватаров уже идёт" });

    let candidates: IdentityCharacter[];
    let status: IdentityBatchStatus;
    try {
      candidates = (
        await this.prisma.character.findMany({
          where: { deletedAt: null, avatarUrl: { not: null } },
          select: { id: true, personality: true, avatarUrl: true },
          orderBy: { createdAt: "asc" },
        })
      ).filter((c) => !this.hasIdentity((c.personality ?? {}) as Record<string, unknown>));
      status = { state: "running", total: candidates.length, processed: 0, updated: 0, failed: 0, startedAt: new Date().toISOString() };
      await this.saveStatus(status);
    } catch (err) {
      await this.locks.release(lock).catch(() => undefined);
      throw err;
    }

    const stop = this.locks.keepAlive(lock, LOCK_TTL_MS);
    void (async () => {
      for (const character of candidates) {
        let reason: string | null = null;
        try {
          const result = await this.describeAndSave(character);
          if ("personality" in result) status.updated++;
          else reason = result.reason;
        } catch (err: any) {
          reason = String(err?.message ?? err);
        }
        if (reason) {
          status.failed++;
          addFailureReason(status, reason);
          this.logger.warn(`identity for character ${character.id} failed: ${reason}`);
        }
        status.processed++;
        await this.saveStatus(status);
      }
      await this.saveStatus({ ...status, state: "done", finishedAt: new Date().toISOString() });
    })()
      .catch(async (err) => {
        await this.saveStatus({ ...status, state: "failed", error: String(err?.message ?? err), finishedAt: new Date().toISOString() });
      })
      .finally(async () => {
        stop();
        await this.locks.release(lock).catch(() => undefined);
      });
    return status;
  }

  private hasIdentity(personality: Record<string, unknown>): boolean {
    return typeof personality.avatarPrompt === "string" && personality.avatarPrompt.trim().length > 0;
  }

  /**
   * Описывает аватар и сохраняет avatarPrompt (personality перечитывается перед
   * записью, чтобы не затереть параллельные правки).
   * @returns обновлённая personality или причина неудачи
   */
  private async describeAndSave(character: IdentityCharacter): Promise<DescribeResult> {
    const imageUrl = await this.generation.toProviderImageUrl(character.avatarUrl);
    if (!imageUrl) return { reason: `не удалось получить ссылку на аватар (${String(character.avatarUrl).slice(0, 80)})` };

    const res = await fetch(`${AI_BASE}/ai/vision/describe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, system: IDENTITY_SYSTEM, prompt: "List the appearance tags.", maxTokens: 200 }),
      signal: AbortSignal.timeout(100_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
      return { reason: `AI-сервис ${res.status}: ${[body.error, body.details].filter(Boolean).join(" — ").slice(0, 200)}` };
    }
    const data = (await res.json()) as { content?: string; model?: string };
    const avatarPrompt = sanitizeIdentityPrompt(data.content ?? "");
    if (!avatarPrompt) {
      return { reason: `модель не дала описание (${data.model ?? "?"}): «${(data.content ?? "").slice(0, 80)}»` };
    }

    const fresh = await this.prisma.character.findUnique({ where: { id: character.id }, select: { personality: true } });
    const current = (fresh?.personality ?? {}) as Record<string, unknown>;
    if (this.hasIdentity(current)) return { personality: current }; // успели сохранить параллельно
    const personality = { ...current, avatarPrompt, avatarPromptSource: "vision", avatarPromptModel: data.model };
    await this.prisma.character.update({
      where: { id: character.id },
      data: { personality: personality as Prisma.InputJsonValue },
    });
    this.logger.log(`character ${character.id}: avatarPrompt described from avatar`);
    return { personality };
  }

  private async saveStatus(status: IdentityBatchStatus): Promise<void> {
    await this.redis.set(STATUS_KEY, JSON.stringify(status), "EX", STATUS_TTL_SECONDS);
  }
}
