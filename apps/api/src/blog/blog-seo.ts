import type { PrismaService } from "../prisma.service";

/** Таблица транслитерации кириллицы (RU/UK) в латиницу для slug'ов. */
const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g",
};

/**
 * URL-slug записи блога из заголовка: сначала транслитерируем кириллицу в
 * латиницу (чтобы русские заголовки давали читаемый URL, а не фолбэк), затем —
 * та же нормализация, что у персонажей (lowercase, только a-z0-9, разделитель
 * «-», максимум 60 символов). Пустой результат → фолбэк "post".
 */
export function toBlogSlug(title: string): string {
  const transliterated = (title || "")
    .toLowerCase()
    .replace(/[а-яёіїєґ]/g, (ch) => CYRILLIC_MAP[ch] ?? "");
  const slug = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "post";
}

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
  const base = toBlogSlug(title);
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
