/**
 * @file apps/migrator/src/seed-option-pack.ts
 * @description Применяет пак картинок вариантов генерации (apps/migrator/data/option-pack).
 *
 * pack.json собирается скриптом scripts/build-option-pack.py из Excel и содержит
 * для каждого варианта: раздел, код, подписи {en,ru,de,fr}, флаг 18+, порядок и
 * целевую строку БД (таблица, категория/таб, name). Картинки лежат рядом:
 * small/<section>/<code>.webp (превью) и full/<section>/<code>.webp (оригинал).
 *
 * Что делает:
 * 1. Загружает WebP в S3 по детерминированным ключам option-images/pack/<section>/<code>-{thumb,full}.webp
 *    (пропускает объекты, которые уже лежат с тем же размером).
 * 2. Находит строку варианта (по name, затем по code) или создаёт новую, проставляет
 *    code, labels, nsfw, order, active = true и ключи картинок.
 * 3. В затронутых разделах скрывает (active = false) все варианты, которых нет в паке.
 * 4. Подписывает группы (labels у *_categories) по русскому имени группы.
 *
 * Идемпотентность: хэш pack.json + картинок записывается в app_settings.option_pack_hash;
 * при совпадении шаг пропускается целиком — ручные правки в админке (active, порядок)
 * не перетираются до выхода следующей версии пака.
 */

import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import type { Client } from "pg";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

type Labels = { en: string; ru: string; de: string; fr: string };

interface PackItem {
  section: string;
  code: string;
  group: string | null;
  labels: Labels;
  nsfw: boolean;
  order: number;
  prompt: string | null;
  target: {
    table: string;
    keyCol: "category" | "section" | "tab";
    keyVal: string;
    category: string | null;
    name: string;
    generationStyle?: string | null;
  };
}

interface Pack {
  version: number;
  sections: Record<string, Labels>;
  groups: Record<string, Labels>;
  items: PackItem[];
}

export interface OptionPackS3 {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretKey: string;
  bucket: string;
}

interface Logger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const HASH_KEY = "option_pack_hash";

/** Таблица категорий для таблицы опций с группами. */
const CATEGORY_TABLE: Record<string, string> = {
  appearance_options: "appearance_categories",
  pose_options: "pose_categories",
  scene_options: "scene_categories",
};

/** Класс стиля по имени — как в stylePromptPrefix (apps/web/lib/prompt.ts). */
function styleClass(name: string): string | null {
  const s = name.toLowerCase();
  if (/\b3d\b|3dcg/.test(s)) return "cartoon_3d";
  if (/\b2d\b|cartoon|мульт/.test(s)) return "cartoon_2d";
  if (/semi|полуреал/.test(s)) return "semi_realistic";
  if (/anime|аниме/.test(s)) return "anime";
  if (/real|реал|photo/.test(s)) return "realistic";
  return null;
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function packHash(dir: string): string {
  const h = createHash("sha256");
  for (const file of listFiles(dir)) {
    h.update(path.relative(dir, file));
    h.update(readFileSync(file));
  }
  return h.digest("hex");
}

async function uploadIfChanged(s3: S3Client, bucket: string, key: string, file: string): Promise<boolean> {
  const body = readFileSync(file);
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentLength === body.length) return false;
  } catch {
    // объекта нет — загружаем
  }
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return true;
}

/** Параллельно с ограничением: не открываем сотни соединений к S3 сразу. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

async function findOrCreateCategory(client: Client, table: string, tab: string, name: string): Promise<string> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM "${table}" WHERE tab = $1 AND name = $2 LIMIT 1`, [tab, name],
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await client.query<{ id: string }>(
    `INSERT INTO "${table}" (id, tab, name, "order", created_at)
     VALUES (gen_random_uuid()::text, $1, $2, (SELECT COALESCE(MAX("order"), -1) + 1 FROM "${table}" WHERE tab = $1), NOW())
     RETURNING id`,
    [tab, name],
  );
  return created.rows[0].id;
}

/** Ищет строку варианта: сначала по name в нужной категории/разделе, затем по code. */
async function findOption(client: Client, it: PackItem): Promise<string | null> {
  const t = it.target;
  const catTable = CATEGORY_TABLE[t.table];
  if (catTable) {
    const byName = await client.query<{ id: string }>(
      `SELECT o.id FROM "${t.table}" o JOIN "${catTable}" c ON c.id = o.category_id
       WHERE c.tab = $1 AND c.name = $2 AND o.name = $3 LIMIT 1`,
      [t.keyVal, t.category, t.name],
    );
    if (byName.rows[0]) return byName.rows[0].id;
    const byCode = await client.query<{ id: string }>(
      `SELECT o.id FROM "${t.table}" o JOIN "${catTable}" c ON c.id = o.category_id
       WHERE c.tab = $1 AND o.code = $2 LIMIT 1`,
      [t.keyVal, it.code],
    );
    return byCode.rows[0]?.id ?? null;
  }

  const byName = await client.query<{ id: string }>(
    `SELECT id FROM "${t.table}" WHERE "${t.keyCol}" = $1 AND (name = $2 OR code = $3)
     ORDER BY (name = $2) DESC, created_at LIMIT 1`,
    [t.keyVal, t.name, it.code],
  );
  if (byName.rows[0]) return byName.rows[0].id;

  // STYLE заводят руками в админке под своими именами (Realistic, Anime, 3D…):
  // сопоставляем по классу стиля, чтобы не потерять generation_style.
  if (t.keyVal === "STYLE") {
    const { rows } = await client.query<{ id: string; name: string; code: string | null }>(
      `SELECT id, name, code FROM character_options WHERE category = 'STYLE' ORDER BY "order", created_at`,
    );
    const match = rows.find((r) => !r.code && styleClass(r.name) === it.code);
    if (match) return match.id;
  }
  return null;
}

