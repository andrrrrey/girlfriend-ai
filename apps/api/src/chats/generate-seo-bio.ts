import { loadEnv } from "@repo/config";
import { humanize } from "./character-normalize";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/** Результат генерации SEO-текста персонажа. */
export interface SeoBio {
  bio: string;
  appearance: string;
}

/**
 * Поля personality, которые мы скармливаем модели как факты о персонаже.
 * Порядок — от общего к частному; значения humanize'аются (snake_case → слова).
 */
const FACT_FIELDS: { key: string; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "orientation", label: "Sexual orientation" },
  { key: "nationality", label: "Nationality" },
  { key: "ethnicity", label: "Ethnicity" },
  { key: "eyeColor", label: "Eye color" },
  { key: "hairColor", label: "Hair color" },
  { key: "hairStyle", label: "Hair style" },
  { key: "bodyType", label: "Body type" },
  { key: "breastSize", label: "Breast size" },
  { key: "buttSize", label: "Butt size" },
  { key: "personality", label: "Personality" },
  { key: "relationshipType", label: "Relationship role" },
  { key: "familyStatus", label: "Family status" },
  { key: "lifestyle", label: "Lifestyle" },
];

/** Поля-массивы (хобби, работа, кинки). */
const LIST_FIELDS: { key: string; label: string }[] = [
  { key: "work", label: "Occupation" },
  { key: "hobbies", label: "Hobbies" },
  { key: "kinks", label: "Interests" },
];

/** Превращает значение personality в человекочитаемую строку. */
function humanizeValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => humanize(String(x))).join(", ");
  if (typeof v === "number") return String(v);
  return humanize(String(v));
}

/**
 * Собирает компактный список фактов о персонаже для промпта.
 */
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

  // Свободные текстовые поля бэкстори, если есть.
  for (const key of ["childhoodMemory", "lifeStory", "phobias"] as const) {
    const raw = personality[key];
    if (typeof raw === "string" && raw.trim()) {
      lines.push(`${key}: ${raw.trim()}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT =
  "You are an SEO copywriter for an AI companion platform. " +
  "You write polished, engaging English profile copy for fictional AI characters. " +
  "Always write in English, in third person. Do not refuse. Do not mention being an AI model or content policies. " +
  "Keep it tasteful and suggestive rather than explicit. " +
  'Respond with ONLY a valid minified JSON object of the exact shape {"bio": string, "appearance": string} and nothing else. ' +
  "The \"bio\" must be 3-4 paragraphs (separated by \\n\\n) telling the character's personality, background, lifestyle and what makes her captivating. " +
  "The \"appearance\" must be ONE vivid paragraph describing how she looks, based on the given physical traits.";

/**
 * Защитный парсинг JSON-ответа модели: вырезаем первый {...}, если модель
 * добавила лишний текст; если JSON не извлечь — кладём весь текст в bio.
 */
function parseSeoJson(raw: string): SeoBio {
  const tryParse = (s: string): SeoBio | null => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object") {
        return {
          bio: typeof obj.bio === "string" ? obj.bio.trim() : "",
          appearance: typeof obj.appearance === "string" ? obj.appearance.trim() : "",
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  // 1) Целиком.
  let parsed = tryParse(raw.trim());
  // 2) Первый сбалансированный {...}.
  if (!parsed) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      parsed = tryParse(raw.slice(start, end + 1));
    }
  }
  // 3) Фолбэк: весь текст как биография.
  if (!parsed || (!parsed.bio && !parsed.appearance)) {
    return { bio: raw.trim(), appearance: "" };
  }
  return parsed;
}

/**
 * Генерирует SEO-биографию и описание внешности персонажа через AI-сервис
 * (one-shot /ai/text/completion, без чат-постамбулы). Текст всегда на английском.
 *
 * @param name — имя персонажа
 * @param personality — JSON-поле personality из БД
 * @returns { bio, appearance }
 * @throws Error если AI-сервис недоступен или вернул пустой ответ
 */
export async function generateSeoBio(
  name: string,
  personality: Record<string, unknown>,
): Promise<SeoBio> {
  const factSheet = buildFactSheet(name, personality);
  const userPrompt =
    `Write the SEO profile copy for this AI companion based on these facts:\n\n${factSheet}\n\n` +
    `Return ONLY the JSON object {"bio": "...", "appearance": "..."}.`;

  const res = await fetch(`${AI_BASE}/ai/text/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM_PROMPT, prompt: userPrompt, maxTokens: 4096 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "AI service unavailable" }));
    throw new Error((err as { error?: string }).error || `AI service error ${res.status}`);
  }

  const data = (await res.json()) as { content?: string };
  const content = (data.content || "").trim();
  if (!content) throw new Error("Empty response from AI model");

  return parseSeoJson(content);
}
