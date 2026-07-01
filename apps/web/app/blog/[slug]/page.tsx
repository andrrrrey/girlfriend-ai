import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resizedMediaUrl } from "../../../lib/api";
import { localizeOption } from "../../../lib/optionLabel";
import { getBlogPostForSeo, type BlogPostSeo } from "../../../lib/serverApi";

// ISR: страница записи кэшируется на час (как у персонажей).
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getBlogPostForSeo(params.slug);
  if (!post) {
    return { title: "Post not found" };
  }
  const description =
    (post.excerpt || plainText(post.content)).replace(/\s+/g, " ").slice(0, 160) ||
    `Read "${post.title}" on our blog.`;
  const ogImage = post.coverImageUrl
    ? resizedMediaUrl(post.coverImageUrl, { w: 1080 }) ?? undefined
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
    ? resizedMediaUrl(post.coverImageUrl, { w: 1080 }) ?? post.coverImageUrl
    : null;
  const tags = post.tags || [];

  return (
    <article className="seo-detail">
      <style>{detailCss}</style>

      {img && (
        <div className="seo-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={post.title} className="seo-hero-img" />
        </div>
      )}

      <header className="seo-detail-head">
        <h1 className="seo-detail-title">{post.title}</h1>
        {tags.length > 0 && (
          <div className="seo-detail-tags">
            {tags.map((tg) => (
              <span key={tg} className="seo-detail-tag">
                {localizeOption(tg, "en")}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Тело записи — HTML из редактора (санитизирован на бэкенде). */}
      <section className="seo-section">
        <div className="seo-prose" dangerouslySetInnerHTML={{ __html: post.content }} />
      </section>

      <div className="seo-back">
        <Link href="/blog">← Browse all posts</Link>
      </div>
    </article>
  );
}

const detailCss = `
  .seo-detail { max-width: 820px; margin: 0 auto; padding: 24px 24px 64px; }
  .seo-hero {
    width: 100%; border-radius: 14px; overflow: hidden; margin-bottom: 24px;
    border: 1px solid #313131; background: #0d0d0d;
    display: flex; align-items: center; justify-content: center;
  }
  .seo-hero-img { max-width: 100%; max-height: 460px; width: auto; height: auto; object-fit: contain; display: block; }
  .seo-detail-head { margin-bottom: 20px; }
  .seo-detail-title { font-size: 38px; font-weight: 800; line-height: 1.05; color: #fff; margin: 0 0 12px; }
  .seo-detail-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .seo-detail-tag {
    background: rgba(255,153,206,0.55); border-radius: 6px; padding: 4px 10px;
    font-size: 12px; font-weight: 500; color: #fff;
  }
  .seo-section { margin-bottom: 36px; }
  /* Типографика тела: те же цвета/ритм, что и у страницы персонажа. */
  .seo-prose { font-size: 16px; line-height: 1.7; color: #cfd3e6; }
  .seo-prose p { margin: 0 0 16px; }
  .seo-prose h2 { font-size: 24px; font-weight: 700; color: #fff; margin: 28px 0 14px; }
  .seo-prose h3 { font-size: 20px; font-weight: 700; color: #fff; margin: 22px 0 12px; }
  .seo-prose ul, .seo-prose ol { padding-left: 24px; margin: 0 0 16px; }
  .seo-prose li { margin: 0 0 6px; }
  .seo-prose blockquote { border-left: 3px solid #f95bad; margin: 0 0 16px; padding-left: 16px; color: #b9b9b9; }
  .seo-prose a { color: #ff99ce; text-decoration: underline; }
  .seo-prose img { max-width: 100%; height: auto; border-radius: 10px; margin: 12px 0; }
  .seo-back { margin-top: 24px; }
  .seo-back a { color: #ff99ce; font-size: 15px; font-weight: 600; text-decoration: none; }
  .seo-back a:hover { text-decoration: underline; }
  @media (max-width: 768px) {
    .seo-detail { padding: 16px 16px 48px; }
    .seo-detail-title { font-size: 28px; }
  }
`;
