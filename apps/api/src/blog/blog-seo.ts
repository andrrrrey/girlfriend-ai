import type { PrismaService } from "../prisma.service";
import { toUrlSlug } from "../chats/character-seo";

/**
 * Возвращает уникальный slug записи блога на основе заголовка: base, base-2, ...
 * В отличие от персонажей, у записи блога slug хранится в отдельной колонке
 * (`blogPost.slug`, UNIQUE), поэтому проверка идёт по ней. excludeId исключает
 * саму запись при обновлении.
 */
export async function uniqueBlogSlug(
  prisma: PrismaService,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = toUrlSlug(title);
  let slug = base;
  let n = 2;
  for (let guard = 0; guard < 1000; guard++) {
    const existing = await prisma.blogPost.findFirst({
      where: {
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Грубая, но безопасная санитизация HTML из редактора (контент пишет только
 * админ, поэтому цель — исключить XSS-векторы, а не отфильтровать разметку):
 * вырезает опасные теги целиком, обработчики событий (on*) и javascript:-URI.
 */
export function sanitizeBlogHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * Строит excerpt (meta description) из HTML-тела: снимает теги, схлопывает
 * пробелы и обрезает до ~160 символов на границе слова.
 */
export function excerptFromHtml(html: string, max = 160): string {
  const text = (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}
