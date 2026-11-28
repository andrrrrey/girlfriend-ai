/**
 * @file chat-settings.service.ts
 * @description Настройки персонажа под чат (ChatSession.settings): чтение,
 * сохранение с проверкой на запрещённое (та же модерация, что у генерации),
 * сброс «Вернуть как было», помощь с предысторией, образец голоса.
 */

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../prisma.service";
import { ModerationService } from "../moderation/moderation.service";
import { ChatsService } from "./chats.service";
import {
  LIMITS,
  findForbiddenRelation,
  normalizeChatSettings,
  settingsFreeTexts,
  type ChatSettings,
} from "./chat-settings";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

export interface SettingsActor {
  id: string;
  contentMode?: string;
  isAdult?: boolean | null;
}

/** Фраза для образца голоса на языке пользователя. */
export const VOICE_SAMPLE_TEXT: Record<string, string> = {
  en: "Hi there! I've been waiting for you. How was your day?",
  ru: "Привет! А я тебя ждала. Как прошёл твой день?",
  de: "Hallo! Ich habe schon auf dich gewartet. Wie war dein Tag?",
  fr: "Coucou ! Je t'attendais. Comment s'est passée ta journée ?",
};

@Injectable()
export class ChatSettingsService {
  private readonly logger = new Logger(ChatSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chats: ChatsService,
    private readonly moderation: ModerationService,
  ) {}

  /** Текущие настройки чата ({} — персонаж как в карточке). */
  async get(chatId: string, userId: string): Promise<ChatSettings> {
    const chat = await this.chats.getChat(chatId, userId);
    return normalizeChatSettings(chat.settings);
  }

  /**
   * Сохраняет настройки целиком (заменяет прежние). Свободные тексты проходят
   * запрет на родственников/школу и общую модерацию генерации; 18+ доступен,
   * только если у пользователя включён NSFW.
   */
  async save(chatId: string, actor: SettingsActor, raw: unknown): Promise<ChatSettings> {
    await this.chats.getChat(chatId, actor.id);
    const settings = normalizeChatSettings(raw);

    const nsfwAllowed = actor.isAdult !== false && actor.contentMode !== "sfw";
    if (settings.level === "nsfw" && !nsfwAllowed) settings.level = "flirt";

    if (settings.voiceId) {
      const voice = await this.prisma.voice.findFirst({ where: { voiceId: settings.voiceId, isActive: true }, select: { id: true } });
      if (!voice) throw new BadRequestException({ error: "VOICE_NOT_FOUND", message: "Voice not found" });
    }

    await this.assertTextsAllowed(settingsFreeTexts(settings), actor);

    await this.prisma.chatSession.update({
      where: { id: chatId },
      data: { settings: settings as Prisma.InputJsonValue },
    });
    return settings;
  }

  /** «Вернуть как было»: персонаж снова как в карточке. */
  async reset(chatId: string, userId: string): Promise<void> {
    await this.chats.getChat(chatId, userId);
    await this.prisma.chatSession.update({ where: { id: chatId }, data: { settings: {} } });
  }

  /**
   * «Придумать за меня»: 1–2 фразы пользователя → предыстория до 2000 знаков.
   * И идея, и результат проходят модерацию. Ничего не сохраняет.
   */
  async assistBackstory(chatId: string, actor: SettingsActor, idea: string, lang: string): Promise<string> {
    const chat = await this.chats.getChat(chatId, actor.id);
    const clean = (idea ?? "").trim().slice(0, LIMITS.backstoryIdea);
    if (!clean) throw new BadRequestException({ error: "EMPTY_IDEA" });
    await this.assertTextsAllowed([clean], actor);

    const language = { ru: "Russian", de: "German", fr: "French" }[lang] ?? "English";
    const system =
      "You write a backstory for a fictional ADULT (18+) female character of an AI companion app. " +
      "Expand the user's idea into a vivid backstory written in the third person: where she is from, what she did, what happened to her before meeting the user. " +
      "No minors, no school settings, no family relationships with the user, no real people. Not sexually explicit. " +
      `Write in ${language}. 120-250 words. Return ONLY the backstory text.`;
    const prompt = `Character: ${chat.character.name}.\nCharacter description (for consistency):\n${chat.character.systemPrompt.slice(0, 3000)}\n\nUser's idea: ${clean}`;

    const res = await fetch(`${AI_BASE}/ai/text/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, prompt, maxTokens: 1024 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new BadRequestException({ error: "AI_UNAVAILABLE", message: "AI service unavailable" });
    const data = (await res.json()) as { content?: string };
    const story = (data.content ?? "").trim().replace(/^["«]|["»]$/g, "").slice(0, LIMITS.backstory);
    if (!story) throw new BadRequestException({ error: "AI_EMPTY" });
    await this.assertTextsAllowed([story], actor);
    return story;
  }

  private async assertTextsAllowed(texts: string[], actor: SettingsActor): Promise<void> {
    for (const t of texts) {
      const hit = findForbiddenRelation(t);
      if (hit) {
        this.logger.warn(`chat settings blocked: user=${actor.id} relation="${hit}"`);
        throw new BadRequestException({
          error: "PROMPT_FORBIDDEN",
          category: "forbidden_relation",
          match: hit,
          message: "Запрос нарушает правила сервиса",
        });
      }
    }
    if (!texts.length) return;
    await this.moderation.assertAllowed(texts, {
      contentMode: actor.isAdult === false || actor.contentMode === "sfw" ? "sfw" : "nsfw",
      userId: actor.id,
      kind: "chat_settings",
    });
  }
}
