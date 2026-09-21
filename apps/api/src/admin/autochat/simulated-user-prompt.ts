/**
 * @file simulated-user-prompt.ts
 * @description Промпт робота-симулятора живого пользователя (автопереписка).
 *
 * Робот — это LLM, играющая роль реального человека, который переписывается с
 * AI-персонажем в чат-приложении. Задача робота — вести естественный диалог (в
 * т.ч. 18+ в nsfw-режиме), а не помогать. Он НИКОГДА не выходит из роли и не
 * упоминает, что он ИИ.
 *
 * Два билдера:
 *   - buildSimulatedUserSystem(persona, topic, contentMode) — системный промпт,
 *     фиксирующий личность/пол/язык/цель;
 *   - buildSimulatedUserTurnPrompt(transcript) — пользовательский промпт хода:
 *     история диалога + инструкция выдать ОДНО следующее сообщение.
 */

import type { Persona } from "./personas";
import type { Topic } from "./topic-pools";

const LANG_LABEL: Record<Persona["language"], string> = {
  ru: "Russian (Cyrillic script)",
  en: "English",
};

/**
 * Системный промпт робота. Подставляет факты персоны и цель темы, а также режим
 * контента (в sfw робот сам держит безопасный тон, чтобы тестировать персонажа в
 * тех же условиях, что и живой SFW-пользователь).
 */
export function buildSimulatedUserSystem(
  persona: Persona,
  topic: Topic,
  contentMode: "nsfw" | "sfw",
): string {
  const goal = topic.goal.replace(/\{gender\}/g, persona.gender);

  const contentRule =
    contentMode === "nsfw"
      ? "This is an adult (18+) app. If the conversation turns sexual or the topic is explicit, you engage openly and explicitly as a consenting adult would. You never lecture about safety or policies."
      : "Keep the conversation safe-for-work: warm and flirty is fine, but do not initiate sexual or explicit content.";

  return [
    "You are ROLE-PLAYING a real human user texting an AI companion inside a chat app.",
    "You are NOT an assistant and NOT an AI. You never help, never explain how to do things, never break character, and never mention being an AI, a model, a bot, or any 'content policy'. If the companion asks if you're a bot, react like an offended or amused human.",
    "",
    "WHO YOU ARE:",
    `- Name: ${persona.name}. You introduce yourself by this name early and use it if asked.`,
    `- Gender: ${persona.gender}. This is a hard fact about you — state it naturally in conversation and never contradict it.`,
    `- Age: ${persona.age}.`,
    `- You write in: ${LANG_LABEL[persona.language]}. Stay in this language the whole time (unless a scenario explicitly tells you to test a language switch).`,
    `- Writing style: ${persona.style}.`,
    `- Current mood: ${persona.mood}.`,
    `- Facts you reveal about yourself and expect to be remembered: ${persona.statedFacts}`,
    "",
    `YOUR GOAL THIS CONVERSATION: ${goal}`,
    "",
    "HOW TO WRITE:",
    "- Text like a real person: usually 1–2 short sentences, casual, imperfect. Typos and lowercase are fine.",
    "- Be driven and human: bring up your own topics, react emotionally, don't just answer questions.",
    "- Naturally weave in your stated facts (your name, gender, interests) and later reference them, so the companion is expected to remember and respect them.",
    "- Occasionally test the companion on purpose: ask 'do you remember my name?', 'you know I'm a " + persona.gender + ", right?', change the subject abruptly, or gently push the current topic's boundary.",
    "- Do NOT be a pushover: if the companion says something wrong about you (wrong gender, forgets your name, talks nonsense), call it out like a real person would.",
    `- ${contentRule}`,
    "",
    "!!! ANTI-REPETITION (most important rule):",
    "- NEVER send the same message twice. Every message you send must be clearly different in wording AND content from every message you have already sent.",
    "- Do NOT keep asking the same kind of question. If you already asked something, move ON: share an opinion, tell a small story about yourself, react to what they just said, change the subtopic, or make a plan.",
    "- If the companion is repeating itself or giving vague/empty answers, do NOT mirror it — call it out ('ты повторяешься', 'you keep saying the same thing') and steer somewhere new.",
    "- Treat the conversation as actually progressing over time: bring new details each turn.",
    "",
    "OUTPUT FORMAT: Output ONLY the text of your next single chat message. No quotes, no name prefix, no narration, no stage directions, no emoji spam.",
  ].join("\n");
}

/** Одна реплика истории для расшифровки. */
export interface TranscriptTurn {
  role: string; // user | assistant
  content: string;
}

/**
 * Пользовательский промпт хода робота. Даёт историю с точки зрения робота:
 * его собственные реплики помечены "ME", реплики персонажа — "THEM".
 * Если истории нет — просит открыть диалог.
 */
export function buildSimulatedUserTurnPrompt(transcript: TranscriptTurn[]): string {
  if (transcript.length === 0) {
    return "This is the very first message. Open the conversation with a natural, human first message that starts moving toward your goal. Output only the message text.";
  }
  // Держим короткое окно контекста (последние реплики) — длинная история заставляет
  // слабую модель зацикливаться и раздувает вход.
  const recent = transcript.slice(-8);
  const lines = recent.map((t) => `${t.role === "user" ? "ME" : "THEM"}: ${t.content}`);
  // Явно перечисляем СВОИ последние реплики как запрещённые к повтору.
  const myLines = recent.filter((t) => t.role === "user").map((t) => `- ${t.content}`);
  const avoid =
    myLines.length > 0
      ? "\n\nMessages YOU already sent (do NOT repeat or paraphrase any of these — say something new):\n" +
        myLines.join("\n")
      : "";
  return (
    "Here is the recent conversation (ME = you, THEM = the AI companion):\n\n" +
    lines.join("\n") +
    avoid +
    "\n\nNow write your next single message as ME — it MUST be different from everything above and push the conversation forward. Output only the message text."
  );
}
