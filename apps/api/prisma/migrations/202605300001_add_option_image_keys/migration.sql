-- AlterTable: add S3 keys for thumb/full WebP variants of option images.
-- imageUrl остаётся для обратной совместимости (статические /generation-elements/* и legacy base64).

ALTER TABLE "character_options"
  ADD COLUMN "image_thumb_key" TEXT,
  ADD COLUMN "image_full_key" TEXT;

ALTER TABLE "appearance_options"
  ADD COLUMN "image_thumb_key" TEXT,
  ADD COLUMN "image_full_key" TEXT;

ALTER TABLE "pose_options"
  ADD COLUMN "image_thumb_key" TEXT,
  ADD COLUMN "image_full_key" TEXT;

ALTER TABLE "scene_options"
  ADD COLUMN "image_thumb_key" TEXT,
  ADD COLUMN "image_full_key" TEXT;

ALTER TABLE "camera_options"
  ADD COLUMN "image_thumb_key" TEXT,
  ADD COLUMN "image_full_key" TEXT;