async function createOption(client: Client, it: PackItem): Promise<string> {
  const t = it.target;
  const catTable = CATEGORY_TABLE[t.table];
  if (catTable) {
    const catId = await findOrCreateCategory(client, catTable, t.keyVal, t.category ?? t.keyVal);
    const res = await client.query<{ id: string }>(
      `INSERT INTO "${t.table}" (id, category_id, name, prompt, "order", created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW()) RETURNING id`,
      [catId, t.name, it.prompt, it.order],
    );
    return res.rows[0].id;
  }
  if (t.table === "character_options") {
    const res = await client.query<{ id: string }>(
      `INSERT INTO character_options (id, category, name, prompt, "order", generation_style, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [t.keyVal, t.name, it.prompt, it.order, t.generationStyle ?? null],
    );
    return res.rows[0].id;
  }
  const res = await client.query<{ id: string }>(
    `INSERT INTO "${t.table}" (id, "${t.keyCol}", name, prompt, "order", created_at)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW()) RETURNING id`,
    [t.keyVal, t.name, it.prompt, it.order],
  );
  return res.rows[0].id;
}

export async function seedOptionPack(
  client: Client,
  opts: { dir: string; s3?: OptionPackS3; logger: Logger },
): Promise<void> {
  const { dir, logger } = opts;
  const packFile = path.join(dir, "pack.json");
  if (!existsSync(packFile)) {
    logger.warn({ packFile }, "option_pack_not_found_skipping");
    return;
  }
  if (!opts.s3) {
    // Без S3 картинки не загрузить, а скрывать варианты без новых картинок нельзя — ждём S3.
    logger.warn({}, "option_pack_skipped_s3_not_configured");
    return;
  }

  const hash = packHash(dir);
  const prev = await client.query<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [HASH_KEY]);
  if (prev.rows[0]?.value === hash) {
    logger.info({ hash }, "option_pack_already_applied");
    return;
  }

  const pack: Pack = JSON.parse(readFileSync(packFile, "utf-8"));
  const s3 = new S3Client({
    endpoint: opts.s3.endpoint,
    region: opts.s3.region,
    credentials: { accessKeyId: opts.s3.accessKeyId, secretAccessKey: opts.s3.secretKey },
    forcePathStyle: true,
  });

  // 1. Картинки
  const keyOf = (it: PackItem, kind: "thumb" | "full") => `option-images/pack/${it.section}/${it.code}-${kind}.webp`;
  const uploads = pack.items.flatMap((it) => [
    { key: keyOf(it, "thumb"), file: path.join(dir, "small", it.section, `${it.code}.webp`) },
    { key: keyOf(it, "full"), file: path.join(dir, "full", it.section, `${it.code}.webp`) },
  ]);
  const uploaded = (await mapLimit(uploads, 8, (u) => uploadIfChanged(s3, opts.s3!.bucket, u.key, u.file))).filter(Boolean).length;
  logger.info({ total: uploads.length, uploaded }, "option_pack_images_uploaded");

  // 2–4. БД — одной транзакцией, чтобы не оставить каталог наполовину скрытым
  await client.query("BEGIN");
  try {
    const keepIds = new Map<string, string[]>(); // `${table}|${keyCol}|${keyVal}` -> ids
    let created = 0;
    for (const it of pack.items) {
      let id = await findOption(client, it);
      if (!id) {
        id = await createOption(client, it);
        created++;
      }
      await client.query(
        `UPDATE "${it.target.table}"
         SET code = $2, labels = $3::jsonb, nsfw = $4, "order" = $5, active = true,
             image_thumb_key = $6, image_full_key = $7
         WHERE id = $1`,
        [id, it.code, JSON.stringify(it.labels), it.nsfw, it.order, keyOf(it, "thumb"), keyOf(it, "full")],
      );
      const scope = `${it.target.table}|${it.target.keyCol}|${it.target.keyVal}`;
      if (!keepIds.has(scope)) keepIds.set(scope, []);
      keepIds.get(scope)!.push(id);
    }

    let hidden = 0;
    for (const [scope, ids] of keepIds) {
      const [table, keyCol, keyVal] = scope.split("|");
      const catTable = CATEGORY_TABLE[table];
      const res = catTable
        ? await client.query(
            `UPDATE "${table}" SET active = false
             WHERE category_id IN (SELECT id FROM "${catTable}" WHERE tab = $1) AND id <> ALL($2::text[]) AND active`,
            [keyVal, ids],
          )
        : await client.query(
            `UPDATE "${table}" SET active = false WHERE "${keyCol}" = $1 AND id <> ALL($2::text[]) AND active`,
            [keyVal, ids],
          );
      hidden += res.rowCount ?? 0;
    }

    for (const catTable of Object.values(CATEGORY_TABLE)) {
      for (const [name, labels] of Object.entries(pack.groups)) {
        await client.query(`UPDATE "${catTable}" SET labels = $2::jsonb WHERE name = $1`, [name, JSON.stringify(labels)]);
      }
    }

    await client.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [HASH_KEY, hash],
    );
    await client.query("COMMIT");
    logger.info({ items: pack.items.length, created, hidden, hash }, "option_pack_applied");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
