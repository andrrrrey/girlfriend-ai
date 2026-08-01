/**
 * @file apps/migrator/src/import-articles.ts
 * @description Одноразовый (идемпотентный) импорт статей блога из дампа
 * `articles.sql` (MySQL-экспорт таблицы `en_blogs`) в таблицу `blog_posts`.
 *
 * Источник дампа (в порядке приоритета):
 *   1. Локальный файл `localFile` — запечён в образ мигратора как
 *      `apps/migrator/data/articles.sql.gz` (~23 МБ gzip). Основной путь.
 *   2. Объектное хранилище (S3/MinIO) по ключу `ARTICLES_SQL_KEY`
 *      (по умолчанию `imports/articles.sql`) — фолбэк, если файла в образе нет.
 * Файлы `.gz` распаковываются на лету.
 *
 * Память: контейнер мигратора ограничен (~256 МБ heap), а распакованный дамп —
 * ~89 МБ. Поэтому разбираем дамп ПО БАЙТАМ (Buffer), не превращая его в одну
 * гигантскую JS-строку (которая при первом же не-ASCII символе стала бы 2-байтной,
 * ~178 МБ), и вставляем потоково батчами, не накапливая все статьи в памяти.
 *
 * Идемпотентность:
 * - Пропуск, если статьи уже импортированы (метка `created_by = 'articles.sql'`).
 * - Вставка идёт с `ON CONFLICT (slug) DO NOTHING`.
 *
 * Маппинг и санитизация HTML повторяют бэкенд (apps/api/src/blog/blog-seo.ts),
 * чтобы импортированные записи были неотличимы от созданных через админку.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { Client } from "pg";
import { existsSync, readFileSync } from "fs";
import { gunzipSync } from "zlib";

/** Порядок колонок в `INSERT INTO en_blogs (...)` — фиксирован в дампе. */
const COLS = [
  "id", "slug", "cluster_id", "category_id", "title", "meta_title",
  "meta_description", "h1", "canonical_url", "og_title", "og_description",
  "primary_keyword", "secondary_keywords", "excerpt", "content_html",
  "faq_json", "schema_jsonld", "word_count", "reading_time", "language",
  "author_name", "status", "gen_model", "gen_batch",
] as const;
const IDX = Object.fromEntries(COLS.map((c, i) => [c, i])) as Record<
  (typeof COLS)[number],
  number
>;

/** cluster_id (AUTO_INCREMENT в порядке INSERT) → одна из 4 категорий blog_posts. */
const CLUSTER_CATEGORY: Record<number, string> = {
  1: "AI",           // guide
  2: "Updates",      // review
  3: "AI",           // category (nsfw landing)
  4: "Relationship", // persona
  5: "Updates",      // money
  6: "AI",           // tech
  7: "Relationship", // lifestyle
  8: "News",         // news
  9: "AI",           // character
};

/** Стартовая точка «раскладки» дат публикации: по 1 часу между статьями. */
const BASE_TS = Date.UTC(2025, 0, 1, 0, 0, 0);

// ASCII-коды разделителей — сканируем по байтам (UTF-8-safe: continuation-байты ≥0x80
// никогда не совпадают с ASCII-разделителями).
const CH_TAB = 9, CH_LF = 10, CH_CR = 13, CH_SPACE = 32;
const CH_QUOTE = 39, CH_LPAREN = 40, CH_RPAREN = 41, CH_COMMA = 44, CH_BACKSLASH = 92;
const isWs = (c: number) => c === CH_SPACE || c === CH_TAB || c === CH_LF || c === CH_CR;

/** Разэкранирование MySQL-строки: обратные слэши и удвоенные кавычки. */
function unescapeSql(raw: string): string {
  if (raw.indexOf("\\") === -1 && raw.indexOf("''") === -1) return raw; // быстрый путь
  return raw
    .replace(/''/g, "'")
    .replace(/\\([\s\S])/g, (_m, c: string) =>
      c === "n" ? "\n" :
      c === "r" ? "\r" :
      c === "t" ? "\t" :
      c === "0" ? "\0" :
      c === "b" ? "\b" :
      c === "Z" ? "\x1a" : c,
    );
}

