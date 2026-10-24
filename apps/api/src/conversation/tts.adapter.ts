/**
 * @file tts.adapter.ts
 * @description Адаптер синтеза речи: POST /ai/tts (ElevenLabs в AI-сервисе).
 *
 * AI-сервис либо загружает mp3 в S3 и возвращает JSON { url, key }, либо
 * (S3 не настроен) отдаёт аудио бинарно. Адаптер нормализует оба варианта.
 */

import { Injectable } from "@nestjs/common";
import { AI_BASE } from "./ai-client";

/** Значение модели по умолчанию (если AI-сервис её не вернул). */
const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";

/** Результат синтеза. */
export type TtsResult =
  | { kind: "s3"; key: string; url: string; characters: number; model: string }
  | { kind: "binary"; buffer: Buffer; characters: number; model: string };

/** AI-сервис вернул ошибку синтеза; тело — сырой текст ответа (для диагностики). */
export class TtsError extends Error {
  constructor(
    readonly status: number,
    readonly rawBody: string,
  ) {
    super(`TTS failed: ${status}`);
    this.name = "TtsError";
  }
}

@Injectable()
export class TtsAdapter {
  /**
   * Синтезирует речь для текста.
   *
   * @param text    — текст для озвучки
   * @param voiceId — голос ElevenLabs (по умолчанию — голос из настроек AI-сервиса)
   * @throws TtsError — если AI-сервис ответил ошибкой
   */
  async synthesize(text: string, voiceId?: string): Promise<TtsResult> {
    const res = await fetch(`${AI_BASE}/ai/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!res.ok) {
      throw new TtsError(res.status || 502, await res.text().catch(() => ""));
    }

    if ((res.headers.get("content-type") || "").includes("application/json")) {
      const data = (await res.json()) as { url: string; key: string; characters?: number; model?: string };
      return {
        kind: "s3",
        key: data.key,
        url: data.url,
        // Единицы тарификации: символы из ответа AI-сервиса или длина текста.
        characters: data.characters ?? text.length,
        model: data.model || DEFAULT_TTS_MODEL,
      };
    }

    // Бинарный fallback: символы/модель приходят заголовками (тело — аудио).
    return {
      kind: "binary",
      buffer: Buffer.from(await res.arrayBuffer()),
      characters: Number(res.headers.get("x-tts-characters")) || text.length,
      model: res.headers.get("x-tts-model") || DEFAULT_TTS_MODEL,
    };
  }
}
