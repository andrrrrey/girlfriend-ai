import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma.service";
import { generateSeoBio } from "./generate-seo-bio";

/**
 * URL-slug из имени персонажа: lowercase, латиница/цифры, разделитель «-».
 * Диакритика снимается, нелатиница выкидывается. Для пустого результата —
 * фолбэк "companion".
 */
export function toUrlSlug(name: string): string {
  const slug = (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "companion";
}

/**
 * Возвращает уникальный slug на основе имени: base, base-2, base-3 ...
 * Уникальность проверяется по personality.slug (JSON-путь), т.к. отдельной
 * колонки нет. excludeId исключает самого персонажа из проверки.
 */
export async function uniqueSlug(
  prisma: PrismaService,
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = toUrlSlug(name);
  let slug = base;
  let n = 2;
  // Цикл практически всегда завершается на первой-второй итерации.
  for (let guard = 0; guard < 1000; guard++) {
    const existing = await prisma.character.findFirst({
      where: {
        personality: { path: ["slug"], equals: slug },
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return slug;
    slug = `${base}-${n++}`;
  }
  // На всякий случай — гарантированно уникальный хвост.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Гарантирует, что у персонажа есть slug и SEO-описание (bio/appearance).
 * Идемпотентно: генерит только недостающее. Безопасно вызывать в фоне.
 *
 * @throws пробрасывает ошибку генерации (вызывающий решает, логировать или нет)
 */
export async function ensureCharacterSeo(
  prisma: PrismaService,
  characterId: string,
): Promise<void> {
  const character = await prisma.character.findFirst({
    where: { id: characterId, deletedAt: null },
    select: { id: true, name: true, personality: true },
  });
  if (!character) return;

  const personality = (character.personality as Record<string, unknown> | null) || {};
  const seo = personality.seo as { bio?: string } | undefined;
  const hasSlug = typeof personality.slug === "string" && (personality.slug as string).length > 0;
  const hasBio = !!(seo && seo.bio);
  if (hasSlug && hasBio) return;

  const updated: Record<string, unknown> = { ...personality };
  if (!hasSlug) {
    updated.slug = await uniqueSlug(prisma, character.name, character.id);
  }
  if (!hasBio) {
    const generated = await generateSeoBio(character.name, personality);
    updated.seo = { ...generated, version: 1, generatedAt: new Date().toISOString() };
  }

  await prisma.character.update({
    where: { id: character.id },
    data: { personality: updated as Prisma.InputJsonValue },
  });
}

/**
 * Фоновый бэкфилл SEO для всех персонажей: проставляет slug и генерит описание
 * там, где его нет. Запускается БЕЗ await (fire-and-forget): возвращает общее
 * число персонажей сразу, а обработку ведёт последовательно с паузой, чтобы не
 * перегружать AI-провайдера.
 *
 * @returns общее число персонажей, поставленных в очередь
 */
export async function backfillAllCharacterSeo(prisma: PrismaService): Promise<number> {
  const all = await prisma.character.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  void (async () => {
    for (const { id } of all) {
      try {
        await ensureCharacterSeo(prisma, id);
      } catch {
        // Сбойного персонажа пропускаем, продолжаем остальных.
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  })();

  return all.length;
}
