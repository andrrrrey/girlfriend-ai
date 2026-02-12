import Fastify from "fastify";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId } from "@repo/logger";
import type { HealthResponse } from "@repo/types";

const env = loadEnv();
const logger = createLogger({ service: "ai", env: env.ENV, level: env.LOG_LEVEL });

const app = Fastify({ logger: false });

app.addHook("onRequest", async (req, reply) => {
  const requestId = getRequestId(req.raw, env.REQUEST_ID_HEADER);
  (req as any).requestId = requestId;
  reply.header(env.REQUEST_ID_HEADER, requestId);
});

app.get("/health", async (): Promise<HealthResponse> => ({ ok: true, service: "ai" }));

app.listen({ port: env.AI_PORT, host: "0.0.0.0" })
  .then(() => logger.info({ port: env.AI_PORT }, "ai_started"))
  .catch((err) => {
    logger.error({ err }, "ai_failed_to_start");
    process.exit(1);
  });