/**
 * Экономный разбор одного VALUES-кортежа ПО БАЙТАМ буфера, начиная сразу после '('.
 * Строковые поля декодируются из UTF-8 срезом (buf.toString) и разэкранируются;
 * числа/NULL — тоже срезом. Никакой посимвольной сборки — минимум мусора для GC.
 */
function parseTupleBuf(buf: Buffer, start: number): { fields: (string | null)[]; end: number } {
  const fields: (string | null)[] = [];
  let i = start;
  const n = buf.length;
  while (i < n) {
    while (i < n && isWs(buf[i])) i++;
    if (buf[i] === CH_RPAREN) return { fields, end: i + 1 };
    if (buf[i] === CH_QUOTE) {
      const startStr = ++i;
      while (i < n) {
        const c = buf[i];
        if (c === CH_BACKSLASH) { i += 2; continue; }
        if (c === CH_QUOTE) {
          if (buf[i + 1] === CH_QUOTE) { i += 2; continue; } // '' — экранированная кавычка
          break;
        }
        i++;
      }
      fields.push(unescapeSql(buf.toString("utf8", startStr, i)));
      i++; // пропускаем закрывающую кавычку
    } else {
      let j = i;
      while (j < n && buf[j] !== CH_COMMA && buf[j] !== CH_RPAREN) j++;
      const raw = buf.toString("utf8", i, j).trim();
      fields.push(raw.toUpperCase() === "NULL" ? null : raw);
      i = j;
    }
    while (i < n && isWs(buf[i])) i++;
    if (buf[i] === CH_COMMA) { i++; continue; }
    if (buf[i] === CH_RPAREN) return { fields, end: i + 1 };
  }
  return { fields, end: i };
}

/** Санитизация HTML — точная копия sanitizeBlogHtml из apps/api/src/blog/blog-seo.ts. */
function sanitizeBlogHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function excerptFromHtml(html: string, max = 160): string {
  const text = (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String).filter(Boolean).slice(0, 12);
  } catch { /* ignore malformed json */ }
  return [];
}

interface PreparedPost {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  ts: Date;
}

/** Маппит один разобранный кортеж en_blogs в запись blog_posts (или null, если мусор). */
function mapFields(fields: (string | null)[]): PreparedPost | null {
  if (fields.length < COLS.length) return null;
  const id = parseInt(String(fields[IDX.id] ?? ""), 10) || 0;
  const clusterId = parseInt(String(fields[IDX.cluster_id] ?? ""), 10) || 0;
  const title = (fields[IDX.title] || "").toString().trim();
  const slug = (fields[IDX.slug] || "").toString().trim();
  const content = sanitizeBlogHtml((fields[IDX.content_html] || "").toString());
  const rawExcerpt = (fields[IDX.excerpt] || "").toString().trim();
  const excerpt = rawExcerpt || excerptFromHtml(content);
  if (!slug || !title || !content) return null;
  return {
    title, slug, content, excerpt,
    category: CLUSTER_CATEGORY[clusterId] || "News",
    tags: parseTags(fields[IDX.secondary_keywords]),
    ts: new Date(BASE_TS + id * 3600 * 1000),
  };
}

/** Вставляет батч одним INSERT ... ON CONFLICT (slug) DO NOTHING. Возвращает число вставленных. */
async function insertBatch(client: Client, batch: PreparedPost[]): Promise<number> {
  if (batch.length === 0) return 0;
  const values: string[] = [];
  const params: unknown[] = [];
  let pi = 1;
  for (const p of batch) {
    values.push(
      `($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++}::text[],true,$${pi++},$${pi++},$${pi++})`,
    );
    params.push(
      p.title, p.slug, p.content, p.excerpt, p.category,
      "articles.sql", p.tags, p.ts, p.ts, p.ts,
    );
  }
  const res = await client.query(
    `INSERT INTO blog_posts
       (title, slug, content, excerpt, category, created_by, tags,
        is_published, published_at, created_at, updated_at)
     VALUES ${values.join(",")}
     ON CONFLICT (slug) DO NOTHING`,
    params,
  );
  return res.rowCount ?? 0;
}

