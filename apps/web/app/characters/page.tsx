import type { Metadata } from "next";
import Link from "next/link";
import { resizedMediaUrl } from "../../lib/api";
import { listCharactersForSeo } from "../../lib/serverApi";

// Рендерим на каждый запрос (SSR), а НЕ пререндерим при сборке: в CI бэкенд
// недоступен во время `next build`, иначе каталог запёкся бы пустым. Содержимое
// всё равно попадает в исходный HTML (SSR) — поисковики его видят.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Characters — Browse All Companions",
  description:
    "Browse our full catalog of AI companions. Discover unique personalities, explore their bios and start chatting with your perfect AI girlfriend.",
};

/** Возраст из personality для подписи на карточке. */
function ageOf(personality: Record<string, unknown> | null): string {
  const age = personality?.["age"];
  return age ? ` ${age}` : "";
}

export default async function CharactersCatalogPage() {
  const characters = await listCharactersForSeo({ limit: 60 });

  return (
    <div className="seo-catalog">
      <style>{catalogCss}</style>

      <header className="seo-catalog-head">
        <h1 className="seo-catalog-title">
          Browse All <span className="pink">AI Characters</span>
        </h1>
        <p className="seo-catalog-sub">
          Explore every companion, read their story and start a conversation.
        </p>
      </header>

      {characters.length === 0 ? (
        <p className="seo-catalog-empty">No characters yet. Check back soon.</p>
      ) : (
        <div className="seo-cards-row">
          {characters.map((char) => {
            const personality = (char.personality as Record<string, unknown> | null) || {};
            const label = `${char.name}${ageOf(personality)}`;
            const img = char.avatarUrl
              ? resizedMediaUrl(char.avatarUrl, { w: 400 }) ?? char.avatarUrl
              : null;
            const tags = (char.tags || []).slice(0, 3);
            return (
              <Link
                key={char.id}
                href={`/characters/${char.id}`}
                className="seo-card-wrap"
                aria-label={char.name}
              >
                <div className="seo-card">
                  <div className="seo-card-bg">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} loading="lazy" decoding="async" alt={char.name} />
                    ) : (
                      <div className="seo-card-placeholder" />
                    )}
                    <div className="seo-card-overlay" />
                  </div>
                  <div className="seo-card-info">
                    <div className="seo-card-name">{label}</div>
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
  .seo-catalog { max-width: 1180px; margin: 0 auto; padding: 32px 24px 64px; }
  .seo-catalog-head { margin-bottom: 28px; }
  .seo-catalog-title { font-size: 34px; font-weight: 700; line-height: 1.1; color: #fff; margin: 0 0 8px; }
  .seo-catalog-title .pink { color: #ff99ce; }
  .seo-catalog-sub { color: #969696; font-size: 15px; margin: 0; }
  .seo-catalog-empty { color: #969696; font-size: 15px; }
  .seo-cards-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
  .seo-card-wrap { position: relative; width: 100%; aspect-ratio: 22 / 30; display: block; text-decoration: none; }
  .seo-card {
    border: 1px solid #313131; border-radius: 8px; width: 100%; height: 100%;
    overflow: hidden; position: relative; display: flex; flex-direction: column;
    justify-content: flex-end; padding: 10px; transition: border-color 0.2s ease;
  }
  .seo-card-wrap:hover .seo-card { border-color: #5b5b5b; }
  .seo-card-bg { position: absolute; inset: 0; pointer-events: none; border-radius: 8px; }
  .seo-card-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  .seo-card-placeholder { position: absolute; inset: 0; border-radius: 8px; background: linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%); }
  .seo-card-overlay { position: absolute; inset: 0; border-radius: 8px; background: linear-gradient(to bottom, rgba(9,9,9,0) 50%, rgba(9,9,9,0.85) 100%); }
  .seo-card-info { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 6px; }
  .seo-card-name { font-size: 19px; font-weight: 700; color: #fff; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .seo-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .seo-card-tag {
    background: rgba(255,153,206,0.55); backdrop-filter: blur(2px);
    border-radius: 4px; padding: 3px 7px; font-size: 9px; font-weight: 500; color: #fff; white-space: nowrap;
  }
  @media (max-width: 768px) {
    .seo-catalog { padding: 20px 16px 48px; }
    .seo-catalog-title { font-size: 24px; }
    .seo-cards-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .seo-card-name { font-size: 15px; }
  }
`;
