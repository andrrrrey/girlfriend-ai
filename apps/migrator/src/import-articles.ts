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
 * Идемпотентность:
 * - Если `blog_posts` уже содержит записи — шаг полностью пропускается (guard),
 *   поэтому повторные деплои не перечитывают 89 МБ и ничего не дублируют.
 * - Сама вставка идёт с `ON CONFLICT (slug) DO NOTHING`.
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

function unescapeChar(c: string): string {
  switch (c) {
    case "n": return "\n";
    case "r": return "\r";
    case "t": return "\t";
    case "0": return "\0";
    case "b": return "\b";
    case "Z": return "\x1a";
    default: return c; // \'  \"  \\  и т.п.
  }
}

/** Разбирает один VALUES-кортеж, начиная с индекса сразу после '('. */
function parseTuple(s: string, start: number): { fields: (string | null)[]; end: number } {
  const fields: (string | null)[] = [];
  let i = start;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i])) i++;
    if (s[i] === ")") return { fields, end: i + 1 };
    if (s[i] === "'") {
      i++;
      let buf = "";
      while (i < n) {
        const c = s[i];
        if (c === "\\") { buf += unescapeChar(s[i + 1]); i += 2; continue; }
        if (c === "'") {
          if (s[i + 1] === "'") { buf += "'"; i += 2; continue; }
          i++; break;
        }
        buf += c; i++;
      }
      fields.push(buf);
    } else {
      let buf = "";
      while (i < n && s[i] !== "," && s[i] !== ")") { buf += s[i]; i++; }
      buf = buf.trim();
      fields.push(buf.toUpperCase() === "NULL" ? null : buf);
    }
    while (i < n && /\s/.test(s[i])) i++;
    if (s[i] === ",") { i++; continue; }
    if (s[i] === ")") return { fields, end: i + 1 };
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

/** Извлекает и маппит все строки en_blogs из текста дампа. */
function preparePosts(sql: string): PreparedPost[] {
  const posts: PreparedPost[] = [];
  const marker = "INSERT INTO en_blogs (";
  let from = 0;
  while (true) {
    const at = sql.indexOf(marker, from);
    if (at === -1) break;
    const vAt = sql.indexOf(" VALUES (", at);
    if (vAt === -1) break;
    const { fields, end } = parseTuple(sql, vAt + " VALUES (".length);
    from = end;
    if (fields.length < COLS.length) continue;

    const id = parseInt(String(fields[IDX.id] ?? ""), 10) || 0;
    const clusterId = parseInt(String(fields[IDX.cluster_id] ?? ""), 10) || 0;
    const title = (fields[IDX.title] || "").toString().trim();
    const slug = (fields[IDX.slug] || "").toString().trim();
    const content = sanitizeBlogHtml((fields[IDX.content_html] || "").toString());
    const rawExcerpt = (fields[IDX.excerpt] || "").toString().trim();
    const excerpt = rawExcerpt || excerptFromHtml(content);
    if (!slug || !title || !content) continue;

    posts.push({
      title,
      slug,
      content,
      excerpt,
      category: CLUSTER_CATEGORY[clusterId] || "News",
      tags: parseTags(fields[IDX.secondary_keywords]),
      ts: new Date(BASE_TS + id * 3600 * 1000),
    });
  }
  return posts;
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

/** Читает дамп: сначала локальный файл (с gunzip для `.gz`), иначе — из S3. */
async function loadDump(opts: ImportArticlesOptions): Promise<string | undefined> {
  const { logger } = opts;

  if (opts.localFile && existsSync(opts.localFile)) {
    try {
      const buf = readFileSync(opts.localFile);
      const sql = opts.localFile.endsWith(".gz")
        ? gunzipSync(buf).toString("utf-8")
        : buf.toString("utf-8");
      logger.info({ file: opts.localFile, bytes: buf.length }, "import_articles_source_local");
      return sql;
    } catch (err) {
      logger.warn({ file: opts.localFile, err }, "import_articles_local_read_failed");
      // падать не будем — попробуем S3-фолбэк ниже
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
    const buf = Buffer.from(bytes);
    const sql = key.endsWith(".gz") ? gunzipSync(buf).toString("utf-8") : buf.toString("utf-8");
    logger.info({ bucket, key, bytes: buf.length }, "import_articles_source_s3");
    return sql;
  } catch (err) {
    logger.warn({ bucket, key, err }, "import_articles_dump_fetch_failed");
    return undefined;
  }
}

/**
 * Импортирует статьи в blog_posts (best-effort, идемпотентно).
 * Ничего не бросает: любые проблемы логируются как warn, чтобы не валить деплой.
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
  // метку `created_by = 'articles.sql'`, а НЕ на любые записи, чтобы вручную
  // созданные посты (через админку) не блокировали первый импорт.
  const cnt = await client.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM blog_posts WHERE created_by = 'articles.sql'`,
  );
  if (Number(cnt.rows[0].n) > 0) {
    logger.info({ imported: Number(cnt.rows[0].n) }, "import_articles_skipped_already_imported");
    return;
  }

  // Guard 3: нужен источник дампа (локальный файл в образе или S3).
  const sql = await loadDump(opts);
  if (!sql) return;

  const posts = preparePosts(sql);
  logger.info({ parsed: posts.length }, "import_articles_parsed");
  if (posts.length === 0) return;

  const BATCH = 200;
  let inserted = 0;
  for (let b = 0; b < posts.length; b += BATCH) {
    const chunk = posts.slice(b, b + BATCH);
    const values: string[] = [];
    const params: unknown[] = [];
    let pi = 1;
    for (const p of chunk) {
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
    inserted += res.rowCount ?? 0;
  }

  logger.info({ inserted, total: posts.length }, "import_articles_done");
}
