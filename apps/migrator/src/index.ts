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
import { existsSync, readFileSync } from "fs";
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
 * - 5 демо-персонажей (characters) — проверяется по имени + deleted_at IS NULL
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

  // ── Demo characters ──
  const characters = [
    {
      name: "Алиса",
      systemPrompt:
        "Ты Алиса — милая, заботливая и романтичная девушка 22 лет. Ты обожаешь уютные вечера, горячий шоколад и долгие разговоры. Ты всегда поддержишь собеседника, расскажешь что-нибудь тёплое и обнимешь словами. Говоришь ласково, используешь эмодзи в меру. Отвечай на языке пользователя.",
      personality: { age: 22, traits: ["caring", "romantic", "warm", "supportive"], hobbies: ["reading", "cooking", "walks"] },
      tags: ["romantic", "caring", "cozy"],
    },
    {
      name: "Кира",
      systemPrompt:
        "Ты Кира — дерзкая и уверенная в себе девушка 24 лет. Ты спортивная, энергичная, любишь вызовы и флирт. Ты не боишься говорить прямо, подшучиваешь, но всегда с теплотой. Ты мотивируешь собеседника стать лучше. Отвечай на языке пользователя.",
      personality: { age: 24, traits: ["bold", "athletic", "flirty", "motivating"], hobbies: ["fitness", "dancing", "travel"] },
      tags: ["athletic", "flirty", "bold"],
    },
    {
      name: "Юки",
      systemPrompt:
        "Ты Юки — загадочная и тихая девушка 20 лет в стиле аниме. Ты немного стеснительная, но когда раскрываешься — становишься очень нежной. Любишь аниме, рисование и мечтать. Иногда говоришь тихо и загадочно. Используешь кавайные выражения. Отвечай на языке пользователя.",
      personality: { age: 20, traits: ["shy", "mysterious", "gentle", "creative"], hobbies: ["anime", "drawing", "dreaming"] },
      tags: ["anime", "shy", "creative"],
    },
    {
      name: "Марго",
      systemPrompt:
        "Ты Марго — умная и ироничная девушка 26 лет. Ты обожаешь интеллектуальные разговоры, саркастический юмор и хорошие книги. Ты можешь быть нежной, но предпочитаешь острый ум нежным словам. Ты вызываешь интерес через интеллект. Отвечай на языке пользователя.",
      personality: { age: 26, traits: ["smart", "ironic", "witty", "intellectual"], hobbies: ["books", "philosophy", "cinema"] },
      tags: ["intellectual", "witty", "mature"],
    },
    {
      name: "Сакура",
      systemPrompt:
        "Ты Сакура — весёлая, гиперактивная и жизнерадостная девушка 19 лет. Ты обожаешь видеоигры, мемы и кофе. Ты всегда поднимаешь настроение, шутишь и делаешь жизнь ярче. Говоришь быстро, с энтузиазмом, используешь сленг и эмодзи. Отвечай на языке пользователя.",
      personality: { age: 19, traits: ["cheerful", "energetic", "gamer", "funny"], hobbies: ["gaming", "memes", "coffee"] },
      tags: ["gamer", "cheerful", "anime"],
    },
  ];

  for (const char of characters) {
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM "characters" WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
      [char.name],
    );
    if (existing.length === 0) {
      await client.query(
        `INSERT INTO "characters" (id, name, system_prompt, personality, tags, is_public, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW(), NOW())`,
        [char.name, char.systemPrompt, JSON.stringify(char.personality), char.tags],
      );
      logger.info({ name: char.name }, "character_seeded");
    }
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

interface ManifestItem {
  name: string;
  group: string;
  prompt: string;
  file: string;
}

interface ManifestSection {
  title: string;
  folder: string;
  items: Record<string, ManifestItem>;
}

interface Manifest {
  version: number;
  sections: Record<string, ManifestSection>;
}

function imgUrl(filePath: string): string {
  return `/generation-elements/${filePath}`;
}

async function getOrCreateCategory(
  client: Client,
  table: string,
  keyCol: string,
  keyVal: string,
  name: string,
  order: number,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `WITH ins AS (
       INSERT INTO "${table}" (id, "${keyCol}", name, "order", created_at)
       SELECT gen_random_uuid()::text, $1, $2, $3, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE "${keyCol}" = $1 AND name = $2)
       RETURNING id
     )
     SELECT id FROM ins
     UNION ALL
     SELECT id FROM "${table}" WHERE "${keyCol}" = $1 AND name = $2
     LIMIT 1`,
    [keyVal, name, order],
  );
  return res.rows[0].id;
}

async function insertFlatOption(
  client: Client,
  table: string,
  keyCol: string,
  keyVal: string,
  name: string,
  prompt: string,
  imageUrl: string,
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO "${table}" (id, "${keyCol}", name, prompt, image_url, "order", created_at)
     SELECT gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW()
     WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE "${keyCol}" = $1 AND name = $2)`,
    [keyVal, name, prompt, imageUrl, order],
  );
}

async function insertCategoryOption(
  client: Client,
  table: string,
  categoryId: string,
  name: string,
  prompt: string,
  imageUrl: string,
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO "${table}" (id, category_id, name, prompt, image_url, "order", created_at)
     SELECT gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW()
     WHERE NOT EXISTS (SELECT 1 FROM "${table}" WHERE category_id = $1 AND name = $2)`,
    [categoryId, name, prompt, imageUrl, order],
  );
}

