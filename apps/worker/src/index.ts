import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const env = loadEnv();
const logger = createLogger({ service: "worker", env: env.ENV, level: env.LOG_LEVEL });

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const queue = new Queue("jobs", { connection });

new Worker(
  "jobs",
  async (job) => {
    logger.info({ job_id: job.id, name: job.name }, "job_started");
    logger.info({ job_id: job.id }, "job_done");
    return { ok: true };
  },
  { connection }
);

setInterval(async () => {
  const counts = await queue.getJobCounts();
  logger.info({ queue: "jobs", counts }, "worker_heartbeat");
}, 5000);
