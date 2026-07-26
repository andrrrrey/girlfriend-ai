-- Жалобы (reports) получают полиморфную цель (character | short), сохраняя
-- character_id для существующего админ-фильтра и связи по персонажам.

ALTER TABLE "reports" ALTER COLUMN "character_id" DROP NOT NULL;
ALTER TABLE "reports" ADD COLUMN "target_type" TEXT NOT NULL DEFAULT 'character';
ALTER TABLE "reports" ADD COLUMN "target_id" UUID;

-- Существующие жалобы — на персонажей.
UPDATE "reports" SET "target_id" = "character_id";

CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");
