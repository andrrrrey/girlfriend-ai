import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resizedMediaUrl } from "../../../lib/api";
import { getBlogPostForSeo, type BlogPostSeo } from "../../../lib/serverApi";

// ISR: страница записи кэшируется на час.
export const revalidate = 3600;

interface PageProps {
  params: { slug: string };
}

/** Снимает HTML-теги для meta description. */
function plainText(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «WED» + «JAN 10, 2026». */
function formatDate(iso: string | null): { weekday: string; date: string } {
  if (!iso) return { weekday: "", date: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { weekday: "", date: "" };
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase(),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getBlogPostForSeo(params.slug);
  if (!post) {
    return { title: "Post not found" };
  }
  const description =
    (post.excerpt || plainText(post.content)).replace(/\s+/g, " ").slice(0, 160) ||
    `Read "${post.title}" on our blog.`;
  const ogImage = post.coverImageUrl
    ? resizedMediaUrl(post.coverImageUrl, { w: 1200 }) ?? undefined
    : undefined;

  return {
    title: `${post.title} — Blog`,
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function BlogDetailPage({ params }: PageProps) {
  const post: BlogPostSeo | null = await getBlogPostForSeo(params.slug);
  if (!post) notFound();

  const img = post.coverImageUrl
    ? resizedMediaUrl(post.coverImageUrl, { w: 1400 }) ?? post.coverImageUrl
    : null;
  const { weekday, date } = formatDate(post.publishedAt || post.createdAt);

  return (
    <article className="blog-detail">
      <style>{detailCss}</style>

      <div className="blog-detail-back">
        <Link href="/blog">← BACK TO BLOG</Link>
      </div>

      {img && (
        <div className="blog-detail-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={post.title} />
          <span className="blog-detail-badge">{post.category}</span>
        </div>
      )}

      <div className="blog-detail-body">
        <div className="blog-detail-meta">
          <span className="blog-detail-weekday">{weekday}</span>
          <span className="blog-detail-date">{date}</span>
        </div>

        <h1 className="blog-detail-title">{post.title}</h1>

        {/* Тело записи — HTML из редактора (санитизирован на бэкенде). */}
        <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.content }} />

        <div className="blog-detail-foot">
          <Link href="/blog">← Browse all posts</Link>
        </div>
      </div>
    </article>
  );
}

const detailCss = `
  .blog-detail { width: 100%; max-width: 1120px; margin: 0 auto; padding: 24px 24px 80px; box-sizing: border-box; }
  .blog-detail-back { margin-bottom: 20px; }
  .blog-detail-back a { color: #9a9a9a; font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-decoration: none; }
  .blog-detail-back a:hover { color: #fff; }

  .blog-detail-hero {
    position: relative; width: 100%; border-radius: 16px; overflow: hidden;
    border: 1px solid #262626; background: #0d0d0d; aspect-ratio: 16 / 8; max-height: 520px;
  }
  .blog-detail-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .blog-detail-badge {
    position: absolute; top: 16px; left: 16px; padding: 6px 16px; border-radius: 8px;
    background: rgba(206,127,183,0.92); color: #fff; font-size: 13px; font-weight: 600;
  }

  /* Контент немного уже героя, но заметно шире прежнего (для читабельности). */
  .blog-detail-body { max-width: 900px; margin: 0 auto; padding-top: 28px; }
  .blog-detail-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .blog-detail-weekday { color: #8bbf5a; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; }
  .blog-detail-date { color: #8bbf5a; font-size: 13px; font-weight: 600; letter-spacing: 0.04em; }
  .blog-detail-title { font-size: 48px; font-weight: 800; line-height: 1.08; color: #fff; margin: 0 0 28px; }

  .blog-prose { font-size: 17px; line-height: 1.75; color: #cfd3e6; }
  .blog-prose p { margin: 0 0 18px; }
  .blog-prose h2 { font-size: 28px; font-weight: 700; color: #fff; margin: 34px 0 16px; }
  .blog-prose h3 { font-size: 22px; font-weight: 700; color: #fff; margin: 26px 0 12px; }
  .blog-prose ul, .blog-prose ol { padding-left: 26px; margin: 0 0 18px; }
  .blog-prose li { margin: 0 0 8px; }
  .blog-prose blockquote { border-left: 3px solid #f95bad; margin: 0 0 18px; padding-left: 18px; color: #b9b9b9; }
  .blog-prose a { color: #ff99ce; text-decoration: underline; }
  .blog-prose img { max-width: 100%; height: auto; border-radius: 12px; margin: 14px 0; }

  .blog-detail-foot { margin-top: 40px; }
  .blog-detail-foot a { color: #ff99ce; font-size: 15px; font-weight: 600; text-decoration: none; }
  .blog-detail-foot a:hover { text-decoration: underline; }

  @media (max-width: 768px) {
    .blog-detail { padding: 16px 16px 56px; }
    .blog-detail-hero { aspect-ratio: 16 / 10; }
    .blog-detail-title { font-size: 32px; }
    .blog-prose { font-size: 16px; }
  }
`;
