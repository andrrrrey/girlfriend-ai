import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

const env = loadEnv();
const logger = createLogger({ service: "worker", env: env.ENV, level: env.LOG_LEVEL });

const QUEUE_NAME = "ai-jobs";
const API_BASE = `http://localhost:${env.API_PORT}`;

const JOB_NAMES = {
  CHAT: "ai:chat",
  STT: "ai:stt",
  TTS: "ai:tts",
} as const;

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE_NAME, { connection });

// ─── DB helpers (call back into API internal endpoints) ───────

async function updateJobStatus(
  jobId: string,
  status: "processing" | "completed" | "failed",
  data?: { output?: unknown; tokensUsed?: number; error?: string },
) {
  try {
    await fetch(`${API_BASE}/internal/ai-jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...data }),
    });
  } catch (err) {
    logger.error({ err, jobId }, "failed_to_update_job_status");
  }
}

async function logUsage(userId: string, action: string, tokensUsed?: number) {
  try {
    await fetch(`${API_BASE}/internal/usage-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, tokensUsed }),
    });
  } catch (err) {
    logger.error({ err, userId, action }, "failed_to_log_usage");
  }
}

// ─── Job Handlers ─────────────────────────────────────────────

async function handleChatJob(job: Job): Promise<void> {
  const { jobId, userId, chatSessionId, characterId, messages } = job.data;
  logger.info({ jobId, userId, chatSessionId }, "chat_job_started");

  await updateJobStatus(jobId, "processing");

  const response = await fetch(`http://localhost:${env.AI_PORT}/ai/chat/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, characterId }),
  });

  if (!response.ok) {
    throw new Error(`AI service returned ${response.status}`);
  }

  // Collect streaming response
  let fullContent = "";
  let tokensUsed = 0;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.content) fullContent += parsed.content;
          if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  await updateJobStatus(jobId, "completed", {
    output: { content: fullContent },
    tokensUsed,
  });

  await logUsage(userId, "chat_message", tokensUsed);
  logger.info({ jobId, tokensUsed, contentLength: fullContent.length }, "chat_job_done");
}

async function handleSttJob(job: Job): Promise<void> {
  const { jobId, userId, audioBase64, mimeType, filename } = job.data;
  logger.info({ jobId, userId }, "stt_job_started");

  await updateJobStatus(jobId, "processing");

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("audio", new Blob([audioBuffer], { type: mimeType }), filename || "audio.webm");

  const response = await fetch(`http://localhost:${env.AI_PORT}/ai/stt`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`STT service returned ${response.status}`);
  }

  const { text } = (await response.json()) as { text: string };

  await updateJobStatus(jobId, "completed", { output: { text } });
  await logUsage(userId, "stt");
  logger.info({ jobId }, "stt_job_done");
}

async function handleTtsJob(job: Job): Promise<void> {
  const { jobId, userId, text, voiceId } = job.data;
  logger.info({ jobId, userId }, "tts_job_started");

  await updateJobStatus(jobId, "processing");

  const response = await fetch(`http://localhost:${env.AI_PORT}/ai/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });

  if (!response.ok) {
    throw new Error(`TTS service returned ${response.status}`);
  }

  const result = await response.json() as { url?: string; key?: string };

  await updateJobStatus(jobId, "completed", { output: result });
  await logUsage(userId, "tts");
  logger.info({ jobId, url: result.url }, "tts_job_done");
}

// ─── Worker ───────────────────────────────────────────────────

new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    logger.info({ job_id: job.id, name: job.name }, "job_started");

    switch (job.name) {
      case JOB_NAMES.CHAT:
        await handleChatJob(job);
        break;
      case JOB_NAMES.STT:
        await handleSttJob(job);
        break;
      case JOB_NAMES.TTS:
        await handleTtsJob(job);
        break;
      default:
        logger.warn({ name: job.name }, "unknown_job_type");
    }

    logger.info({ job_id: job.id }, "job_done");
    return { ok: true };
  },
  {
    connection,
    // Retry strategy: 3 attempts with exponential backoff
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000, // 2s, 4s, 8s
      },
    },
  },
).on("failed", async (job, err) => {
  if (!job) return;
  logger.error({ job_id: job.id, name: job.name, err: err.message }, "job_failed");

  const jobId = job.data?.jobId;
  if (jobId) {
    await updateJobStatus(jobId, "failed", { error: err.message });
  }
});

// ─── Heartbeat ────────────────────────────────────────────────

setInterval(async () => {
  const counts = await queue.getJobCounts();
  logger.info({ queue: QUEUE_NAME, counts }, "worker_heartbeat");
}, 5000);
