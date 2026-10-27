/**
 * @file intent-router.ts
 * @description Роутер намерений: что хочет пользователь своим сообщением —
 * обычный ответ, фото, видео или нужно уточнить.
 *
 * 1. Быстрые правила: без «медийных» слов (фото, селфи, видео, photo, pic…)
 *    сообщение сразу идёт в обычный ответ — без лишнего вызова модели.
 * 2. Иначе — классификатор на LLM (/ai/text/completion) со строгим JSON-ответом,
 *    который проверяется по схеме; выбранные опции сопоставляются с каталогом
 *    (slug → название → синоним), неизвестные отбрасываются.
 * 3. Если модель недоступна или ответ невалиден — запасные правила (тип медиа по
 *    ключевым словам, опции по совпадению названий/синонимов в тексте).
 *
 * Один и тот же текст даёт одинаковую спецификацию для сайта, Telegram и
 * внутреннего API — все они вызывают route().
 */

import { Injectable, Logger } from "@nestjs/common";
import { AI_BASE } from "./ai-client";
import { PrismaService } from "../prisma.service";
import { OptionCatalogService } from "../generation/prompt/option-catalog.service";
import { resolveOption, type CatalogOption, type OptionCatalog } from "../generation/prompt/prompt-composer";
import { slugify } from "../generation/prompt/slug";
import type { GenerationSpec } from "../generation/prompt/generation-spec";

/** Выбранные опции медиа (канонические slug). */
export interface MediaSelections {
  outfits: string[];
  poses: string[];
  locations: string[];
  facialExpressions: string[];
  framing: string[];
}

export type ChatIntent =
  | { intent: "reply"; via: "rules" | "llm" }
  | { intent: "image" | "video"; selections: MediaSelections; extra?: string; via: "rules" | "llm" }
  | { intent: "clarify"; question: string; via: "llm" };

/** Слова, без которых сообщение точно не просьба о фото/видео. */
const MEDIA_HINT_RE =
  /(фот|фотк|селфи|снимок|снимк|картинк|изображен|покажи\s+себя|покажись|видео|видос|ролик|кружоч|photo|\bpics?\b|picture|selfie|\bimage\b|\bnudes?\b|video|\bclip\b|show\s+(me\s+)?yourself)/i;
const VIDEO_RE = /(видео|видос|ролик|кружоч|video|\bclip\b)/i;
/** Явные слова про фото/картинку. */
const IMAGE_RE = /(фот|селфи|снимок|снимк|картинк|изображен|photo|\bpics?\b|picture|selfie|\bimage\b|\bnudes?\b)/i;

/** Сколько опций каждой группы показываем классификатору (ограничение промпта). */
const MAX_OPTIONS_PER_GROUP = 80;
const CLASSIFIER_TIMEOUT_MS = 15_000;
/**
 * Настройка (админка → Настройки): модель OpenRouter для классификатора намерений.
 * Пусто — используется чат-провайдер из настроек (слабые чат-модели ошибаются чаще).
 */
const INTENT_MODEL_SETTING = "INTENT_MODEL";
const SETTING_CACHE_TTL_MS = 60_000;

type Group = keyof MediaSelections;

/** Группы опций, которые роутер умеет выбирать, и где они лежат в каталоге. */
function groupOptions(catalog: OptionCatalog): Record<Group, CatalogOption[]> {
  return {
    outfits: [...catalog.appearance.OUTFITS, ...catalog.appearance.OUTFIT_DETAILS],
    poses: catalog.pose.POSE,
    locations: catalog.scene.LOCATION,
    facialExpressions: catalog.pose.FACIAL_EXPRESSION,
    framing: catalog.camera.FRAMING,
  };
}

const GROUPS: Group[] = ["outfits", "poses", "locations", "facialExpressions", "framing"];

function emptySelections(): MediaSelections {
  return { outfits: [], poses: [], locations: [], facialExpressions: [], framing: [] };
}

