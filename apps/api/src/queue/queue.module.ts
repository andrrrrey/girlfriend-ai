import { Module, Global } from "@nestjs/common";
import { Queue } from "bullmq";
import { loadEnv } from "@repo/config";
import { QUEUE_NAME } from "./queue.types";

const env = loadEnv();

// Parse Redis URL into connection options — avoids ioredis version conflicts
// (bullmq bundles its own ioredis; passing raw options bypasses type mismatch)
function parseRedisUrl(url: string): Record<string, unknown> {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1) || "0", 10),
    maxRetriesPerRequest: null,
  };
}

export const aiQueue = new Queue(QUEUE_NAME, {
  connection: parseRedisUrl(env.REDIS_URL) as any,
});

export const AI_QUEUE = Symbol("AI_QUEUE");

@Global()
@Module({
  providers: [
    {
      provide: AI_QUEUE,
      useValue: aiQueue,
    },
  ],
  exports: [AI_QUEUE],
})
export class QueueModule {}
