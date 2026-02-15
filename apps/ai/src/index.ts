import Fastify from "fastify";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId } from "@repo/logger";
import type { HealthResponse } from "@repo/types";
import OpenAI from "openai";

const env = loadEnv();
const logger = createLogger({ service: "ai", env: env.ENV, level: env.LOG_LEVEL });

const API_BASE = `http://localhost:${env.API_PORT}`;

const app = Fastify({ logger: false });

app.addHook("onRequest", async (req, reply) => {
  const requestId = getRequestId(req.raw, env.REQUEST_ID_HEADER);
  (req as any).requestId = requestId;
  reply.header(env.REQUEST_ID_HEADER, requestId);
});

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

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: allMessages,
      stream: true,
    });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }

      const finishReason = chunk.choices?.[0]?.finish_reason;
      if (finishReason) {
        reply.raw.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
      }
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  } catch (err: any) {
    logger.error({ err }, "openai_error");
    if (!reply.raw.headersSent) {
      return reply.status(502).send({ error: "AI service error", details: err.message });
    }
    reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    reply.raw.end();
  }
});

// ─── Start ───────────────────────────────────────────────────

app.listen({ port: env.AI_PORT, host: "0.0.0.0" })
  .then(() => logger.info({ port: env.AI_PORT }, "ai_started"))
  .catch((err) => {
    logger.error({ err }, "ai_failed_to_start");
    process.exit(1);
  });
