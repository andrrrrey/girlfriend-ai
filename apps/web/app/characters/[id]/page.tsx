import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resizedMediaUrl } from "../../../lib/api";
import { localizeOption } from "../../../lib/optionLabel";
import { getCharacterForSeo, type SeoCharacter } from "../../../lib/serverApi";
import CharacterPageActions from "./CharacterPageActions";

// ISR: после первой генерации био страница кэшируется на час.
export const revalidate = 3600;

interface PageProps {
  params: { id: string };
}

/** Поля personality для таблицы «внешних данных» — порядок и человекочитаемые лейблы. */
const FACT_ROWS: { key: string; label: string }[] = [
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "orientation", label: "Orientation" },
  { key: "ethnicity", label: "Ethnicity" },
  { key: "nationality", label: "Nationality" },
  { key: "eyeColor", label: "Eyes" },
  { key: "hairColor", label: "Hair color" },
  { key: "hairStyle", label: "Hair style" },
  { key: "bodyType", label: "Body type" },
  { key: "breastSize", label: "Bust" },
  { key: "buttSize", label: "Butt" },
  { key: "personality", label: "Personality" },
  { key: "relationshipType", label: "Relationship" },
  { key: "familyStatus", label: "Family status" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "hobbies", label: "Hobbies" },
  { key: "work", label: "Occupation" },
];

/** Превращает значение personality (строка/число/массив) в человекочитаемую строку EN. */
function factValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => localizeOption(String(x), "en")).filter(Boolean).join(", ");
  if (typeof v === "number") return String(v);
  const s = String(v).trim();
  return /^\d+$/.test(s) ? s : localizeOption(s, "en");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = params.id;
  const character = await getCharacterForSeo(id);
  if (!character) {
    return { title: "Character not found" };
  }
  const personality = (character.personality as Record<string, unknown> | null) || {};
  const age = personality["age"];
  const titleSuffix = age ? `, ${age}` : "";
  const description =
    (character.seo?.bio || "").replace(/\s+/g, " ").slice(0, 160) ||
    `Meet ${character.name}, an AI companion. Read her bio and start chatting.`;
  const ogImage = character.avatarUrl
    ? resizedMediaUrl(character.avatarUrl, { w: 1080 }) ?? undefined
    : undefined;

  return {
    title: `${character.name}${titleSuffix} — AI Companion`,
    description,
    openGraph: {
      title: `${character.name}${titleSuffix} — AI Companion`,
      description,
      type: "profile",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function CharacterDetailPage({ params }: PageProps) {
  const character: SeoCharacter | null = await getCharacterForSeo(params.id);
  if (!character) notFound();

  const personality = (character.personality as Record<string, unknown> | null) || {};
  const age = personality["age"];
  const heading = age ? `${character.name}, ${age}` : character.name;
  const img = character.avatarUrl
    ? resizedMediaUrl(character.avatarUrl, { w: 1080 }) ?? character.avatarUrl
    : null;
  const tags = character.tags || [];

  const facts = FACT_ROWS.map((row) => ({ label: row.label, value: factValue(personality[row.key]) })).filter(
    (f) => f.value,
  );

  const bioParagraphs = (character.seo?.bio || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const appearance = (character.seo?.appearance || "").trim();

  return (
    <article className="seo-detail">
      <style>{detailCss}</style>

      {img && (
        <div className="seo-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={character.name} className="seo-hero-img" />
        </div>
      )}

      <header className="seo-detail-head">
        <h1 className="seo-detail-title">{heading}</h1>
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

      <CharacterPageActions characterId={character.id} />

      {facts.length > 0 && (
        <section className="seo-section">
          <h2 className="seo-section-title">Appearance &amp; Details</h2>
          <dl className="seo-facts">
            {facts.map((f) => (
              <div key={f.label} className="seo-fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {appearance && (
        <section className="seo-section">
          <h2 className="seo-section-title">Looks</h2>
          <p className="seo-prose">{appearance}</p>
        </section>
      )}

      {bioParagraphs.length > 0 && (
        <section className="seo-section">
          <h2 className="seo-section-title">Biography</h2>
          {bioParagraphs.map((p, i) => (
            <p key={i} className="seo-prose">
              {p}
            </p>
          ))}
        </section>
      )}

      <div className="seo-back">
        <Link href="/characters">← Browse all characters</Link>
      </div>
    </article>
  );
}

const detailCss = `
  .seo-detail { max-width: 820px; margin: 0 auto; padding: 24px 24px 64px; }
  /* Картинка показывается целиком (contain), без кадрирования; компактная высота. */
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
  .seo-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 32px; }
  .seo-cta-primary, .seo-cta-secondary {
    padding: 12px 26px; border-radius: 999px; border: none; font-size: 15px; font-weight: 700;
    cursor: pointer; font-family: inherit; color: #fff;
  }
  .seo-cta-primary { background: linear-gradient(90deg, #f95bad, #ff0084); }
  .seo-cta-secondary { background: rgba(48,39,43,0.6); border: 1px solid rgba(255,255,255,0.14); }
  .seo-like { display: flex; align-items: center; }
  .seo-section { margin-bottom: 36px; }
  .seo-section-title { font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 16px; }
  .seo-facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: #313131; border: 1px solid #313131; border-radius: 12px; overflow: hidden; margin: 0; }
  .seo-fact { background: #121212; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
  .seo-fact dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #848484; }
  .seo-fact dd { font-size: 15px; color: #fff; margin: 0; }
  .seo-prose { font-size: 16px; line-height: 1.7; color: #cfd3e6; margin: 0 0 16px; }
  .seo-back { margin-top: 24px; }
  .seo-back a { color: #ff99ce; font-size: 15px; font-weight: 600; text-decoration: none; }
  .seo-back a:hover { text-decoration: underline; }
  @media (max-width: 768px) {
    .seo-detail { padding: 16px 16px 48px; }
    .seo-detail-title { font-size: 28px; }
    .seo-facts { grid-template-columns: 1fr; }
  }
`;
