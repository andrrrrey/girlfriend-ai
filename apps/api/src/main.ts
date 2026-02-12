import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId, setResponseRequestId } from "@repo/logger";

async function bootstrap() {
  const env = loadEnv();
  const logger = createLogger({ service: "api", env: env.ENV, level: env.LOG_LEVEL });

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: false,
  });

  app.use((req: any, res: any, next: any) => {
    const requestId = getRequestId(req, env.REQUEST_ID_HEADER);
    req.requestId = requestId;
    setResponseRequestId(res, requestId, env.REQUEST_ID_HEADER);

    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          duration_ms: Date.now() - start,
        },
        "http_request"
      );
    });

    next();
  });

  app.enableCors({ origin: true, credentials: true });

  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info({ port: env.API_PORT }, "api_started");
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