async function seedGenerationElements(client: Client, workspaceRoot: string): Promise<void> {
  // manifest.json лежит в apps/migrator/data/ — внутри образа мигратора
  const manifestPath = path.join(__dirname, "..", "data", "manifest.json");
  if (!existsSync(manifestPath)) {
    logger.warn({ manifestPath }, "generation_elements_manifest_not_found_skipping");
    return;
  }

  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const s = manifest.sections;

  // ── Character options ──
  const ethnicityItems = Object.values(s.ethnicity.items);
  const humanItems = ethnicityItems.filter((i) => i.group === "Человеческие");
  const fantasyItems = ethnicityItems.filter((i) => i.group === "Фэнтезийные");

  for (let i = 0; i < humanItems.length; i++) {
    const it = humanItems[i];
    await insertFlatOption(client, "character_options", "category", "HUMAN_RACE", it.name, it.prompt, imgUrl(it.file), i);
  }
  for (let i = 0; i < fantasyItems.length; i++) {
    const it = fantasyItems[i];
    await insertFlatOption(client, "character_options", "category", "FANTASY_RACE", it.name, it.prompt, imgUrl(it.file), i);
  }

  const hairstyleItems = Object.values(s.hairstyle.items);
  for (let i = 0; i < hairstyleItems.length; i++) {
    const it = hairstyleItems[i];
    await insertFlatOption(client, "character_options", "category", "HAIR_STYLE", it.name, it.prompt, imgUrl(it.file), i);
  }

  const bodyItems = Object.values(s.body.items);
  for (let i = 0; i < bodyItems.length; i++) {
    const it = bodyItems[i];
    await insertFlatOption(client, "character_options", "category", "BODY_TYPE", it.name, it.prompt, imgUrl(it.file), i);
  }

  // ── Appearance options ──
  const processAppearance = async (items: ManifestItem[], tab: string, defaultGroup?: string) => {
    const groupMap = new Map<string, ManifestItem[]>();
    for (const item of items) {
      const g = item.group || defaultGroup || tab;
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(item);
    }
    let catOrder = 0;
    for (const [groupName, groupItems] of groupMap) {
      const catId = await getOrCreateCategory(client, "appearance_categories", "tab", tab, groupName, catOrder++);
      for (let i = 0; i < groupItems.length; i++) {
        const it = groupItems[i];
        await insertCategoryOption(client, "appearance_options", catId, it.name, it.prompt, imgUrl(it.file), i);
      }
    }
  };

  await processAppearance(Object.values(s.outfit.items), "OUTFITS");
  await processAppearance(Object.values(s.accessories.items), "OUTFIT_DETAILS");
  await processAppearance(Object.values(s.footwear.items), "OUTFIT_DETAILS", "Обувь");
  await processAppearance(Object.values(s.distinctive.items), "OUTFIT_DETAILS", "Отличительные черты");

  // ── Pose options ──
  const processPose = async (items: ManifestItem[], tab: string, defaultGroup?: string) => {
    const groupMap = new Map<string, ManifestItem[]>();
    for (const item of items) {
      const g = item.group || defaultGroup || tab;
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(item);
    }
    let catOrder = 0;
    for (const [groupName, groupItems] of groupMap) {
      const catId = await getOrCreateCategory(client, "pose_categories", "tab", tab, groupName, catOrder++);
      for (let i = 0; i < groupItems.length; i++) {
        const it = groupItems[i];
        await insertCategoryOption(client, "pose_options", catId, it.name, it.prompt, imgUrl(it.file), i);
      }
    }
  };

  await processPose(Object.values(s.expression.items), "FACIAL_EXPRESSION");
  await processPose(Object.values(s.pose.items), "POSE", "Позы");
  await processPose(Object.values(s.subject.items), "POSE", "Действия");

  // ── Scene options ──
  const processScene = async (items: ManifestItem[], tab: string) => {
    const groupMap = new Map<string, ManifestItem[]>();
    for (const item of items) {
      const g = item.group || tab;
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(item);
    }
    let catOrder = 0;
    for (const [groupName, groupItems] of groupMap) {
      const catId = await getOrCreateCategory(client, "scene_categories", "tab", tab, groupName, catOrder++);
      for (let i = 0; i < groupItems.length; i++) {
        const it = groupItems[i];
        await insertCategoryOption(client, "scene_options", catId, it.name, it.prompt, imgUrl(it.file), i);
      }
    }
  };

  await processScene(Object.values(s.background.items), "LOCATION");

  // ── Camera options ──
  const framingItems = Object.values(s.framing.items);
  for (let i = 0; i < framingItems.length; i++) {
    const it = framingItems[i];
    await insertFlatOption(client, "camera_options", "section", "FRAMING", it.name, it.prompt, imgUrl(it.file), i);
  }

  const cameraItems = Object.values(s.camera.items);
  for (let i = 0; i < cameraItems.length; i++) {
    const it = cameraItems[i];
    await insertFlatOption(client, "camera_options", "section", "CAMERA_ANGLE", it.name, it.prompt, imgUrl(it.file), i);
  }

  logger.info({ version: manifest.version }, "generation_elements_seeded");
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

    logger.info({}, "seed_generation_elements_start");
    await seedGenerationElements(client, workspaceRoot);
    logger.info({}, "seed_generation_elements_done");
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
