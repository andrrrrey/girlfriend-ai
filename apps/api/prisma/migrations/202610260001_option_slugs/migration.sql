-- Канонические идентификаторы (slug) и синонимы опций генерации.
-- slug заполняет API при старте (OptionCatalogService) той же функцией slugify,
-- что используется при разборе спецификации, — поэтому здесь только колонки.

ALTER TABLE "character_options" ADD COLUMN "slug" TEXT, ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "appearance_options" ADD COLUMN "slug" TEXT, ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "pose_options" ADD COLUMN "slug" TEXT, ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "scene_options" ADD COLUMN "slug" TEXT, ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "camera_options" ADD COLUMN "slug" TEXT, ADD COLUMN "synonyms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "character_options_slug_idx" ON "character_options"("slug");
CREATE INDEX "appearance_options_slug_idx" ON "appearance_options"("slug");
CREATE INDEX "pose_options_slug_idx" ON "pose_options"("slug");
CREATE INDEX "scene_options_slug_idx" ON "scene_options"("slug");
CREATE INDEX "camera_options_slug_idx" ON "camera_options"("slug");
