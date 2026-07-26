/**
 * @file apps/web/lib/serverApi.ts
 * @description Серверные фетчеры для SEO-страниц персонажей (/characters, /characters/[id]).
 *
 * В отличие от lib/api.ts (клиентский, ходит через /api-proxy с JWT из localStorage),
 * эти функции вызываются ТОЛЬКО из серверных компонентов и ходят к бэкенду напрямую
 * по внутреннему URL (process.env.API_INTERNAL_URL — тот же, что в api-proxy route).
 * Использовать их в клиентских компонентах нельзя.
 */

import type { Character } from "./api";

const API_URL = process.env.API_INTERNAL_URL || "http://localhost:8080";

/** Персонаж с публичной SEO-страницы: базовые поля + AI-проза. */
export interface SeoCharacter extends Character {
  seo: { bio: string; appearance: string };
}

/**
 * Загружает персонажа вместе с SEO-описанием (GET /characters/:id/seo).
 * Бэкенд лениво генерит и кэширует bio/appearance при первом обращении.
 * Возвращает null, если персонаж не найден.
 */
export async function getCharacterForSeo(id: string): Promise<SeoCharacter | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/characters/${encodeURIComponent(id)}/seo`, {
      // ISR: первый рендер триггерит генерацию, дальше отдаётся из кэша.
      next: { revalidate: 3600 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || !data.id) return null;
  return data as SeoCharacter;
}

/**
 * Загружает список публичных персонажей для каталога (GET /characters).
 * Без фильтров — просто первые `limit` персонажей (новые первыми).
 */
export async function listCharactersForSeo(opts?: { limit?: number; mode?: string }): Promise<Character[]> {
  const limit = opts?.limit ?? 60;
  // Режим контента (из cookie на сервере): sfw → только SFW, nsfw → только NSFW.
  const modeQs = opts?.mode === "sfw" || opts?.mode === "nsfw" ? `&mode=${opts.mode}` : "";
  let res: Response;
  try {
    // no-store: каталог рендерится динамически и должен сразу отражать свежие
    // данные (новые персонажи, проставленные slug'и после бэкфилла), а не
    // отдавать закэшированный на час ответ.
    res = await fetch(`${API_URL}/characters?limit=${limit}${modeQs}`, {
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return (data?.items as Character[]) ?? [];
}

/** Публичная запись блога для SEO-страницы (/blog/[slug]). */
export interface BlogPostSeo {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string;
  coverImageUrl: string | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
}

/** Постраничный результат каталога блога. */
export interface BlogListResult {
  items: BlogPostSeo[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Загружает одну опубликованную запись блога по slug (GET /blog/:slug).
 * Возвращает null, если запись не найдена/не опубликована.
 */
export async function getBlogPostForSeo(slug: string): Promise<BlogPostSeo | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/blog/${encodeURIComponent(slug)}`, {
      // ISR: страница кэшируется на час (как у персонажей).
      next: { revalidate: 3600 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || !data.id) return null;
  return data as BlogPostSeo;
}

/**
 * Загружает страницу каталога блога (GET /blog) с фильтром по категории,
 * сортировкой и пагинацией. no-store: каталог динамический и сразу отражает
 * новые записи.
 */
export async function listBlogPostsForSeo(opts?: {
  page?: number;
  limit?: number;
  category?: string;
  sort?: string;
}): Promise<BlogListResult> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.category) params.set("category", opts.category);
  if (opts?.sort) params.set("sort", opts.sort);
  const empty: BlogListResult = { items: [], total: 0, page: 1, pageSize: opts?.limit ?? 8 };
  let res: Response;
  try {
    res = await fetch(`${API_URL}/blog?${params.toString()}`, { cache: "no-store" });
  } catch {
    return empty;
  }
  if (!res.ok) return empty;
  const data = await res.json().catch(() => null);
  if (!data) return empty;
  return {
    items: (data.items as BlogPostSeo[]) ?? [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? (opts?.limit ?? 8),
  };
}
