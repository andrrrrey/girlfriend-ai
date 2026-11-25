-- Пак картинок вариантов генерации: код варианта, подписи {en,ru,de,fr}, видимость.
ALTER TABLE "character_options" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "character_options" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "character_options" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appearance_options" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "appearance_options" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "appearance_options" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pose_options" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "pose_options" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "pose_options" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "scene_options" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "scene_options" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "scene_options" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "camera_options" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "camera_options" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "camera_options" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appearance_categories" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "pose_categories" ADD COLUMN IF NOT EXISTS "labels" JSONB;
ALTER TABLE "scene_categories" ADD COLUMN IF NOT EXISTS "labels" JSONB;
