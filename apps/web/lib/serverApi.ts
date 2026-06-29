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
export async function listCharactersForSeo(opts?: { limit?: number }): Promise<Character[]> {
  const limit = opts?.limit ?? 60;
  let res: Response;
  try {
    // no-store: каталог рендерится динамически и должен сразу отражать свежие
    // данные (новые персонажи, проставленные slug'и после бэкфилла), а не
    // отдавать закэшированный на час ответ.
    res = await fetch(`${API_URL}/characters?limit=${limit}`, {
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return (data?.items as Character[]) ?? [];
}
