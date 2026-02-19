import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId } from "@repo/logger";
import type { HealthResponse } from "@repo/types";
import OpenAI from "openai";
import { File } from "buffer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const env = loadEnv();
const logger = createLogger({ service: "ai", env: env.ENV, level: env.LOG_LEVEL });

const API_BASE = `http://localhost:${env.API_PORT}`;

const app = Fastify({ logger: false });
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Rate Limiting ────────────────────────────────────────────
// 60 requests per minute per IP for all AI endpoints
app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (req) => {
    return (req.headers["x-forwarded-for"] as string) || req.ip;
  },
  errorResponseBuilder: (_req, context) => ({
    error: "RATE_LIMIT_EXCEEDED",
    message: `Слишком много запросов. Подождите ${context.after} перед следующим запросом.`,
    retryAfter: context.after,
  }),
});

app.addHook("onRequest", async (req, reply) => {
  const requestId = getRequestId(req.raw, env.REQUEST_ID_HEADER);
  (req as any).requestId = requestId;
  reply.header(env.REQUEST_ID_HEADER, requestId);
});

// ─── S3 Client ────────────────────────────────────────────────

function createS3Client(): S3Client | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true, // required for MinIO
  });
}

async function uploadToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  // Return public URL (MinIO path-style)
  const endpoint = env.S3_ENDPOINT!.replace(/\/$/, "");
  return `${endpoint}/${bucket}/${key}`;
}

// ─── Helpers ─────────────────────────────────────────────────

async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/internal/settings`);
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
  return res.json();
}

async function fetchCharacter(id: string) {
  const res = await fetch(`${API_BASE}/internal/characters/${id}`);
  if (!res.ok) return null;
  return res.json();
}

function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

// ─── Routes ──────────────────────────────────────────────────

app.get("/health", async (): Promise<HealthResponse> => ({ ok: true, service: "ai" }));

interface ChatCompletionBody {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  characterId?: string;
  systemPrompt?: string;
}

app.post<{ Body: ChatCompletionBody }>("/ai/chat/completion", async (req, reply) => {
  const { messages, characterId, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return reply.status(400).send({ error: "messages array is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "OpenAI API key not configured" });
  }

  const model = settings.OPENAI_MODEL || "gpt-4o";

  // Build system prompt from character or direct
  let finalSystemPrompt = systemPrompt || "";
  if (characterId && !finalSystemPrompt) {
    try {
      const character = await fetchCharacter(characterId);
      if (character) {
        finalSystemPrompt = character.systemPrompt;
      }
    } catch (err) {
      logger.warn({ err, characterId }, "failed_to_fetch_character");
    }
  }

  const allMessages: OpenAI.ChatCompletionMessageParam[] = [];
  if (finalSystemPrompt) {
    allMessages.push({ role: "system", content: finalSystemPrompt });
  }
  allMessages.push(
    ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),
  );

  const openai = createOpenAIClient(apiKey);

  // Support abort via client disconnect
  const abortController = new AbortController();
  req.raw.on("close", () => {
    if (!req.raw.complete) {
      abortController.abort();
    }
  });

  try {
    const stream = await openai.chat.completions.create(
      {
        model,
        messages: allMessages,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: abortController.signal },
    );

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let tokensUsed = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }

      // Capture usage from final chunk
      if (chunk.usage) {
        tokensUsed = chunk.usage.total_tokens;
        reply.raw.write(
          `data: ${JSON.stringify({
            done: true,
            finishReason: chunk.choices?.[0]?.finish_reason,
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          })}\n\n`,
        );
      } else {
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== "stop") {
          reply.raw.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
        }
      }
    }

    logger.info({ model, tokensUsed }, "chat_completion_done");
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  } catch (err: any) {
    if (err.name === "AbortError" || abortController.signal.aborted) {
      logger.info({ characterId }, "chat_completion_aborted");
      if (!reply.raw.headersSent) {
        return reply.status(499).send({ error: "Request aborted by client" });
      }
      reply.raw.end();
      return;
    }
    logger.error({ err }, "openai_error");
    if (!reply.raw.headersSent) {
      return reply.status(502).send({ error: "AI service error", details: err.message });
    }
    reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    reply.raw.end();
  }
});

// ─── STT (Speech-to-Text via OpenAI Whisper) ─────────────────

app.post("/ai/stt", async (req, reply) => {
  const file = await req.file();
  if (!file) {
    return reply.status(400).send({ error: "Audio file is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_stt");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "OpenAI API key not configured" });
  }

  const model = settings.OPENAI_STT_MODEL || "whisper-1";
  const openai = createOpenAIClient(apiKey);

  try {
    const buffer = await file.toBuffer();
    const audioFile = new File([buffer], file.filename || "audio.webm", {
      type: file.mimetype || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model,
    });

    logger.info({ model, length: buffer.length }, "stt_done");
    return { text: transcription.text };
  } catch (err: any) {
    logger.error({ err }, "stt_error");
    return reply.status(502).send({ error: "STT failed", details: err.message });
  }
});

// ─── TTS (Text-to-Speech via ElevenLabs → S3) ────────────────

interface TTSBody {
  text: string;
  voiceId?: string;
}

app.post<{ Body: TTSBody }>("/ai/tts", async (req, reply) => {
  const { text, voiceId } = req.body;

  if (!text) {
    return reply.status(400).send({ error: "text is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_tts");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "ElevenLabs API key not configured" });
  }

  const voice = voiceId || settings.ELEVENLABS_DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const modelId = settings.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "elevenlabs_error");
      return reply.status(502).send({ error: "ElevenLabs TTS failed" });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Try to upload to S3/MinIO and return URL
    const s3 = createS3Client();
    const bucket = env.S3_BUCKET || "media";

    if (s3) {
      const key = `tts/${randomUUID()}.mp3`;
      try {
        const url = await uploadToS3(s3, bucket, key, audioBuffer, "audio/mpeg");
        logger.info({ key, voice }, "tts_uploaded_to_s3");
        return reply.send({ url, key });
      } catch (s3Err: any) {
        logger.warn({ err: s3Err }, "tts_s3_upload_failed_falling_back_to_binary");
        // Fall back to binary response if S3 fails
      }
    }

    // Fallback: return binary if S3 not configured or upload failed
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Content-Length", audioBuffer.length);
    return reply.send(audioBuffer);
  } catch (err: any) {
    logger.error({ err }, "tts_error");
    return reply.status(502).send({ error: "TTS failed", details: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────

app.listen({ port: env.AI_PORT, host: "0.0.0.0" })
  .then(() => logger.info({ port: env.AI_PORT }, "ai_started"))
  .catch((err) => {
    logger.error({ err }, "ai_failed_to_start");
    process.exit(1);
  });
