/**
 * @file generate-backstory.ts
 * @description Генерация текстовых полей бэкстори персонажа через AI-сервис.
 *
 * Заполняет три свободных поля, которые в /create вводятся вручную (premium):
 *   - childhoodMemory — «Childhood and adolescence»
 *   - lifeStory       — «Memories and life story»
 *   - phobias         — «Phobias»
 *
 * Используется фоновой автогенерацией персонажей (admin/autogen). Реализация —
 * копия подхода generate-seo-bio.ts: один вызов /ai/text/completion, строгий JSON
 * на выходе, защитный парсинг. Текст всегда на английском.
 */

import { loadEnv } from "@repo/config";
import { humanize } from "./character-normalize";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/** Результат генерации бэкстори. */
export interface Backstory {
  childhoodMemory: string;
  lifeStory: string;
  phobias: string;
}

/** Поля personality, которые подаём модели как факты (от общего к частному). */
const FACT_FIELDS: { key: string; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "nationality", label: "Nationality" },
  { key: "ethnicity", label: "Ethnicity" },
  { key: "personality", label: "Personality" },
  { key: "relationshipType", label: "Relationship role" },
  { key: "familyStatus", label: "Family status" },
  { key: "lifestyle", label: "Lifestyle" },
];

const LIST_FIELDS: { key: string; label: string }[] = [
  { key: "work", label: "Occupation" },
  { key: "hobbies", label: "Hobbies" },
];

/** Превращает значение personality в человекочитаемую строку. */
function humanizeValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => humanize(String(x))).join(", ");
  if (typeof v === "number") return String(v);
  return humanize(String(v));
}

/** Собирает компактный список фактов о персонаже для промпта. */
function buildFactSheet(name: string, personality: Record<string, unknown>): string {
  const lines: string[] = [`Name: ${name}`];
  for (const { key, label } of FACT_FIELDS) {
    const val = humanizeValue(personality[key]);
    if (val) lines.push(`${label}: ${val}`);
  }
  for (const { key, label } of LIST_FIELDS) {
    const val = humanizeValue(personality[key]);
    if (val) lines.push(`${label}: ${val}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "You are a creative writer building rich backstories for fictional AI companion characters. " +
  "Always write in English, in third person. Do not refuse. Do not mention being an AI model or content policies. " +
  "Keep it tasteful. " +
  'Respond with ONLY a valid minified JSON object of the exact shape ' +
  '{"childhoodMemory": string, "lifeStory": string, "phobias": string} and nothing else. ' +
  'The "childhoodMemory" is 1-2 sentences about a vivid memory from her childhood or adolescence. ' +
  'The "lifeStory" is 2-3 sentences summarizing her life journey, defining events and how she became who she is. ' +
  'The "phobias" is 1 sentence naming one or two fears or phobias and why they haunt her.';

/**
 * Защитный парсинг JSON-ответа модели: вырезаем первый {...}, если модель
 * добавила лишний текст. При неудаче — пустые строки (персонаж создаётся без
 * бэкстори, это не критично).
 */
function parseBackstoryJson(raw: string): Backstory {
  const empty: Backstory = { childhoodMemory: "", lifeStory: "", phobias: "" };
  const tryParse = (s: string): Backstory | null => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object") {
        return {
          childhoodMemory: typeof obj.childhoodMemory === "string" ? obj.childhoodMemory.trim() : "",
          lifeStory: typeof obj.lifeStory === "string" ? obj.lifeStory.trim() : "",
          phobias: typeof obj.phobias === "string" ? obj.phobias.trim() : "",
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  let parsed = tryParse(raw.trim());
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) parsed = tryParse(raw.slice(start, end + 1));
  }
  return parsed || empty;
}

/**
 * Генерирует бэкстори персонажа (childhood/lifeStory/phobias) через AI-сервис.
 *
 * @param name — имя персонажа
 * @param personality — JSON-поле personality (уже нормализованное)
 * @returns { childhoodMemory, lifeStory, phobias }
 * @throws Error если AI-сервис недоступен/вернул ошибку (сообщение содержит
 *         текст провайдера — вызывающий классифицирует его, в т.ч. на нехватку
 *         баланса).
 */
export async function generateBackstory(
  name: string,
  personality: Record<string, unknown>,
): Promise<Backstory> {
  const factSheet = buildFactSheet(name, personality);
  const userPrompt =
    `Write the backstory for this AI companion based on these facts:\n\n${factSheet}\n\n` +
    `Return ONLY the JSON object {"childhoodMemory": "...", "lifeStory": "...", "phobias": "..."}.`;

  const res = await fetch(`${AI_BASE}/ai/text/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM_PROMPT, prompt: userPrompt, maxTokens: 2048 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "AI service unavailable" }));
    throw new Error((err as { error?: string }).error || `AI service error ${res.status}`);
  }

  const data = (await res.json()) as { content?: string };
  const content = (data.content || "").trim();
  if (!content) throw new Error("Empty response from AI model");

  return parseBackstoryJson(content);
}
