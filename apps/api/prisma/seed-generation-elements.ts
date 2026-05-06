import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface ManifestItem {
  name: string;
  group: string;
  prompt: string;
  file: string;
}

interface ManifestSection {
  title: string;
  folder: string;
  items: Record<string, ManifestItem>;
}

interface Manifest {
  version: number;
  sections: Record<string, ManifestSection>;
}

function imageUrl(filePath: string): string {
  return `/generation-elements/${filePath}`;
}

async function upsertCharacterOptions(
  items: Record<string, ManifestItem>,
  category: string,
  filterGroup?: string,
) {
  const entries = Object.values(items);
  const filtered = filterGroup
    ? entries.filter((it) => it.group === filterGroup)
    : entries;

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    const existing = await prisma.characterOption.findFirst({
      where: { category, name: item.name },
    });
    if (existing) {
      await prisma.characterOption.update({
        where: { id: existing.id },
        data: { prompt: item.prompt, imageUrl: imageUrl(item.file), order: i },
      });
    } else {
      await prisma.characterOption.create({
        data: {
          category,
          name: item.name,
          prompt: item.prompt,
          imageUrl: imageUrl(item.file),
          order: i,
        },
      });
    }
  }
  console.log(`  ${category}: ${filtered.length} options`);
}

async function upsertCategorizedOptions<
  CatModel extends { id: string; name: string },
>(config: {
  tab: string;
  items: Record<string, ManifestItem>;
  defaultCategoryName?: string;
  findCategory: (tab: string, name: string) => Promise<CatModel | null>;
  createCategory: (tab: string, name: string, order: number) => Promise<CatModel>;
  findOption: (categoryId: string, name: string) => Promise<{ id: string } | null>;
  createOption: (data: {
    categoryId: string;
    name: string;
    prompt: string;
    imageUrl: string;
    order: number;
  }) => Promise<unknown>;
  updateOption: (
    id: string,
    data: { prompt: string; imageUrl: string; order: number },
  ) => Promise<unknown>;
}) {
  const {
    tab,
    items,
    defaultCategoryName,
    findCategory,
    createCategory,
    findOption,
    createOption,
    updateOption,
  } = config;

  const entries = Object.values(items);

  const groupMap = new Map<string, ManifestItem[]>();
  for (const item of entries) {
    const groupName = item.group || defaultCategoryName || tab;
    if (!groupMap.has(groupName)) groupMap.set(groupName, []);
    groupMap.get(groupName)!.push(item);
  }

  let catOrder = 0;
  for (const [groupName, groupItems] of groupMap) {
    let category = await findCategory(tab, groupName);
    if (!category) {
      category = await createCategory(tab, groupName, catOrder);
    }
    catOrder++;

    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i];
      const existing = await findOption(category.id, item.name);
      if (existing) {
        await updateOption(existing.id, {
          prompt: item.prompt,
          imageUrl: imageUrl(item.file),
          order: i,
        });
      } else {
        await createOption({
          categoryId: category.id,
          name: item.name,
          prompt: item.prompt,
          imageUrl: imageUrl(item.file),
          order: i,
        });
      }
    }
    console.log(`  ${tab} / ${groupName}: ${groupItems.length} options`);
  }
}

async function seedAppearance(items: Record<string, ManifestItem>, tab: string, defaultCategoryName?: string) {
  await upsertCategorizedOptions({
    tab,
    items,
    defaultCategoryName,
    findCategory: (t, name) =>
      prisma.appearanceCategory.findFirst({ where: { tab: t, name } }),
    createCategory: (t, name, order) =>
      prisma.appearanceCategory.create({ data: { tab: t, name, order } }),
    findOption: (categoryId, name) =>
      prisma.appearanceOption.findFirst({ where: { categoryId, name } }),
    createOption: (data) => prisma.appearanceOption.create({ data }),
    updateOption: (id, data) =>
      prisma.appearanceOption.update({ where: { id }, data }),
  });
}

