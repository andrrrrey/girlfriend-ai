/**
 * @file option-synonyms.service.ts
 * @description Автогенерация синонимов опций генерации через LLM (админка).
 *
 * Синонимы — как пользователь может назвать опцию в сообщении («купальник»,
 * «в бикини», «swimsuit» → Bikini); по ним роутер намерений находит опцию в тексте.
 *
 * Задача выполняется в фоне пачками по BATCH_SIZE опций (/ai/text/completion,
 * строгий JSON), под распределённым локом — одновременно идёт только одна.
 * Прогресс хранится в Redis, поэтому его видно с любого инстанса API.
 * По умолчанию обрабатываются только опции без синонимов; overwrite — все.
 */

import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { PrismaService } from "../../prisma.service";
import { REDIS } from "../../common/redis.constants";
import { RedisLockService } from "../../common/redis-lock.service";
import { AI_BASE } from "../../conversation/ai-client";
import { normalizeSynonyms } from "../../generation/prompt/synonyms";

const BATCH_SIZE = 25;
const LOCK_KEY = "option-synonyms-generate";
const LOCK_TTL_MS = 120_000;
const STATUS_KEY = "option-synonyms:status";
const STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 90_000;

/** Таблицы опций и как их подписать для модели. */
const TABLES = [
  { key: "characterOption", label: "character trait (style / ethnicity / hair style / body type / size)" },
  { key: "appearanceOption", label: "outfit or outfit detail" },
  { key: "poseOption", label: "pose or facial expression" },
  { key: "sceneOption", label: "location / scene" },
  { key: "cameraOption", label: "camera framing or angle" },
] as const;

type TableKey = (typeof TABLES)[number]["key"];

/** Прогресс генерации. */
export interface SynonymsStatus {
  state: "idle" | "running" | "done" | "failed";
  total: number;
  processed: number;
  updated: number;
  failedBatches: number;
  overwrite: boolean;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

/** Опция для генерации синонимов. */
interface OptionRow {
  id: string;
  name: string;
  prompt: string | null;
}

/** Минимальный интерфейс делегата Prisma для таблиц опций. */
interface OptionDelegate {
  findMany(args: unknown): Promise<OptionRow[]>;
  update(args: unknown): Promise<unknown>;
}

/**
 * Разбирает ответ модели { "<id>": ["синоним", …] } и нормализует синонимы.
 * Неизвестные id и не-массивы отбрасываются.
 */
export function parseSynonymsResponse(raw: string, batch: OptionRow[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return result;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return result;
  }
  if (!data || typeof data !== "object") return result;
  for (const option of batch) {
    const list = (data as Record<string, unknown>)[option.id];
    if (!Array.isArray(list)) continue;
    const synonyms = normalizeSynonyms(list, option.name);
    if (synonyms.length) result.set(option.id, synonyms);
  }
  return result;
}

@Injectable()
export class OptionSynonymsService {
  private readonly logger = new Logger(OptionSynonymsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: RedisLockService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Текущий прогресс (или idle, если генерация не запускалась). */
  async getStatus(): Promise<SynonymsStatus> {
    const raw = await this.redis.get(STATUS_KEY);
    return raw
      ? (JSON.parse(raw) as SynonymsStatus)
      : { state: "idle", total: 0, processed: 0, updated: 0, failedBatches: 0, overwrite: false };
  }

  /**
   * Запускает генерацию в фоне.
   * @param overwrite — перегенерировать и для опций, у которых синонимы уже есть
   * @throws 409 — генерация уже идёт
   */
  async start(overwrite: boolean): Promise<SynonymsStatus> {
    const lock = await this.locks.acquire(LOCK_KEY, LOCK_TTL_MS);
    if (!lock) throw new ConflictException({ error: "ALREADY_RUNNING", message: "Генерация синонимов уже идёт" });

    let status: SynonymsStatus;
    try {
      status = {
        state: "running",
        total: await this.countPending(overwrite),
        processed: 0,
        updated: 0,
        failedBatches: 0,
        overwrite,
        startedAt: new Date().toISOString(),
      };
      await this.saveStatus(status);
    } catch (err) {
      await this.locks.release(lock).catch(() => undefined);
      throw err;
    }

    const stop = this.locks.keepAlive(lock, LOCK_TTL_MS);
    void this.run(status, overwrite)
      .catch(async (err) => {
        this.logger.error(`synonyms generation failed: ${err?.message}`);
        await this.saveStatus({ ...status, state: "failed", error: String(err?.message ?? err), finishedAt: new Date().toISOString() });
      })
      .finally(async () => {
        stop();
        await this.locks.release(lock).catch(() => undefined);
      });
    return status;
  }

  private async run(status: SynonymsStatus, overwrite: boolean): Promise<void> {
    for (const table of TABLES) {
      const rows = await this.delegate(table.key).findMany({
        where: overwrite ? {} : { synonyms: { isEmpty: true } },
        select: { id: true, name: true, prompt: true },
        orderBy: { createdAt: "asc" },
      });
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        try {
          const synonyms = parseSynonymsResponse(await this.generateBatch(table.label, batch), batch);
          for (const [id, list] of synonyms) {
            await this.delegate(table.key).update({ where: { id }, data: { synonyms: list } });
            status.updated++;
          }
        } catch (err: any) {
          status.failedBatches++;
          this.logger.warn(`synonyms batch failed (${table.key}): ${err?.message}`);
        }
        status.processed += batch.length;
        await this.saveStatus(status);
      }
    }
    await this.saveStatus({ ...status, state: "done", finishedAt: new Date().toISOString() });
  }

  /** Один запрос к модели на пачку опций. */
  private async generateBatch(label: string, batch: OptionRow[]): Promise<string> {
    const system = [
      `You write search synonyms for options of an AI image generator. Each option is a ${label}.`,
      "For every option give 3-8 short phrases a user might type in a chat to ask for it:",
      "Russian words and phrases (including common inflected forms, e.g. «купальник», «в купальнике»),",
      "English words and casual slang. Lowercase, no explanations, do not repeat the option name itself.",
      'Answer with ONLY a JSON object mapping option id to an array of strings: {"<id>": ["...", "..."]}',
    ].join("\n");
    const prompt = batch
      .map((o) => `${o.id} | ${o.name}${o.prompt ? ` | ${o.prompt.slice(0, 150)}` : ""}`)
      .join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${AI_BASE}/ai/text/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system, prompt, maxTokens: 3000, temperature: 0.3 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`AI text completion HTTP ${res.status}`);
      const data = (await res.json()) as { content?: string };
      return data.content ?? "";
    } finally {
      clearTimeout(timer);
    }
  }

  private async countPending(overwrite: boolean): Promise<number> {
    let total = 0;
    for (const table of TABLES) {
      const delegate = this.prisma[table.key] as unknown as { count(args: unknown): Promise<number> };
      total += await delegate.count({ where: overwrite ? {} : { synonyms: { isEmpty: true } } });
    }
    return total;
  }

  private delegate(key: TableKey): OptionDelegate {
    return this.prisma[key] as unknown as OptionDelegate;
  }

  private async saveStatus(status: SynonymsStatus): Promise<void> {
    await this.redis.set(STATUS_KEY, JSON.stringify(status), "EX", STATUS_TTL_SECONDS);
  }
}
