-- Галочка NSFW у пресетов генерации (опций). DEFAULT true => существующие опции
-- считаются NSFW и скрываются в SFW-режиме пикеров генерации.

ALTER TABLE "character_options" ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "appearance_options" ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pose_options"       ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "scene_options"      ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "camera_options"     ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true;
