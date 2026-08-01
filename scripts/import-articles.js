/**
 * Импорт статей из articles.sql (MySQL-дамп en_blogs) в blog_posts (Postgres).
 * Парсит INSERT-стейтменты вручную (контент многострочный, с backslash-эскейпами),
 * маппит поля, санитизирует HTML так же, как бэкенд (blog-seo.ts), и вставляет
 * батчами с ON CONFLICT(slug) DO NOTHING — идемпотентно (можно перезапускать).
 *
 * Запуск (нужен пакет `pg` в node_modules; проще всего из apps/api):
 *   DATABASE_URL=postgresql://app:app@localhost:5433/app \
 *     node ../../scripts/import-articles.js [path/to/articles.sql]
 *
 * articles.sql (~89 MB) в репозиторий НЕ коммитится — берётся из дампа рядом.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const SQL_FILE =
  process.argv[2] || path.resolve(__dirname, "..", "articles.sql");
const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://app:app@localhost:5433/app";

// Порядок колонок в INSERT INTO en_blogs (...):
const COLS = [
  "id", "slug", "cluster_id", "category_id", "title", "meta_title",
  "meta_description", "h1", "canonical_url", "og_title", "og_description",
  "primary_keyword", "secondary_keywords", "excerpt", "content_html",
  "faq_json", "schema_jsonld", "word_count", "reading_time", "language",
  "author_name", "status", "gen_model", "gen_batch",
];
const IDX = Object.fromEntries(COLS.map((c, i) => [c, i]));

// cluster_id (AUTO_INCREMENT в порядке INSERT) -> одна из 4 разрешённых категорий.
const CLUSTER_CATEGORY = {
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

function unescapeChar(c) {
  switch (c) {
    case "n": return "\n";
    case "r": return "\r";
    case "t": return "\t";
    case "0": return "\0";
    case "b": return "\b";
    case "Z": return "\x1a";
    default: return c; // \'  \"  \\  \%  \_  и т.п.
  }
}

/** Парсит один VALUES-кортеж, начиная с индекса сразу после '('. */
function parseTuple(s, start) {
  const fields = [];
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

function sanitizeBlogHtml(html) {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function excerptFromHtml(html, max = 160) {
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

function parseTags(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String).filter(Boolean).slice(0, 12);
  } catch (_) { /* ignore */ }
  return [];
}

const BASE_TS = Date.UTC(2025, 0, 1, 0, 0, 0); // 2025-01-01, статьи «раскладываем» по времени

function extractRows(sql) {
  const rows = [];
  const marker = "INSERT INTO en_blogs (";
  let from = 0;
  while (true) {
    const at = sql.indexOf(marker, from);
    if (at === -1) break;
    const vAt = sql.indexOf(" VALUES (", at);
    if (vAt === -1) break;
    const { fields, end } = parseTuple(sql, vAt + " VALUES (".length);
    from = end;
    if (fields.length < COLS.length) {
      console.warn(`skip: got ${fields.length} fields near offset ${at}`);
      continue;
    }
    rows.push(fields);
  }
  return rows;
}

async function main() {
  console.log(`Reading ${SQL_FILE} ...`);
  const sql = fs.readFileSync(SQL_FILE, "utf8");
  const raw = extractRows(sql);
  console.log(`Parsed ${raw.length} article rows.`);

  const posts = raw.map((f) => {
    const id = parseInt(f[IDX.id], 10) || 0;
    const clusterId = parseInt(f[IDX.cluster_id], 10) || 0;
    const title = (f[IDX.title] || "").trim();
    const slug = (f[IDX.slug] || "").trim();
    const content = sanitizeBlogHtml(f[IDX.content_html] || "");
    const excerpt =
      (f[IDX.excerpt] && f[IDX.excerpt].trim()) || excerptFromHtml(content);
    const category = CLUSTER_CATEGORY[clusterId] || "News";
    const tags = parseTags(f[IDX.secondary_keywords]);
    const ts = new Date(BASE_TS + id * 3600 * 1000); // 1 час между статьями
    return { id, title, slug, content, excerpt, category, tags, ts };
  }).filter((p) => p.slug && p.title && p.content);

  console.log(`Prepared ${posts.length} valid posts. Connecting DB ...`);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  const BATCH = 200;
  let inserted = 0;
  for (let b = 0; b < posts.length; b += BATCH) {
    const chunk = posts.slice(b, b + BATCH);
    const values = [];
    const params = [];
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
    const q = `
      INSERT INTO blog_posts
        (title, slug, content, excerpt, category, created_by, tags,
         is_published, published_at, created_at, updated_at)
      VALUES ${values.join(",")}
      ON CONFLICT (slug) DO NOTHING`;
    const res = await client.query(q, params);
    inserted += res.rowCount;
    process.stdout.write(`\r  inserted ${inserted} / ${posts.length}`);
  }
  process.stdout.write("\n");

  const total = await client.query(
    "SELECT count(*)::int AS n, count(*) FILTER (WHERE is_published)::int AS pub FROM blog_posts WHERE deleted_at IS NULL",
  );
  const byCat = await client.query(
    "SELECT category, count(*)::int AS n FROM blog_posts WHERE deleted_at IS NULL GROUP BY category ORDER BY n DESC",
  );
  console.log(`Inserted (new): ${inserted}`);
  console.log(`Total posts: ${total.rows[0].n} (published: ${total.rows[0].pub})`);
  console.log("By category:", byCat.rows.map((r) => `${r.category}=${r.n}`).join(", "));
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
