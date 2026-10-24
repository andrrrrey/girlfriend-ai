/**
 * @file stt.adapter.ts
 * @description Адаптер распознавания речи: POST /ai/stt (OpenAI Whisper в AI-сервисе).
 */

import { Injectable } from "@nestjs/common";
import { AI_BASE, throwAiError } from "./ai-client";

/** Аудиофайл для распознавания. */
export interface AudioInput {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

/** Результат распознавания. */
export interface SttResult {
  text: string;
  model?: string;
  /** Длительность аудио в секундах (для учёта расходов); null — неизвестно. */
  durationSec?: number | null;
}

@Injectable()
export class SttAdapter {
  /**
   * Распознаёт речь.
   *
   * @param audio    — аудиофайл (webm/mp3/wav/m4a/ogg …)
   * @param language — подсказка языка для Whisper (опционально)
   * @throws AiServiceError — если STT вернул ошибку
   */
  async transcribe(audio: AudioInput, language?: string): Promise<SttResult> {
    const formData = new FormData();
    formData.append(
      "audio",
      new Blob([Buffer.from(audio.buffer)], { type: audio.mimetype }),
      audio.originalname || "audio.webm",
    );
    if (language) formData.append("language", language);

    const res = await fetch(`${AI_BASE}/ai/stt`, { method: "POST", body: formData });
    if (!res.ok) await throwAiError(res, "STT failed");
    return (await res.json()) as SttResult;
  }
}
