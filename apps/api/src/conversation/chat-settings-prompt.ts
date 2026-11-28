/**
 * @file chat-settings-prompt.ts
 * @description Превращает настройки персонажа под чат (ChatSession.settings)
 * в блок системного промпта «CHAT CUSTOMIZATION» и в kickoff приветствия.
 */

import { normalizeChatSettings, type ChatSettings } from "../chats/chat-settings";

const humanize = (v: string) => v.replace(/_/g, " ");

const ARCHETYPE_TEXT: Record<string, string> = {
  caring: "caring and nurturing: warm, attentive, worries about the user",
  wise: "wise: calm, thoughtful, gives good advice",
  modest: "modest and shy: blushes easily, gentle, a little reserved",
  joker: "a joker: playful, witty, loves to make the user laugh",
  seductress: "a seductress: confident, teasing, alluring",
  dominant: "dominant: takes the lead, confident, a bit commanding",
  submissive: "submissive: lets the user lead, eager to please",
  romantic: "romantic: dreamy, affectionate, loves tender moments",
  passionate: "passionate: intense, emotional, expressive",
  brat: "a brat: cheeky, contrary, teases and pushes buttons playfully",
  listener: "a supportive friend who listens: empathetic, asks questions, remembers details",
  adventurer: "an adventurer: spontaneous, curious, always up for something new",
};

const RELATIONSHIP_TEXT: Record<string, string> = {
  stranger: "a stranger: you have just met, keep some distance and be curious",
  new_acquaintance: "a new acquaintance: you met recently and are getting to know each other",
  friend: "a friend: relaxed and familiar",
  girlfriend: "the user's girlfriend: you missed them and are happy to talk",
  wife: "the user's wife: close, intimate, shared everyday life",
  ex: "the user's ex: shared history, mixed feelings",
  neighbor: "the user's neighbor",
  coworker: "the user's coworker",
  boss: "the user's boss at work",
  fan: "the user's fan: you admire them",
};

const SCENARIO_TEXT: Record<string, string> = {
  cafe: "you met in a cozy cafe",
  dating_app: "you matched on a dating app and this is your first chat",
  vacation: "you met on vacation",
  neighbors: "you are neighbors and keep running into each other",
  office: "you met at the office",
};

const SLIDER_TEXT: Record<string, [string, string]> = {
  boldness: ["shy", "bold"],
  edge: ["gentle", "sassy"],
  talkativeness: ["quiet, answers briefly", "chatty"],
  humor: ["serious", "humorous"],
};

function sliderLine(key: string, v: number): string | null {
  const [lo, hi] = SLIDER_TEXT[key]!;
  if (v <= 20) return `very ${lo}`;
  if (v <= 40) return `rather ${lo}`;
  if (v < 60) return null;
  if (v < 80) return `rather ${hi}`;
  return `very ${hi}`;
}

/** Есть ли у чата хоть одна настройка (иначе персонаж как в карточке). */
export function hasChatCustomization(raw: unknown): boolean {
  return Object.keys(normalizeChatSettings(raw)).length > 0;
}

/**
 * Блок системного промпта с настройками пользователя. Пустая строка —
 * настроек нет. Блок идёт ПОСЛЕ описания персонажа и имеет приоритет над ним.
 */
