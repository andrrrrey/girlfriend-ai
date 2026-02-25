/**
 * @file apps/migrator/src/index.ts
 * @description Точка входа сервиса миграции БД.
 *
 * Назначение:
 * - Запускается в Docker Compose как init-контейнер (после postgres, до api/worker)
 * - Применяет все pending Prisma-миграции через `prisma migrate deploy`
 * - Завершается с кодом 0 при успехе или 1 при ошибке
 *
 * Защита от параллельных запусков:
 * - Использует PostgreSQL advisory lock (pg_advisory_lock/unlock)
 * - Lock ID: 987654321 (фиксированное число, уникальное для этого приложения)
 * - Гарантирует, что только один экземпляр мигратора работает одновременно
 * - Lock автоматически снимается при разрыве соединения (финальный блок)
 *
 * Расположение миграций:
 * - Prisma schema и папка migrations находятся в apps/api/prisma/
 * - `prisma migrate deploy` читает DATABASE_URL из process.env
 *
 * Запуск:
 * - В Docker: `docker compose up migrator`
 * - Локально: `DATABASE_URL=... pnpm --filter migrator start`
 */

import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { Client } from "pg";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import * as bcrypt from "bcrypt";

const env = loadEnv();
const logger = createLogger({ service: "migrator", env: env.ENV, level: env.LOG_LEVEL });

/**
 * Запускает дочерний процесс и ожидает его завершения.
 *
 * stdio: "inherit" — вывод команды идёт напрямую в stdout/stderr родительского процесса
 * (видно в логах Docker).
 *
 * @param {string} cmd - Команда для выполнения (например, "npx")
 * @param {string[]} args - Аргументы команды (например, ["prisma", "migrate", "deploy"])
 * @param {string} cwd - Рабочая директория (должна содержать prisma/ папку)
 * @returns {Promise<void>} Resolve при exit code 0, reject при ненулевом коде
 * @throws {Error} Если процесс завершился с ненулевым кодом
 */
async function run(cmd: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env: process.env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

/**
 * Сбрасывает записи о незавершённых (failed) миграциях из таблицы _prisma_migrations,
 * чтобы `prisma migrate deploy` мог их повторно применить после исправления SQL.
 *
 * Prisma фиксирует failed-миграцию в _prisma_migrations с finished_at = NULL.
 * При следующем запуске deploy видит такую запись и отказывается продолжать,
 * требуя ручного разрешения. Удаление записи позволяет миграции пройти заново.
 *
 * Ошибки (например, если таблица ещё не существует) логируются как warn и не прерывают запуск.
 *
 * @param client — активное pg.Client-соединение
 */
async function clearFailedMigrations(client: Client): Promise<void> {
  try {
    // Проверяем существование таблицы _prisma_migrations
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
       ) AS exists`,
    );
    if (!rows[0].exists) return; // первый запуск — таблица ещё не создана

    // Удаляем записи миграций, которые начались но не завершились (failed)
    const result = await client.query(
      `DELETE FROM "_prisma_migrations" WHERE finished_at IS NULL`,
    );
    if (result.rowCount && result.rowCount > 0) {
      logger.info({ count: result.rowCount }, "cleared_failed_migrations");
    }
  } catch (err) {
    logger.warn({ err }, "clear_failed_migrations_error");
  }
}

/**
 * Засевает базу данных начальными данными (идемпотентно).
 *
 * Создаёт:
 * - Дефолтные настройки AI-сервисов (app_settings) — не перезаписывает существующие
 * - Пользователя-администратора admin@example.com / admin123
 *
 * Использует прямое pg-соединение, без Prisma-клиента, чтобы не тащить
 * дополнительные зависимости в образ мигратора.
 *
 * @param client — активное pg.Client-соединение
 */
async function seedDatabase(client: Client): Promise<void> {
  // ── App settings ──
  const defaults: Record<string, string> = {
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-4o",
    OPENAI_STT_MODEL: "whisper-1",
    ELEVENLABS_API_KEY: "",
    ELEVENLABS_DEFAULT_VOICE_ID: "21m00Tcm4TlvDq8ikWAM",
    ELEVENLABS_MODEL_ID: "eleven_multilingual_v2",
  };

  for (const [key, value] of Object.entries(defaults)) {
    await client.query(
      `INSERT INTO "app_settings" (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO NOTHING`,
      [key, value],
    );
  }

  // ── Admin user ──
  const adminEmail = "admin@example.com";
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM "users" WHERE email = $1 LIMIT 1`,
    [adminEmail],
  );

  if (rows.length === 0) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await client.query(
      `INSERT INTO "users" (email, password_hash, nickname, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [adminEmail, passwordHash, "Admin", "admin"],
    );
    logger.info({ email: adminEmail }, "admin_user_seeded");
  } else {
    logger.info({ email: adminEmail }, "admin_user_exists");
  }
}

/**
 * Основная функция миграции.
 *
 * Алгоритм:
 * 1. Подключается к PostgreSQL напрямую через pg.Client
 * 2. Берёт advisory lock с ID 987654321 (предотвращает параллельные запуски)
 * 3. Сбрасывает записи о failed-миграциях (чтобы исправленные версии прошли повторно)
 * 4. Запускает `npx prisma migrate deploy` в директории apps/api
 * 5. В блоке finally снимает advisory lock и закрывает соединение
 *
 * При ошибке на любом шаге — функция бросает исключение,
 * main().catch() логирует ошибку и завершает процесс с кодом 1.
 */
async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  // advisory lock to prevent concurrent migrate runs
  await client.query("SELECT pg_advisory_lock(987654321);");

  try {
    // Сбрасываем failed-миграции перед деплоем (позволяет повторно применить исправленный SQL)
    await clearFailedMigrations(client);

    logger.info({}, "prisma_migrate_deploy_start");
    // __dirname = apps/migrator/dist  →  workspace root is 3 levels up
    const workspaceRoot = path.resolve(__dirname, "../../..");
    const apiDir = path.join(workspaceRoot, "apps", "api");

    // Find prisma binary without relying on npx or PATH
    const migratorDir = path.join(workspaceRoot, "apps", "migrator");
    const prismaCandidates = [
      path.join(migratorDir, "node_modules", ".bin", "prisma"),
      path.join(apiDir, "node_modules", ".bin", "prisma"),
      path.join(workspaceRoot, "node_modules", ".bin", "prisma"),
    ];
    const prismaBin = prismaCandidates.find((p) => existsSync(p));
    if (!prismaBin) throw new Error(`prisma binary not found. Tried:\n${prismaCandidates.join("\n")}`);

    await run(prismaBin, ["migrate", "deploy"], apiDir);
    logger.info({}, "prisma_migrate_deploy_done");

    logger.info({}, "seed_start");
    await seedDatabase(client);
    logger.info({}, "seed_done");
  } finally {
    // Снимаем lock в любом случае (успех или ошибка) — чтобы не блокировать другие запуски
    await client.query("SELECT pg_advisory_unlock(987654321);");
    await client.end();
  }
}

main().catch((err) => {
  logger.error({ err }, "migrations_failed");
  process.exit(1);
});