/**
 * Тип медиа, названный в тексте явно: «картинку/фото» → image, «видео» → video.
 * null — названы оба или ни одного (решает классификатор).
 */
export function explicitMediaKind(text: string): "image" | "video" | null {
  const image = IMAGE_RE.test(text);
  const video = VIDEO_RE.test(text);
  if (image && !video) return "image";
  if (video && !image) return "video";
  return null;
}

/** Есть ли в тексте признаки просьбы о медиа (быстрая проверка без модели). */
export function hasMediaHint(text: string): boolean {
  return MEDIA_HINT_RE.test(text);
}

/**
 * Проверяет ответ классификатора по схеме и сопоставляет опции с каталогом.
 * @returns намерение или null, если ответ невалиден
 */
export function parseClassifierOutput(raw: string, catalog: OptionCatalog): ChatIntent | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const intent = data.intent;
  if (intent === "reply") return { intent: "reply", via: "llm" };
  if (intent === "clarify") {
    const question = typeof data.question === "string" ? data.question.trim().slice(0, 500) : "";
    return question ? { intent: "clarify", question, via: "llm" } : null;
  }
  if (intent !== "image" && intent !== "video") return null;

  const groups = groupOptions(catalog);
  const selections = emptySelections();
  for (const group of GROUPS) {
    const refs = data[group];
    if (refs === undefined || refs === null) continue;
    if (!Array.isArray(refs)) return null;
    for (const ref of refs.slice(0, 5)) {
      if (typeof ref !== "string") return null;
      const option = resolveOption(groups[group], ref);
      if (option && !selections[group].includes(option.slug)) selections[group].push(option.slug);
    }
  }
  const extra = typeof data.extra === "string" && data.extra.trim() ? data.extra.trim().slice(0, 300) : undefined;
  return { intent, selections, ...(extra ? { extra } : {}), via: "llm" };
}

/** Запасной разбор без модели: тип медиа по ключевым словам, опции по названиям в тексте. */
export function classifyByRules(text: string, catalog: OptionCatalog): ChatIntent {
  const haystack = `-${slugify(text)}-`;
  const groups = groupOptions(catalog);
  const selections = emptySelections();
  for (const group of GROUPS) {
    const match = groups[group].find((o) =>
      [o.name, ...o.synonyms].some((label) => {
        // Совпадение с начала слова: «купальник» находит «в купальнике» (падежи).
        const needle = slugify(label);
        return needle.length >= 4 && haystack.includes(`-${needle}`);
      }),
    );
    if (match) selections[group].push(match.slug);
  }
  return { intent: VIDEO_RE.test(text) ? "video" : "image", selections, via: "rules" };
}

/** Спецификация фото/видео персонажа в чате по выбранным опциям. */
export function selectionsToSpec(
  kind: "image" | "video",
  selections: MediaSelections,
  characterId: string,
  contentMode: "nsfw" | "sfw" | undefined,
  extra?: string,
): GenerationSpec {
  const spec: GenerationSpec = { kind, preset: "chat", characterId };
  if (contentMode) spec.contentMode = contentMode;
  if (selections.outfits.length) spec.appearance = { outfits: selections.outfits };
  if (selections.poses.length || selections.facialExpressions.length) {
    spec.pose = {
      ...(selections.facialExpressions.length ? { facialExpressions: selections.facialExpressions } : {}),
      ...(selections.poses.length ? { poses: selections.poses } : {}),
    };
  }
  if (selections.locations.length) spec.scene = { locations: selections.locations };
  if (selections.framing.length) spec.camera = { framing: selections.framing };
  if (extra) spec.userText = extra;
  return spec;
}

@Injectable()
export class IntentRouter {
  private readonly logger = new Logger(IntentRouter.name);

  private intentModel: { at: number; value: string | undefined } | null = null;

