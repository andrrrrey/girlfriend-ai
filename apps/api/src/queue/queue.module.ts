import { Module, Global } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@repo/config";
import { QUEUE_NAME } from "./queue.types";

const env = loadEnv();

// Shared Redis connection instance
export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// BullMQ queue for AI jobs
export const aiQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

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
