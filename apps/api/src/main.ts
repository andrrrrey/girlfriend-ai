/**
 * @file main.ts
 * @description Точка входа NestJS API-сервиса.
 *
 * Инициализирует приложение со следующей конфигурацией:
 * - Логгер: Pino JSON (через @repo/logger), встроенный NestJS-логгер отключён
 * - Middleware: X-Request-ID трассировка + HTTP-лог каждого запроса
 * - CORS: разрешён для всех origins (credentials: true) — для dev; в prod сужать
 * - ValidationPipe: whitelist=true (удаляет неизвестные поля), forbidNonWhitelisted=true (ошибка на лишние поля)
 * - Swagger: доступен по /api/docs с Bearer-аутентификацией
 * - Сервер: слушает на 0.0.0.0:API_PORT (все интерфейсы — нужно для Docker)
 */

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId, setResponseRequestId } from "@repo/logger";

async function bootstrap() {
  // Загружаем и валидируем переменные окружения (выбросит ZodError если чего-то не хватает)
  const env = loadEnv();

  // Создаём Pino-логгер для этого сервиса
  const logger = createLogger({ service: "api", env: env.ENV, level: env.LOG_LEVEL });

  const app = await NestFactory.create(AppModule, {
    // bufferLogs: буферизует логи до подключения кастомного логгера
    bufferLogs: true,
    // logger: false — отключает встроенный NestJS-логгер (используем Pino напрямую)
    logger: false,
  });

  // ─── Middleware: X-Request-ID + HTTP access log ─────────────────────────────
  // Выполняется для каждого входящего запроса ДО роутинга NestJS.
  app.use((req: any, res: any, next: any) => {
    // Получаем или генерируем Request-ID для сквозной трассировки
    const requestId = getRequestId(req, env.REQUEST_ID_HEADER);
    req.requestId = requestId;
    // Пробрасываем Request-ID в ответ для корреляции на клиенте/прокси
    setResponseRequestId(res, requestId, env.REQUEST_ID_HEADER);

    const start = Date.now();

    // Логируем HTTP-запрос после завершения ответа (событие "finish")
    res.on("finish", () => {
      logger.info(
        {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl ?? req.url,
          status: res.statusCode,
          duration_ms: Date.now() - start, // время обработки запроса в мс
        },
        "http_request"
      );
    });

    next();
  });

  // ─── CORS ───────────────────────────────────────────────────────────────────
  // origin: true — разрешает любой origin (в production заменить на список доменов)
  // credentials: true — разрешает передачу cookie/Authorization заголовков
  app.enableCors({ origin: true, credentials: true });

  // ─── Глобальный ValidationPipe ──────────────────────────────────────────────
  // whitelist: true         — удаляет поля, не декорированные class-validator
  // forbidNonWhitelisted: true — кидает 400 если в теле есть лишние поля
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // ─── Swagger (OpenAPI) ──────────────────────────────────────────────────────
  // Документация доступна по: GET /api/docs
  // В production можно отключить условием: if (env.ENV !== "production")
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Girlfriend AI API")
    .setDescription("REST API for the Girlfriend AI platform")
    .setVersion("1.0")
    .addBearerAuth() // Добавляет поле для JWT-токена в Swagger UI
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  // ─── Запуск сервера ─────────────────────────────────────────────────────────
  // 0.0.0.0 — слушаем на всех интерфейсах (обязательно для Docker/контейнеров)
  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info({ port: env.API_PORT, swagger: `http://localhost:${env.API_PORT}/api/docs` }, "api_started");
}

// Запускаем и обрабатываем критические ошибки инициализации
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1); // Код 1 — ненормальное завершение (покажет restart в Docker/k8s)
});
