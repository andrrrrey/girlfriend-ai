import type { Metadata } from "next";
import Link from "next/link";
import { resizedMediaUrl } from "../../lib/api";
import { BLOG_CATEGORIES } from "../../lib/blogCategories";
import { listBlogPostsForSeo, type BlogPostSeo } from "../../lib/serverApi";
import BlogSort from "./BlogSort";

// Рендерим на каждый запрос (SSR): фильтры/сортировка/страница берутся из URL,
// а бэкенд недоступен во время `next build`.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 8; // 4 в ряд × 2 ряда

export const metadata: Metadata = {
  title: "Blog — News, Guides & Stories",
  description:
    "Read our latest blog posts: news, guides and stories about AI companions. Tips, updates and behind-the-scenes.",
};

interface PageProps {
  searchParams: { category?: string; sort?: string; page?: string };
}

/** Убирает HTML-теги для превью-текста карточки. */
function plainText(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

/** «WED» (день недели) + «JAN 10, 2026». */
function formatDate(iso: string | null): { weekday: string; date: string } {
  if (!iso) return { weekday: "", date: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { weekday: "", date: "" };
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase(),
  };
}

/** URL каталога с сохранением активных параметров. */
function catalogHref(opts: { category?: string; sort?: string; page?: number }): string {
  const p = new URLSearchParams();
  if (opts.category) p.set("category", opts.category);
  if (opts.sort && opts.sort !== "new") p.set("sort", opts.sort);
  if (opts.page && opts.page > 1) p.set("page", String(opts.page));
  const s = p.toString();
  return s ? `/blog?${s}` : "/blog";
}

/** Номера страниц с многоточиями: 1 2 3 4 5 … 21. */
function pageItems(current: number, total: number): (number | "...")[] {
  const out: (number | "...")[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
      out.push(i);
    } else if (out[out.length - 1] !== "...") {
      out.push("...");
    }
  }
  return out;
}