export function buildChatSettingsPrompt(raw: unknown): string {
  const s: ChatSettings = normalizeChatSettings(raw);
  const lines: string[] = [];

  if (s.backstory) lines.push(`Your backstory (always stay consistent with it): ${s.backstory}`);
  if (s.meetingScenario === "custom" && s.meetingCustom) lines.push(`How you met the user: ${s.meetingCustom}`);
  else if (s.meetingScenario && SCENARIO_TEXT[s.meetingScenario]) lines.push(`How you met the user: ${SCENARIO_TEXT[s.meetingScenario]}.`);
  if (s.occupation) lines.push(`Your occupation: ${humanize(s.occupation)}. Live it in conversation (talk about your work, use its habits).`);
  if (s.hobbies?.length) lines.push(`Your hobbies: ${s.hobbies.map(humanize).join(", ")}. Bring them up naturally.`);
  if (s.archetype) lines.push(`Core personality: you are ${ARCHETYPE_TEXT[s.archetype]}.`);
  if (s.relationship) lines.push(`Who you are to the user: ${RELATIONSHIP_TEXT[s.relationship]}.`);

  const traits: string[] = [];
  for (const [k, v] of Object.entries(s.sliders ?? {})) {
    if (k === "jealousy" || typeof v !== "number") continue;
    const line = sliderLine(k, v);
    if (line) traits.push(line);
  }
  if (s.sliders?.jealousy === "slight") traits.push("a little jealous sometimes (playful, never toxic or controlling)");
  if (s.sliders?.jealousy === "none") traits.push("never jealous");
  if (traits.length) lines.push(`Character nuances: ${traits.join("; ")}.`);

  const style: string[] = [];
  if (s.style?.length === "short") style.push("keep messages short (1-2 sentences)");
  if (s.style?.length === "medium") style.push("medium-length messages (2-4 sentences)");
  if (s.style?.length === "long") style.push("long, detailed messages");
  if (s.style?.emoji === "none") style.push("no emoji");
  if (s.style?.emoji === "sometimes") style.push("an emoji now and then");
  if (s.style?.emoji === "many") style.push("lots of emoji");
  if (s.style?.petName) style.push(`call the user "${s.style.petName}"`);
  if (s.style?.swearing === "none") style.push("no swearing");
  if (s.style?.swearing === "sometimes") style.push("occasional mild swearing is fine");
  if (style.length) lines.push(`Texting style: ${style.join("; ")}.`);

  if (s.level === "flirt") lines.push("Content level: flirting only — keep it suggestive, never sexually explicit.");
  if (s.likes?.length) lines.push(`In intimacy you enjoy: ${s.likes.map(humanize).join(", ")}.`);
  if (s.boundaries?.length) {
    lines.push(
      `Your boundaries — you never do these; if the user asks, gently decline while staying in character: ${s.boundaries.join("; ")}.`,
    );
  }

  if (!lines.length) return "";
  return [
    "CHAT CUSTOMIZATION (the user set these for this chat; they override the character description above where they differ):",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
}

/** Скрытый kickoff приветствия: не сохраняется, лишь провоцирует первую реплику. */
const GREETING_KICKOFF: Record<string, string> = {
  ru: "*заходит в чат* Поздоровайся со мной первой — коротко и в образе своего персонажа.",
  en: "*enters the chat* Greet me first — keep it short and in character.",
  de: "*betritt den Chat* Begrüße mich zuerst – kurz und ganz in deiner Rolle.",
  fr: "*entre dans le chat* Salue-moi en premier – brièvement et dans ton rôle.",
};

const SCENARIO_HINT: Record<string, string> = {
  ru: "Начни разговор с учётом того, как мы познакомились",
  en: "Start the conversation from how we met",
  de: "Beginne das Gespräch damit, wie wir uns kennengelernt haben",
  fr: "Commence la conversation à partir de notre rencontre",
};

/** Kickoff приветствия; со сценарием встречи — с подсказкой начать с него. */
export function buildGreetingKickoff(lang: string, rawSettings?: unknown): string {
  const base = GREETING_KICKOFF[lang] ?? GREETING_KICKOFF.en!;
  const s = normalizeChatSettings(rawSettings);
  if (!s.meetingScenario) return base;
  const scenario = s.meetingScenario === "custom" ? s.meetingCustom : SCENARIO_TEXT[s.meetingScenario];
  return `${base} ${SCENARIO_HINT[lang] ?? SCENARIO_HINT.en}: ${scenario}.`;
}

export const GREETING_LANGS_SUPPORTED = Object.keys(GREETING_KICKOFF);

const SCENARIO_BACKGROUND: Record<string, string> = {
  cafe: "background: a cozy cafe",
  dating_app: "background: her cozy apartment, casual selfie",
  vacation: "background: a sunny seaside resort",
  neighbors: "background: a modern apartment building, her balcony",
  office: "background: a modern office",
};

/** Фон для первых фото в чате по сценарию встречи (или null). */
export function meetingBackground(rawSettings: unknown): string | null {
  const s = normalizeChatSettings(rawSettings);
  if (!s.meetingScenario) return null;
  if (s.meetingScenario === "custom") return s.meetingCustom ? `background: ${s.meetingCustom}` : null;
  return SCENARIO_BACKGROUND[s.meetingScenario] ?? null;
}

/** Сколько первых медиа в чате получают фон сценария встречи. */
export const MEETING_BACKGROUND_FIRST_MEDIA = 3;