async function seedPose(items: Record<string, ManifestItem>, tab: string, defaultCategoryName?: string) {
  await upsertCategorizedOptions({
    tab,
    items,
    defaultCategoryName,
    findCategory: (t, name) =>
      prisma.poseCategory.findFirst({ where: { tab: t, name } }),
    createCategory: (t, name, order) =>
      prisma.poseCategory.create({ data: { tab: t, name, order } }),
    findOption: (categoryId, name) =>
      prisma.poseOption.findFirst({ where: { categoryId, name } }),
    createOption: (data) => prisma.poseOption.create({ data }),
    updateOption: (id, data) =>
      prisma.poseOption.update({ where: { id }, data }),
  });
}

async function seedScene(items: Record<string, ManifestItem>, tab: string, defaultCategoryName?: string) {
  await upsertCategorizedOptions({
    tab,
    items,
    defaultCategoryName,
    findCategory: (t, name) =>
      prisma.sceneCategory.findFirst({ where: { tab: t, name } }),
    createCategory: (t, name, order) =>
      prisma.sceneCategory.create({ data: { tab: t, name, order } }),
    findOption: (categoryId, name) =>
      prisma.sceneOption.findFirst({ where: { categoryId, name } }),
    createOption: (data) => prisma.sceneOption.create({ data }),
    updateOption: (id, data) =>
      prisma.sceneOption.update({ where: { id }, data }),
  });
}

async function seedCameraOptions(items: Record<string, ManifestItem>, section: string) {
  const entries = Object.values(items);
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    const existing = await prisma.cameraOption.findFirst({
      where: { section, name: item.name },
    });
    if (existing) {
      await prisma.cameraOption.update({
        where: { id: existing.id },
        data: { prompt: item.prompt, imageUrl: imageUrl(item.file), order: i },
      });
    } else {
      await prisma.cameraOption.create({
        data: {
          section,
          name: item.name,
          prompt: item.prompt,
          imageUrl: imageUrl(item.file),
          order: i,
        },
      });
    }
  }
  console.log(`  ${section}: ${entries.length} options`);
}

async function main() {
  const manifestPath = path.resolve(__dirname, "../../web/public/generation-elements/manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`manifest.json not found at: ${manifestPath}`);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Seeding generation elements (v${manifest.version})...\n`);

  // ─── Character tab ───
  console.log("Character options:");
  const ethnicity = manifest.sections.ethnicity.items;
  await upsertCharacterOptions(ethnicity, "HUMAN_RACE", "Человеческие");
  await upsertCharacterOptions(ethnicity, "FANTASY_RACE", "Фэнтезийные");
  await upsertCharacterOptions(manifest.sections.hairstyle.items, "HAIR_STYLE");
  await upsertCharacterOptions(manifest.sections.body.items, "BODY_TYPE");

  // ─── Appearance tab ───
  console.log("\nAppearance options:");
  await seedAppearance(manifest.sections.outfit.items, "OUTFITS");
  await seedAppearance(manifest.sections.accessories.items, "OUTFIT_DETAILS");
  await seedAppearance(manifest.sections.footwear.items, "OUTFIT_DETAILS", "Обувь");
  await seedAppearance(manifest.sections.distinctive.items, "OUTFIT_DETAILS", "Отличительные черты");

  // ─── Pose tab ───
  console.log("\nPose options:");
  await seedPose(manifest.sections.expression.items, "FACIAL_EXPRESSION");
  await seedPose(manifest.sections.pose.items, "POSE", "Позы");
  await seedPose(manifest.sections.subject.items, "POSE", "Действия");

  // ─── Scene tab ───
  console.log("\nScene options:");
  await seedScene(manifest.sections.background.items, "LOCATION");

  // ─── Camera tab ───
  console.log("\nCamera options:");
  await seedCameraOptions(manifest.sections.framing.items, "FRAMING");
  await seedCameraOptions(manifest.sections.camera.items, "CAMERA_ANGLE");

  console.log("\nGeneration elements seeded successfully!");
}

export { main as seedGenerationElements };

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
