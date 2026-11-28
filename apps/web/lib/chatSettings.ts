/**
 * Настройки персонажа под конкретный чат (PUT /chats/:id/settings).
 * Меняют персонажа только в чате этого пользователя; карточка персонажа
 * остаётся прежней. Списки значений — копия apps/api/src/chats/chat-settings.ts
 * (web не зависит от api): меняйте синхронно. Подписи — i18n-ключи cs.*.
 */
import type { TKey } from "./i18n";
import { apiFetch } from "./api";

export const CHAT_ARCHETYPES = [
  "caring", "wise", "modest", "joker", "seductress", "dominant",
  "submissive", "romantic", "passionate", "brat", "listener", "adventurer",
] as const;
export const CHAT_RELATIONSHIPS = [
  "stranger", "new_acquaintance", "friend", "girlfriend", "wife",
  "ex", "neighbor", "coworker", "boss", "fan",
] as const;
export const MEETING_SCENARIOS = ["cafe", "dating_app", "vacation", "neighbors", "office"] as const;
export const CHAT_OCCUPATIONS = [
  "artist", "nurse", "chef", "photographer", "model", "programmer", "designer", "fitness_trainer",
  "doctor", "lawyer", "bartender", "writer", "musician", "flight_attendant", "barista", "entrepreneur",
] as const;
export const CHAT_HOBBIES = [
  "sports", "books", "dancing", "cooking", "gaming", "travel", "music", "art",
  "movies", "fitness", "photography", "yoga",
] as const;
export const CHAT_LIKES = [
  "romance", "compliments", "kissing", "cuddling", "teasing", "massage", "lingerie",
  "dirty_talk", "roleplay", "slow_burn", "taking_lead", "being_led",
] as const;
export const MESSAGE_LENGTHS = ["short", "medium", "long"] as const;
export const EMOJI_LEVELS = ["none", "sometimes", "many"] as const;
export const SWEARING_LEVELS = ["none", "sometimes"] as const;
export const JEALOUSY_LEVELS = ["none", "slight"] as const;
export const VOICE_MODES = ["never", "on_request", "sometimes", "always"] as const;
export const CONTENT_LEVELS = ["flirt", "nsfw"] as const;
export const SLIDER_KEYS = ["boldness", "edge", "talkativeness", "humor"] as const;

export const LIMITS = {
  backstory: 2000, meetingCustom: 300, occupation: 60, hobby: 40, hobbies: 10,
  petName: 40, boundary: 120, boundaries: 10, backstoryIdea: 300,
} as const;

export interface ChatSettings {
  backstory?: string;
  meetingScenario?: string;
  meetingCustom?: string;
  occupation?: string;
  hobbies?: string[];
  archetype?: (typeof CHAT_ARCHETYPES)[number];
  relationship?: (typeof CHAT_RELATIONSHIPS)[number];
  sliders?: Partial<Record<(typeof SLIDER_KEYS)[number], number>> & { jealousy?: (typeof JEALOUSY_LEVELS)[number] };
  style?: {
    length?: (typeof MESSAGE_LENGTHS)[number];
    emoji?: (typeof EMOJI_LEVELS)[number];
    petName?: string;
    swearing?: (typeof SWEARING_LEVELS)[number];
  };
  voiceId?: string;
  voiceMode?: (typeof VOICE_MODES)[number];
  level?: (typeof CONTENT_LEVELS)[number];
  likes?: string[];
  boundaries?: string[];
}

/** i18n-ключ подписи значения из списка; для своего слова — null. */
export function optionKey(group: string, value: string): TKey | null {
  const lists: Record<string, readonly string[]> = {
    archetype: CHAT_ARCHETYPES, relationship: CHAT_RELATIONSHIPS, scenario: MEETING_SCENARIOS,
    occupation: CHAT_OCCUPATIONS, hobby: CHAT_HOBBIES, like: CHAT_LIKES,
  };
  return lists[group]?.includes(value) ? (`cs.${group}.${value}` as TKey) : null;
}

/** Подпись значения: перевод из списка или само значение (своё слово). */
export function optionLabel(t: (k: TKey) => string, group: string, value: string): string {
  const key = optionKey(group, value);
  return key ? t(key) : value;
}

export const chatSettingsApi = {
  get(chatId: string): Promise<ChatSettings> {
    return apiFetch<ChatSettings>(`/chats/${chatId}/settings`);
  },
  save(chatId: string, settings: ChatSettings): Promise<ChatSettings> {
    return apiFetch<ChatSettings>(`/chats/${chatId}/settings`, { method: "PUT", body: JSON.stringify(settings) });
  },
  reset(chatId: string): Promise<void> {
    return apiFetch(`/chats/${chatId}/settings`, { method: "DELETE" });
  },
  assistBackstory(chatId: string, idea: string, lang: string): Promise<{ backstory: string }> {
    return apiFetch(`/chats/${chatId}/settings/backstory-assist`, { method: "POST", body: JSON.stringify({ idea, lang }) });
  },
  /** Образец голоса (аудио) на языке пользователя → object URL для <audio>. */
  async voiceSample(voiceId: string, lang: string): Promise<string> {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const res = await fetch(`/api-proxy/chats/voice-sample?voiceId=${encodeURIComponent(voiceId)}&lang=${lang}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`voice sample ${res.status}`);
    return URL.createObjectURL(await res.blob());
  },
};
