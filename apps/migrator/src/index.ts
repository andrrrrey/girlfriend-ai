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
    // run prisma migrate deploy in apps/api (where prisma folder lives)
    await run("npx", ["prisma", "migrate", "deploy"], process.cwd() + "/apps/api");
    logger.info({}, "prisma_migrate_deploy_done");
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
