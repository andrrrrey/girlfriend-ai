/**
 * @file character-greetings.ts
 * @description Свои приветствия у каждого персонажа (первое сообщение чата).
 *
 * Хранятся в personality.greetings = { en: string[], ru: [...], de: [...], fr: [...] },
 * по 2–3 варианта на язык. При старте диалога показывается случайный вариант
 * (ConversationEngine.greet) без вызова модели. Если для языка вариантов нет —
 * приветствие, как раньше, генерирует модель.
 *
 * Генерация — один вызов /ai/text/completion (как generate-seo-bio.ts), каждый
 * вариант проходит ту же модерацию, что и запросы генерации.
 */

import type { Prisma } from "@prisma/client";
import { loadEnv } from "@repo/config";
import type { PrismaService } from "../prisma.service";
import type { ModerationService } from "../moderation/moderation.service";

/** Адрес AI-сервиса (лениво: модуль импортируют и чистые тесты без env). */
function aiBase(): string {
  const env = loadEnv();
  return `http://${env.AI_HOST}:${env.AI_PORT}`;
}

export const GREETING_LANGS = ["en", "ru", "de", "fr"] as const;
export type GreetingLang = (typeof GREETING_LANGS)[number];
export type CharacterGreetings = Partial<Record<GreetingLang, string[]>>;

/** Сколько вариантов на язык генерируем и максимум хранимых. */
export const GREETINGS_PER_LANG = 3;
const MAX_GREETINGS_PER_LANG = 5;
const MAX_GREETING_LEN = 600;

/** Чистит и ограничивает приветствия из произвольного JSON (админка, модель). */
export function normalizeGreetings(raw: unknown): CharacterGreetings {
  const out: CharacterGreetings = {};
  if (!raw || typeof raw !== "object") return out;
  for (const lang of GREETING_LANGS) {
    const list = (raw as Record<string, unknown>)[lang];
    if (!Array.isArray(list)) continue;
    const clean = [...new Set(
      list
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, MAX_GREETING_LEN))
        .filter(Boolean),
    )].slice(0, MAX_GREETINGS_PER_LANG);
    if (clean.length) out[lang] = clean;
  }
  return out;
}

/** Случайное приветствие персонажа для языка (или null — пусть генерирует модель). */
export function pickGreeting(personality: unknown, lang: string, random: () => number = Math.random): string | null {
  const greetings = normalizeGreetings((personality as Record<string, unknown> | null)?.["greetings"]);
  const list = greetings[(GREETING_LANGS as readonly string[]).includes(lang) ? (lang as GreetingLang) : "en"];
  if (!list?.length) return null;
  return list[Math.floor(random() * list.length)] ?? list[0]!;
}

export function hasGreetings(personality: unknown): boolean {
  const g = normalizeGreetings((personality as Record<string, unknown> | null)?.["greetings"]);
  return GREETING_LANGS.every((l) => (g[l]?.length ?? 0) > 0);
}

const SYSTEM_PROMPT =
  "You write the very first chat message that a fictional adult AI companion sends to a user who just opened a chat with her. " +
  "Stay fully in character: use her personality, occupation, hobbies, backstory and the way she talks. " +
  "Each greeting is 1-3 short sentences, may include one *action in asterisks*, ends with something that invites a reply, " +
  "flirty but NOT sexually explicit, never mentions being an AI, no minors, no family relations, no school settings. " +
  `Write ${GREETINGS_PER_LANG} clearly different greetings (different situations/moods) in each language: English, Russian, German, French. ` +
  "The variants in different languages may differ — they do not have to be translations. " +
  'Respond with ONLY minified JSON of the exact shape {"en":[...],"ru":[...],"de":[...],"fr":[...]} and nothing else.';

function parseJsonObject(raw: string): unknown {
  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  const whole = tryParse(raw.trim());
  if (whole) return whole;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start !== -1 && end > start ? tryParse(raw.slice(start, end + 1)) : null;
}

