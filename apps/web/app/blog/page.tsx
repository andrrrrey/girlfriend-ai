import type { Metadata } from "next";
import Link from "next/link";
import { resizedMediaUrl } from "../../lib/api";
import { localizeOption } from "../../lib/optionLabel";
import { listBlogPostsForSeo } from "../../lib/serverApi";

// Рендерим на каждый запрос (SSR), как каталог персонажей: бэкенд недоступен
// во время `next build`, а содержимое всё равно попадает в исходный HTML.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog — News, Guides & Stories",
  description:
    "Read our latest blog posts: news, guides and stories about AI companions. Tips, updates and behind-the-scenes.",
};

export default async function BlogCatalogPage() {
  const posts = await listBlogPostsForSeo({ limit: 60 });

  return (
    <div className="seo-catalog">
      <style>{catalogCss}</style>

      <header className="seo-catalog-head">
        <h1 className="seo-catalog-title">
          Our <span className="pink">Blog</span>
        </h1>
        <p className="seo-catalog-sub">News, guides and stories about AI companions.</p>
      </header>

      {posts.length === 0 ? (
        <p className="seo-catalog-empty">No posts yet. Check back soon.</p>
      ) : (
        <div className="seo-cards-row">
          {posts.map((post) => {
            const img = post.coverImageUrl
              ? resizedMediaUrl(post.coverImageUrl, { w: 400 }) ?? post.coverImageUrl
              : null;
            const tags = (post.tags || []).slice(0, 3).map((tg) => localizeOption(tg, "en"));
            return (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="seo-card-wrap"
                aria-label={post.title}
              >
                <div className="seo-card">
                  <div className="seo-card-bg">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} loading="lazy" decoding="async" alt={post.title} />
                    ) : (
                      <div className="seo-card-placeholder" />
                    )}
                    <div className="seo-card-overlay" />
                  </div>
                  <div className="seo-card-info">
                    <div className="seo-card-name">{post.title}</div>
                    {tags.length > 0 && (
                      <div className="seo-card-tags">
                        {tags.map((tg) => (
                          <span key={tg} className="seo-card-tag">
                            {tg}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const catalogCss = `
  .seo-catalog { padding: 28px 36px 64px; }
  .seo-catalog-head { margin-bottom: 24px; }
  .seo-catalog-title { font-size: 32px; font-weight: 700; line-height: 1.1; color: #fff; margin: 0 0 8px; }
  .seo-catalog-title .pink { color: #ff99ce; }
  .seo-catalog-sub { color: #969696; font-size: 15px; margin: 0; }
  .seo-catalog-empty { color: #969696; font-size: 15px; }
  /* Плотная сетка, как в каталоге персонажей. */
  .seo-cards-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .seo-card-wrap { position: relative; width: 100%; aspect-ratio: 22 / 30; display: block; text-decoration: none; }
  .seo-card {
    border: 1px solid #313131; border-radius: 8px; width: 100%; height: 100%;
    overflow: hidden; position: relative; display: flex; flex-direction: column;
    justify-content: flex-end; padding: 8px; transition: border-color 0.2s ease;
  }
  .seo-card-wrap:hover .seo-card { border-color: #5b5b5b; }
  .seo-card-bg { position: absolute; inset: 0; pointer-events: none; border-radius: 8px; }
  .seo-card-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  .seo-card-placeholder { position: absolute; inset: 0; border-radius: 8px; background: linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%); }
  .seo-card-overlay { position: absolute; inset: 0; border-radius: 8px; background: linear-gradient(to bottom, rgba(9,9,9,0) 50%, rgba(9,9,9,0.85) 100%); }
  .seo-card-info { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 5px; }
  .seo-card-name { font-size: 17px; font-weight: 700; color: #fff; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .seo-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .seo-card-tag {
    background: rgba(255,153,206,0.55); backdrop-filter: blur(2px);
    border-radius: 4px; padding: 3px 6px; font-size: 8px; font-weight: 500; color: #fff; white-space: nowrap;
  }
  @media (max-width: 768px) {
    .seo-catalog { padding: 20px 16px 48px; }
    .seo-catalog-title { font-size: 22px; }
    .seo-cards-row { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .seo-card-name { font-size: 14px; }
  }
`;
