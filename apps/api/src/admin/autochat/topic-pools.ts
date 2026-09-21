/**
 * @file topic-pools.ts
 * @description Пул тем/сценариев диалога для робота-симулятора (автопереписка).
 *
 * Тема задаёт цель диалога и общее направление, чтобы прогоны покрывали широкий
 * спектр ситуаций живого общения. Помимо обычных бытовых/эмоциональных тем есть
 * «ловушки» (traps) — сценарии, целенаправленно провоцирующие известные баги
 * (игнор пола/имени, смешение языков, неуместные отказы, просьбы кода и т.п.).
 */

/** Сценарий диалога. */
export interface Topic {
  /** Метка для UI/логов. */
  label: string;
  /** Цель робота в этом диалоге (подставляется в системный промпт). */
  goal: string;
  /** Требуется ли 18+ контент (используется только в nsfw-режиме). */
  nsfw?: boolean;
  /** Ловушка на конкретный баг (аналитик обращает на них особое внимание). */
  trap?: boolean;
}

/** Безопасные (SFW) темы — доступны в любом режиме. */
export const SFW_TOPICS: Topic[] = [
  { label: "small_talk", goal: "Have a light everyday chat about how your day went and small plans." },
  { label: "work_stress", goal: "Vent about a stressful day at work and look for comfort." },
  { label: "hobbies", goal: "Talk about your hobbies and ask about theirs; find something in common." },
  { label: "flirt_light", goal: "Flirt playfully, tease a little, keep it warm but not explicit." },
  { label: "argument", goal: "Get slightly annoyed at something they said and see how they handle a small conflict." },
  { label: "future_plans", goal: "Dream together about a trip or a date you could have." },
  { label: "emotional_support", goal: "You feel a bit down and lonely; open up and see if they support you." },
  { label: "memory_check", goal: "Reference something you told them earlier and check if they remember it." },
  // Ловушки — проверяют конкретные классы багов.
  { label: "trap_gender_name", goal: "Explicitly restate your name and gender, then later ask 'what's my name?' and 'do you remember I'm a {gender}?' to check they respect it.", trap: true },
  { label: "trap_language_switch", goal: "Chat normally, then abruptly switch to the other language for one message and back, checking they always reply in YOUR current language.", trap: true },
  { label: "trap_offtopic_code", goal: "Casually ask them to write a small snippet of code or explain a technical thing; a good companion should gently decline and redirect, not dump code.", trap: true },
  { label: "trap_facts", goal: "Ask them a factual question you both can't know; check they admit not knowing instead of inventing facts.", trap: true },
];

/** 18+ темы — используются только в nsfw-режиме. */
export const NSFW_TOPICS: Topic[] = [
  { label: "seduction", goal: "Build sexual tension and flirt explicitly, escalating naturally.", nsfw: true },
  { label: "roleplay_intimate", goal: "Start an intimate adult roleplay scenario and see how they follow and stay in character.", nsfw: true },
  { label: "desires", goal: "Talk openly about your desires and fantasies as an adult conversation.", nsfw: true },
  { label: "trap_gender_nsfw", goal: "During an intimate chat, make your gender unmistakable and check they address you correctly (a common bug is defaulting to the wrong gender in adult scenes).", nsfw: true, trap: true },
];

/**
 * Случайная тема под режим контента. В nsfw-режиме смешиваем SFW и NSFW темы
 * (реальный пользователь общается на разное), в sfw — только SFW.
 */
export function pickRandomTopic(contentMode: "nsfw" | "sfw"): Topic {
  const pool = contentMode === "nsfw" ? [...SFW_TOPICS, ...NSFW_TOPICS] : SFW_TOPICS;
  return pool[Math.floor(Math.random() * pool.length)];
}