  constructor(
    private readonly catalog: OptionCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  /** Модель классификатора из настроек (кэш SETTING_CACHE_TTL_MS). */
  private async getIntentModel(): Promise<string | undefined> {
    if (this.intentModel && Date.now() - this.intentModel.at < SETTING_CACHE_TTL_MS) return this.intentModel.value;
    const row = await this.prisma.appSetting
      .findUnique({ where: { key: INTENT_MODEL_SETTING } })
      .catch(() => null);
    const value = row?.value?.trim() || undefined;
    this.intentModel = { at: Date.now(), value };
    return value;
  }

  /**
   * Определяет намерение сообщения пользователя.
   * @param contentMode — режим контента (в SFW NSFW-опции не предлагаются)
   */
  async route(text: string, contentMode?: "nsfw" | "sfw"): Promise<ChatIntent> {
    if (!hasMediaHint(text)) return { intent: "reply", via: "rules" };

    const catalog = await this.catalog.get(contentMode);
    try {
      const raw = await this.callClassifier(text, catalog);
      const parsed = parseClassifierOutput(raw, catalog);
      if (parsed) {
        // Явное слово в сообщении важнее мнения модели: «скинь картинку» — это фото,
        // даже если классификатор ответил video (так и случилось на «картинку в душе»).
        const kind = explicitMediaKind(text);
        if (kind && (parsed.intent === "image" || parsed.intent === "video") && parsed.intent !== kind) {
          return { ...parsed, intent: kind };
        }
        return parsed;
      }
      this.logger.warn("intent classifier returned invalid JSON, falling back to rules");
    } catch (err: any) {
      this.logger.warn(`intent classifier failed, falling back to rules: ${err?.message}`);
    }
    return classifyByRules(text, catalog);
  }

  /** Намерение и спецификация медиа для персонажа (общая точка для сайта, Telegram и internal API). */
  async routeToSpec(
    text: string,
    characterId: string,
    contentMode?: "nsfw" | "sfw",
  ): Promise<{ intent: ChatIntent; spec: GenerationSpec | null }> {
    const intent = await this.route(text, contentMode);
    if (intent.intent !== "image" && intent.intent !== "video") return { intent, spec: null };
    return { intent, spec: selectionsToSpec(intent.intent, intent.selections, characterId, contentMode, intent.extra) };
  }

  private async callClassifier(text: string, catalog: OptionCatalog): Promise<string> {
    const groups = groupOptions(catalog);
    const optionLines = GROUPS.map(
      (g) => `${g}: ${groups[g].slice(0, MAX_OPTIONS_PER_GROUP).map((o) => o.slug).join(", ") || "(none)"}`,
    ).join("\n");

    const system = [
      "You classify messages in a companion chat app. The user writes to an AI character.",
      "Decide whether the user asks the character to SEND a photo or a video of the character right now.",
      'Answer with ONLY a JSON object: {"intent":"reply"|"image"|"video"|"clarify","question":string|null,' +
        '"outfits":[],"poses":[],"locations":[],"facialExpressions":[],"framing":[],"extra":string|null}',
      '- "reply": ordinary conversation, including talking ABOUT photos without asking to send one.',
      '- "image" / "video": an explicit request to send a photo / video now. "image" = photo, picture, selfie, pic, nudes (фото, фотка, картинка, селфи); "video" ONLY when the user explicitly asks for a video or clip (видео, ролик, кружочек). Fill the arrays ONLY with ids from the lists below that match the request; leave arrays empty when nothing matches.',
      '- "clarify": a media request too ambiguous to fulfil; put ONE short question in the user\'s language into "question".',
      '- "extra": a short English description of requested details not covered by the lists, or null.',
      "Available ids:",
      optionLines,
    ].join("\n");

    const model = await this.getIntentModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
    try {
      const res = await fetch(`${AI_BASE}/ai/text/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system,
          prompt: text.slice(0, 2000),
          maxTokens: 300,
          temperature: 0,
          ...(model ? { model } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`classifier HTTP ${res.status}`);
      const data = (await res.json()) as { content?: string };
      return data.content ?? "";
    } finally {
      clearTimeout(timer);
    }
  }
}