export interface ImportArticlesOptions {
  /** Путь к дампу, запечённому в образ (поддерживается `.gz`). Приоритетнее S3. */
  localFile?: string;
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretKey: string;
    bucket: string;
    key: string;
  };
  logger: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

/** Читает дамп как Buffer байтов: локальный файл (gunzip для `.gz`), иначе — S3. */
async function loadDump(opts: ImportArticlesOptions): Promise<Buffer | undefined> {
  const { logger } = opts;

  if (opts.localFile && existsSync(opts.localFile)) {
    try {
      const raw = readFileSync(opts.localFile);
      const buf = opts.localFile.endsWith(".gz") ? gunzipSync(raw) : raw;
      logger.info(
        { file: opts.localFile, gzBytes: raw.length, bytes: buf.length },
        "import_articles_source_local",
      );
      return buf;
    } catch (err) {
      logger.warn({ file: opts.localFile, err }, "import_articles_local_read_failed");
      // не падаем — пробуем S3-фолбэк ниже
    }
  }

  if (!opts.s3) {
    logger.warn({}, "import_articles_skipped_no_source");
    return undefined;
  }

  const { endpoint, region, accessKeyId, secretKey, bucket, key } = opts.s3;
  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey: secretKey },
    forcePathStyle: true,
  });
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      logger.warn({ bucket, key }, "import_articles_dump_empty_body");
      return undefined;
    }
    const bytes = await (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    const raw = Buffer.from(bytes);
    const buf = key.endsWith(".gz") ? gunzipSync(raw) : raw;
    logger.info({ bucket, key, bytes: buf.length }, "import_articles_source_s3");
    return buf;
  } catch (err) {
    logger.warn({ bucket, key, err }, "import_articles_dump_fetch_failed");
    return undefined;
  }
}

/**
 * Импортирует статьи в blog_posts (best-effort, идемпотентно).
 * Ничего не бросает наружу за пределы своих guard'ов; сам разбор/вставка — потоковые.
 */
export async function importArticles(
  client: Client,
  opts: ImportArticlesOptions,
): Promise<void> {
  const { logger } = opts;

  // Guard 1: таблица должна существовать (её создаёт миграция блога).
  const tbl = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'blog_posts'
     ) AS exists`,
  );
  if (!tbl.rows[0].exists) {
    logger.warn({}, "import_articles_skipped_no_table");
    return;
  }

  // Guard 2: если статьи из дампа уже импортированы — выходим. Смотрим именно на
  // метку `created_by = 'articles.sql'`, чтобы вручную созданные посты (через
  // админку) не блокировали первый импорт.
  const cnt = await client.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM blog_posts WHERE created_by = 'articles.sql'`,
  );
  if (Number(cnt.rows[0].n) > 0) {
    logger.info({ imported: Number(cnt.rows[0].n) }, "import_articles_skipped_already_imported");
    return;
  }

  // Guard 3: нужен источник дампа (локальный файл в образе или S3).
  const buf = await loadDump(opts);
  if (!buf) return;

  // Потоковый разбор по байтам + вставка батчами по 200 (память ≈ размер дампа,
  // без 2-байтной строки и без хранения всех статей сразу).
  const MARKER = Buffer.from("INSERT INTO en_blogs (");
  const VALUES = Buffer.from(" VALUES (");
  const BATCH = 200;
  let from = 0;
  let parsed = 0;
  let inserted = 0;
  let batch: PreparedPost[] = [];

  while (true) {
    const at = buf.indexOf(MARKER, from);
    if (at === -1) break;
    const vAt = buf.indexOf(VALUES, at);
    if (vAt === -1) break;
    const { fields, end } = parseTupleBuf(buf, vAt + VALUES.length);
    from = end;
    const post = mapFields(fields);
    if (!post) continue;
    batch.push(post);
    parsed++;
    if (batch.length >= BATCH) {
      inserted += await insertBatch(client, batch);
      batch = [];
    }
  }
  inserted += await insertBatch(client, batch);

  logger.info({ parsed, inserted }, "import_articles_done");
}
