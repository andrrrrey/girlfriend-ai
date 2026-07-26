-- Комментарии становятся полиморфными (character | short), как модель Like.
-- Существующие комментарии привязаны к персонажам → target_type='character'.

ALTER TABLE "comments" ADD COLUMN "target_type" TEXT NOT NULL DEFAULT 'character';
ALTER TABLE "comments" ADD COLUMN "target_id" UUID;

UPDATE "comments" SET "target_id" = "character_id";

ALTER TABLE "comments" ALTER COLUMN "target_id" SET NOT NULL;
-- Дефолт был нужен только для бэкфилла существующих строк.
ALTER TABLE "comments" ALTER COLUMN "target_type" DROP DEFAULT;

-- Убираем старый внешний ключ, индекс и колонку character_id.
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_character_id_fkey";
DROP INDEX IF EXISTS "comments_character_id_deleted_at_idx";
ALTER TABLE "comments" DROP COLUMN "character_id";

CREATE INDEX "comments_target_type_target_id_deleted_at_idx"
  ON "comments"("target_type", "target_id", "deleted_at");