/** Генерирует приветствия по описанию персонажа (без сохранения). */
export async function generateGreetings(character: {
  name: string;
  systemPrompt: string;
  personality?: unknown;
}): Promise<CharacterGreetings> {
  const p = (character.personality as Record<string, unknown> | null) ?? {};
  const facts = [
    `Name: ${character.name}`,
    p.age ? `Age: ${p.age}` : "",
    p.relationshipType ? `Relationship to the user: ${p.relationshipType}` : "",
    Array.isArray(p.work) && p.work.length ? `Occupation: ${p.work.join(", ")}` : "",
    Array.isArray(p.hobbies) && p.hobbies.length ? `Hobbies: ${p.hobbies.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const prompt =
    `Character description:\n${character.systemPrompt.slice(0, 6000)}\n\n${facts}\n\n` +
    `Return ONLY the JSON object with ${GREETINGS_PER_LANG} greetings per language.`;

  const res = await fetch(`${aiBase()}/ai/text/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM_PROMPT, prompt, maxTokens: 2048 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "AI service unavailable" }));
    throw new Error((err as { error?: string }).error || `AI service error ${res.status}`);
  }
  const data = (await res.json()) as { content?: string };
  const greetings = normalizeGreetings(parseJsonObject(data.content || ""));
  if (!Object.keys(greetings).length) throw new Error("AI returned no greetings");
  return greetings;
}

/** Оставляет только варианты, прошедшие модерацию (каждый проверяется отдельно). */
export async function moderateGreetings(
  moderation: Pick<ModerationService, "check">,
  greetings: CharacterGreetings,
): Promise<CharacterGreetings> {
  const out: CharacterGreetings = {};
  for (const lang of GREETING_LANGS) {
    const kept: string[] = [];
    for (const text of greetings[lang] ?? []) {
      const verdict = await moderation.check([text], { contentMode: "sfw" });
      if (verdict.allowed) kept.push(text);
    }
    if (kept.length) out[lang] = kept;
  }
  return out;
}

/**
 * Гарантирует приветствия у персонажа: генерирует, если хотя бы для одного
 * языка их нет (или force). Сохраняет в personality.greetings.
 */
export async function ensureCharacterGreetings(
  prisma: PrismaService,
  moderation: Pick<ModerationService, "check">,
  characterId: string,
  opts: { force?: boolean } = {},
): Promise<CharacterGreetings | null> {
  const character = await prisma.character.findFirst({
    where: { id: characterId, deletedAt: null },
    select: { id: true, name: true, systemPrompt: true, personality: true },
  });
  if (!character) return null;
  const personality = (character.personality as Record<string, unknown> | null) ?? {};
  if (!opts.force && hasGreetings(personality)) return normalizeGreetings(personality.greetings);

  const generated = await moderateGreetings(moderation, await generateGreetings(character));
  // Уже заданные вручную языки не трогаем (кроме force).
  const existing = opts.force ? {} : normalizeGreetings(personality.greetings);
  const merged: CharacterGreetings = { ...generated, ...existing };
  if (!Object.keys(merged).length) return null;

  // Перечитываем personality прямо перед записью — чтобы не затереть параллельную правку.
  const fresh = await prisma.character.findUnique({ where: { id: character.id }, select: { personality: true } });
  await prisma.character.update({
    where: { id: character.id },
    data: {
      personality: {
        ...((fresh?.personality as Record<string, unknown> | null) ?? {}),
        greetings: merged,
      } as Prisma.InputJsonValue,
    },
  });
  return merged;
}

/**
 * Фоновое заполнение приветствий для всех персонажей без них (идемпотентно).
 * Возвращает число персонажей в очереди сразу; генерация идёт последовательно
 * с паузой, чтобы не перегружать провайдера.
 */
export async function backfillAllCharacterGreetings(
  prisma: PrismaService,
  moderation: Pick<ModerationService, "check">,
  opts: { limit?: number; onError?: (id: string, err: unknown) => void } = {},
): Promise<number> {
  const all = await prisma.character.findMany({
    where: { deletedAt: null },
    select: { id: true, personality: true },
    orderBy: { createdAt: "desc" },
  });
  const todo = all.filter((c) => !hasGreetings(c.personality)).slice(0, opts.limit ?? Infinity);

  void (async () => {
    for (const { id } of todo) {
      try {
        await ensureCharacterGreetings(prisma, moderation, id);
      } catch (err) {
        opts.onError?.(id, err);
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();

  return todo.length;
}
