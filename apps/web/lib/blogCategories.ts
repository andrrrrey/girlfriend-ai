/**
 * Категории записей блога. "All" — это не категория, а фильтр «все записи»
 * (отсутствие параметра category в URL). Значения должны совпадать с бэкендом
 * (apps/api/src/blog/blog.service.ts → BLOG_CATEGORIES).
 */
export const BLOG_CATEGORIES = ["News", "Updates", "AI", "Relationship"] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

/** Опции сортировки каталога. */
export const BLOG_SORTS = [
  { value: "new", label: "Newest first" },
  { value: "old", label: "Oldest first" },
] as const;
