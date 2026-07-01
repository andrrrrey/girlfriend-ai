import type { MetadataRoute } from "next";
import { listCharactersForSeo, listBlogPostsForSeo } from "../lib/serverApi";

// SSR: sitemap строится на каждый запрос, чтобы новые персонажи и записи блога
// попадали в индекс сразу после публикации.
export const dynamic = "force-dynamic";

/** Базовый публичный URL сайта. В проде задаётся через NEXT_PUBLIC_SITE_URL. */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [characters, blog] = await Promise.all([
    listCharactersForSeo({ limit: 200 }).catch(() => []),
    listBlogPostsForSeo({ limit: 48, page: 1 }).catch(() => ({ items: [], total: 0, page: 1, pageSize: 48 })),
  ]);
  const posts = blog.items;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/characters`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: "daily", priority: 0.9 },
  ];

  const characterEntries: MetadataRoute.Sitemap = characters
    .map((c) => {
      const personality = (c.personality as Record<string, unknown> | null) || {};
      const slug = (typeof personality.slug === "string" && personality.slug) || c.id;
      return {
        url: `${SITE_URL}/characters/${slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    });

  const blogEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.publishedAt || p.createdAt || undefined,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...characterEntries, ...blogEntries];
}
