// Shared job type definitions used by both API (producer) and Worker (consumer)

export const QUEUE_NAME = "ai-jobs";

export const JOB_NAMES = {
  CHAT: "ai:chat",
  STT: "ai:stt",
  TTS: "ai:tts",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface ChatJobData {
  jobId: string;
  userId: string;
  chatSessionId: string;
  characterId: string;
  messages: { role: string; content: string }[];
}

export interface SttJobData {
  jobId: string;
  userId: string;
  chatSessionId: string;
  audioBase64: string;
  mimeType: string;
  filename: string;
}

export interface TtsJobData {
  jobId: string;
  userId: string;
  messageId: string;
  text: string;
  voiceId?: string;
}

export type AiJobData = ChatJobData | SttJobData | TtsJobData;

export interface JobResult {
  ok: boolean;
  output?: Record<string, unknown>;
  tokensUsed?: number;
  error?: string;
}