export default async function BlogCatalogPage({ searchParams }: PageProps) {
  const category =
    typeof searchParams.category === "string" &&
    BLOG_CATEGORIES.some((c) => c.toLowerCase() === searchParams.category!.toLowerCase())
      ? BLOG_CATEGORIES.find((c) => c.toLowerCase() === searchParams.category!.toLowerCase())
      : undefined;
  const sort = searchParams.sort === "old" ? "old" : "new";
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);

  const { items, total, pageSize } = await listBlogPostsForSeo({ page, limit: PAGE_SIZE, category, sort });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="blog-catalog">
      <style>{catalogCss}</style>

      <h1 className="blog-title">Our Blog</h1>

      <div className="blog-toolbar">
        <div className="blog-filters">
          <Link href={catalogHref({ sort })} className={`blog-chip${!category ? " active" : ""}`}>
            All
          </Link>
          {BLOG_CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={catalogHref({ category: cat, sort })}
              className={`blog-chip${category === cat ? " active" : ""}`}
            >
              {cat}
            </Link>
          ))}
        </div>
        <BlogSort sort={sort} />
      </div>

      {items.length === 0 ? (
        <p className="blog-empty">No posts yet. Check back soon.</p>
      ) : (
        <div className="blog-grid">
          {items.map((post: BlogPostSeo) => {
            const img = post.coverImageUrl ? resizedMediaUrl(post.coverImageUrl, { w: 600 }) ?? post.coverImageUrl : null;
            const { weekday, date } = formatDate(post.publishedAt || post.createdAt);
            const preview = (post.excerpt || plainText(post.content)).slice(0, 140);
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="blog-card">
                <div className="blog-card-media">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} loading="lazy" decoding="async" alt={post.title} />
                  ) : (
                    <div className="blog-card-placeholder" />
                  )}
                  <span className="blog-card-badge">{post.category}</span>
                  <div className="blog-card-hover">
                    <span className="blog-card-viewbtn">
                      View post <span className="blog-card-dot" />
                    </span>
                  </div>
                </div>
                <div className="blog-card-meta">
                  <span className="blog-card-weekday">{weekday}</span>
                  <span className="blog-card-date">{date}</span>
                </div>
                <h2 className="blog-card-title">{post.title}</h2>
                <p className="blog-card-excerpt">{preview}…</p>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="blog-pagination" aria-label="Pagination">
          {pageItems(page, totalPages).map((it, i) =>
            it === "..." ? (
              <span key={`e${i}`} className="blog-page-ellipsis">
                …
              </span>
            ) : (
              <Link
                key={it}
                href={catalogHref({ category, sort, page: it })}
                className={`blog-page${it === page ? " active" : ""}`}
              >
                {it}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

const catalogCss = `
  .blog-catalog { width: 100%; max-width: 1360px; margin: 0 auto; padding: 32px 32px 72px; box-sizing: border-box; }
  .blog-title { text-align: center; font-size: 44px; font-weight: 800; color: #fff; margin: 8px 0 32px; }

  .blog-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 28px; }
  .blog-filters { display: flex; flex-wrap: wrap; gap: 8px; }
  .blog-chip {
    padding: 8px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; text-decoration: none;
    color: #cfcfcf; background: #161616; border: 1px solid #262626; transition: all .15s ease;
  }
  .blog-chip:hover { border-color: #3d3d3d; color: #fff; }
  .blog-chip.active {
    color: #fff; border-color: rgba(249,91,173,0.55);
    background: linear-gradient(90deg, rgba(249,91,173,0.30), rgba(255,0,132,0.18));
  }

  .blog-sort { position: relative; }
  .blog-sort-btn {
    display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px;
    background: #161616; border: 1px solid #262626; color: #cfcfcf; cursor: pointer;
    font-size: 14px; font-family: inherit;
  }
  .blog-sort-btn:hover { border-color: #3d3d3d; }
  .blog-sort-label { color: #8a8a8a; }
  .blog-sort-value { color: #fff; font-weight: 600; }
  .blog-sort-menu {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 180px;
    background: #161616; border: 1px solid #2a2a2a; border-radius: 10px; padding: 6px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.5);
  }
  .blog-sort-item {
    display: block; width: 100%; text-align: left; padding: 9px 12px; border-radius: 7px;
    background: transparent; border: none; color: #cfcfcf; cursor: pointer; font-size: 14px; font-family: inherit;
  }
  .blog-sort-item:hover { background: #202020; color: #fff; }
  .blog-sort-item.active { color: #ff99ce; }

  .blog-empty { color: #969696; font-size: 15px; }

  /* 4 в ряд × 2 ряда на десктопе. */
  .blog-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .blog-card {
    display: block; text-decoration: none; background: #0e0e0e; border: 1px solid #1f1f1f;
    border-radius: 16px; padding: 10px; transition: border-color .18s ease;
  }
  .blog-card:hover { border-color: #3a3a3a; }
  .blog-card-media { position: relative; width: 100%; aspect-ratio: 16 / 10; border-radius: 11px; overflow: hidden; background: #161616; }
  .blog-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .blog-card-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg,#2d1b3d,#1a0a2e 55%,#0d0d1a); }
  .blog-card-badge {
    position: absolute; top: 12px; left: 12px; padding: 5px 14px; border-radius: 8px;
    background: rgba(206,127,183,0.92); color: #fff; font-size: 13px; font-weight: 600;
  }
  .blog-card-hover {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(8,8,8,0.45); opacity: 0; transition: opacity .18s ease;
  }
  .blog-card:hover .blog-card-hover { opacity: 1; }
  .blog-card-viewbtn {
    display: inline-flex; align-items: center; gap: 10px; padding: 11px 20px; border-radius: 11px;
    background: #1b1b1b; border: 1px solid #333; color: #fff; font-size: 15px; font-weight: 600;
  }
  .blog-card-dot { width: 9px; height: 9px; border-radius: 50%; background: #34d17a; box-shadow: 0 0 8px #34d17a; }
  .blog-card-meta { display: flex; justify-content: space-between; align-items: center; margin: 14px 4px 0; }
  .blog-card-weekday { color: #8bbf5a; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; }
  .blog-card-date { color: #8a8a8a; font-size: 12px; letter-spacing: 0.04em; }
  .blog-card-title {
    margin: 10px 4px 6px; color: #fff; font-size: 19px; font-weight: 700; line-height: 1.25;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .blog-card-excerpt {
    margin: 0 4px 6px; color: #8a8a8a; font-size: 13.5px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .blog-pagination { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 44px; }
  .blog-page {
    min-width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center;
    padding: 0 10px; border-radius: 8px; color: #cfcfcf; text-decoration: none; font-size: 14px;
    border: 1px solid transparent; transition: all .15s ease;
  }
  .blog-page:hover { background: #1a1a1a; color: #fff; }
  .blog-page.active { background: #1a1a1a; border-color: #3a3a3a; color: #fff; font-weight: 700; }
  .blog-page-ellipsis { color: #6a6a6a; padding: 0 6px; }

  @media (max-width: 1200px) { .blog-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 860px) {
    .blog-catalog { padding: 24px 16px 56px; }
    .blog-title { font-size: 32px; }
    .blog-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .blog-card-title { font-size: 16px; }
  }
  @media (max-width: 520px) { .blog-grid { grid-template-columns: 1fr; } }
`;
