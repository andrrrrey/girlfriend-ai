/**
 * @file moderation.service.ts
 * @description Обязательная проверка запроса генерации на запрещённое — до
 * постановки задания и до списания кредитов. Два рубежа:
 *  1) словарь (moderation-rules.ts) + расширение из админки (AppSetting
 *     MODERATION_BLOCKLIST / MODERATION_REAL_PERSONS — JSON-массив или строки);
 *  2) LLM-классификация через AI-сервис (/ai/moderate), результат кэшируется.
 *
 * Если LLM недоступна: NSFW-запрос блокируется (fail-closed), SFW — пропускается.
 */

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../prisma.service";
import { checkRules, type ModerationCategory } from "./moderation-rules";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 5000;
const SETTINGS_TTL_MS = 60 * 1000;

export type ModerationVerdict = { allowed: true } | { allowed: false; category: ModerationCategory | string; source: "rules" | "llm" | "unavailable" };

function parseList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);
  } catch {
    /* не JSON — по строкам/запятым */
  }
  return raw.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly cache = new Map<string, { at: number; verdict: ModerationVerdict }>();
  private settings: { at: number; blocklist: string[]; names: string[]; llm: boolean } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async loadSettings() {
    if (this.settings && Date.now() - this.settings.at < SETTINGS_TTL_MS) return this.settings;
    const rows = await this.prisma.appSetting
      .findMany({ where: { key: { in: ["MODERATION_BLOCKLIST", "MODERATION_REAL_PERSONS", "MODERATION_LLM_ENABLED"] } } })
      .catch(() => [] as { key: string; value: string }[]);
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    this.settings = {
      at: Date.now(),
      blocklist: parseList(get("MODERATION_BLOCKLIST")),
      names: parseList(get("MODERATION_REAL_PERSONS")),
      llm: get("MODERATION_LLM_ENABLED") !== "false",
    };
    return this.settings;
  }

  private async askLlm(prompt: string): Promise<{ allowed: boolean; category?: string } | null> {
    try {
      const res = await fetch(`${AI_BASE}/ai/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { allowed?: unknown; category?: unknown };
      if (typeof data.allowed !== "boolean") return null;
      return { allowed: data.allowed, category: typeof data.category === "string" ? data.category : undefined };
    } catch (err) {
      this.logger.warn(`moderation LLM unavailable: ${(err as Error).message}`);
      return null;
    }
  }

  /** Проверка без исключения. Тексты (исходный и переведённый) проверяются вместе. */
  async check(texts: (string | undefined | null)[], opts: { contentMode?: "nsfw" | "sfw" } = {}): Promise<ModerationVerdict> {
    const parts = texts.map((t) => (t ?? "").trim()).filter(Boolean);
    if (!parts.length) return { allowed: true };
    const settings = await this.loadSettings();

    for (const text of parts) {
      const hit = checkRules(text, settings.blocklist, settings.names);
      if (hit) return { allowed: false, category: hit.category, source: "rules" };
    }
    if (!settings.llm) return { allowed: true };

    const joined = parts.join("\n");
    const key = createHash("sha256").update(joined).digest("hex");
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.verdict;

    const llm = await this.askLlm(joined);
    if (!llm) {
      // LLM недоступна: NSFW — блок (лучше отказать, чем сгенерировать запрещённое), SFW — пропуск.
      if (opts.contentMode !== "sfw") return { allowed: false, category: "unavailable", source: "unavailable" };
      return { allowed: true };
    }
    const verdict: ModerationVerdict = llm.allowed
      ? { allowed: true }
      : { allowed: false, category: llm.category || "other", source: "llm" };
    if (this.cache.size >= CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: Date.now(), verdict });
    return verdict;
  }

  /** Бросает 400 PROMPT_FORBIDDEN, если запрос нарушает список запретов. */
  async assertAllowed(
    texts: (string | undefined | null)[],
    opts: { contentMode?: "nsfw" | "sfw"; userId?: string; kind?: string } = {},
  ): Promise<void> {
    const verdict = await this.check(texts, opts);
    if (verdict.allowed) return;
    this.logger.warn(
      `generation blocked: user=${opts.userId ?? "-"} kind=${opts.kind ?? "-"} category=${verdict.category} source=${verdict.source}`,
    );
    if (verdict.source === "unavailable") {
      throw new BadRequestException({
        error: "MODERATION_UNAVAILABLE",
        message: "Проверка запроса временно недоступна, попробуйте позже",
      });
    }
    throw new BadRequestException({
      error: "PROMPT_FORBIDDEN",
      category: verdict.category,
      message: "Запрос нарушает правила сервиса",
    });
  }
}
