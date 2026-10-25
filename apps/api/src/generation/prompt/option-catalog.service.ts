/**
 * @file option-catalog.service.ts
 * @description Каталог опций генерации для серверной сборки промпта и роутера намерений.
 *
 * - Загружает все опции в том же порядке, что пикеры на фронте (категории по
 *   order, опции по order/createdAt), кэширует на CACHE_TTL_MS.
 * - В SFW-режиме NSFW-опции исключаются — как в пикерах.
 * - Заполняет недостающие slug (новые опции из админки и сидов) функцией slugify:
 *   при старте и периодически, под распределённым локом.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { SchedulerService } from "../../common/scheduler.service";
import { slugify } from "./slug";
import type { CatalogOption, OptionCatalog } from "./prompt-composer";

const CACHE_TTL_MS = 60_000;
const SLUG_BACKFILL_INTERVAL_MS = 10 * 60_000;

type RawOption = {
  id: string;
  name: string;
  slug: string | null;
  prompt: string | null;
  synonyms: string[];
  nsfw: boolean;
  category?: string;
  generationStyle?: string | null;
};

function toCatalogOption(o: RawOption): CatalogOption {
  return {
    id: o.id,
    slug: o.slug || slugify(o.name),
    name: o.name,
    prompt: o.prompt,
    synonyms: o.synonyms ?? [],
    nsfw: o.nsfw,
    ...(o.category !== undefined ? { category: o.category } : {}),
    ...(o.generationStyle !== undefined ? { generationStyle: o.generationStyle } : {}),
  };
}

@Injectable()
export class OptionCatalogService implements OnModuleInit {
  private readonly logger = new Logger(OptionCatalogService.name);
  private cache: { at: number; catalog: OptionCatalog } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    void this.scheduler.runExclusive("option-slug-backfill", () => this.backfillSlugs());
    this.scheduler.scheduleInterval("option-slug-backfill", SLUG_BACKFILL_INTERVAL_MS, () => this.backfillSlugs());
  }

  /**
   * Каталог опций.
   * @param contentMode — "sfw" исключает NSFW-опции (как пикеры в SFW-режиме)
   */
  async get(contentMode?: "nsfw" | "sfw"): Promise<OptionCatalog> {
    const full = await this.loadFull();
    if (contentMode !== "sfw") return full;
    const sfw = (list: CatalogOption[]) => list.filter((o) => !o.nsfw);
    return {
      character: sfw(full.character),
      appearance: { OUTFITS: sfw(full.appearance.OUTFITS), OUTFIT_DETAILS: sfw(full.appearance.OUTFIT_DETAILS) },
      pose: { FACIAL_EXPRESSION: sfw(full.pose.FACIAL_EXPRESSION), POSE: sfw(full.pose.POSE) },
      scene: { LOCATION: sfw(full.scene.LOCATION) },
      camera: { FRAMING: sfw(full.camera.FRAMING), CAMERA_ANGLE: sfw(full.camera.CAMERA_ANGLE) },
    };
  }

  /** Сбросить кэш (после изменения опций в админке). */
  invalidate(): void {
    this.cache = null;
  }

  private async loadFull(): Promise<OptionCatalog> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.catalog;

    const optionSelect = { id: true, name: true, slug: true, prompt: true, synonyms: true, nsfw: true } as const;
    const optionOrder = [{ order: "asc" as const }, { createdAt: "asc" as const }];
    const categoryOrder = [{ tab: "asc" as const }, { order: "asc" as const }];

    const [character, appearance, pose, scene, camera] = await Promise.all([
      this.prisma.characterOption.findMany({
        select: { ...optionSelect, category: true, generationStyle: true },
        orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.appearanceCategory.findMany({
        orderBy: categoryOrder,
        select: { tab: true, options: { select: optionSelect, orderBy: optionOrder } },
      }),
      this.prisma.poseCategory.findMany({
        orderBy: categoryOrder,
        select: { tab: true, options: { select: optionSelect, orderBy: optionOrder } },
      }),
      this.prisma.sceneCategory.findMany({
        orderBy: categoryOrder,
        select: { tab: true, options: { select: optionSelect, orderBy: optionOrder } },
      }),
      this.prisma.cameraOption.findMany({
        select: { ...optionSelect, section: true },
        orderBy: [{ section: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const byTab = (cats: { tab: string; options: RawOption[] }[], tab: string) =>
      cats.filter((c) => c.tab === tab).flatMap((c) => c.options.map(toCatalogOption));

    const catalog: OptionCatalog = {
      character: character.map(toCatalogOption),
      appearance: { OUTFITS: byTab(appearance, "OUTFITS"), OUTFIT_DETAILS: byTab(appearance, "OUTFIT_DETAILS") },
      pose: { FACIAL_EXPRESSION: byTab(pose, "FACIAL_EXPRESSION"), POSE: byTab(pose, "POSE") },
      scene: { LOCATION: byTab(scene, "LOCATION") },
      camera: {
        FRAMING: camera.filter((o) => o.section === "FRAMING").map(toCatalogOption),
        CAMERA_ANGLE: camera.filter((o) => o.section === "CAMERA_ANGLE").map(toCatalogOption),
      },
    };
    this.cache = { at: Date.now(), catalog };
    return catalog;
  }

  /** Проставляет slug опциям, у которых его ещё нет. Существующие slug не меняются. */
  async backfillSlugs(): Promise<void> {
    const tables = [
      this.prisma.characterOption,
      this.prisma.appearanceOption,
      this.prisma.poseOption,
      this.prisma.sceneOption,
      this.prisma.cameraOption,
    ] as unknown as {
      findMany(args: unknown): Promise<{ id: string; name: string }[]>;
      update(args: unknown): Promise<unknown>;
    }[];

    let updated = 0;
    for (const table of tables) {
      const rows = await table.findMany({ where: { slug: null }, select: { id: true, name: true } });
      for (const row of rows) {
        const slug = slugify(row.name);
        if (!slug) continue;
        await table.update({ where: { id: row.id }, data: { slug } });
        updated++;
      }
    }
    if (updated) {
      this.cache = null;
      this.logger.log(`option slugs backfilled: ${updated}`);
    }
  }
}
