-- AlterTable: связь генерации (AiJob) с персонажем, на основе которого она
-- сделана (выбор существующего персонажа на /generation). Nullable + ON DELETE
-- SET NULL, чтобы обычные генерации и удаление персонажа не ломали записи.

ALTER TABLE "ai_jobs"
  ADD COLUMN "character_id" UUID;

ALTER TABLE "ai_jobs"
  ADD CONSTRAINT "ai_jobs_character_id_fkey"
  FOREIGN KEY ("character_id") REFERENCES "characters"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ai_jobs_character_id_idx" ON "ai_jobs"("character_id");
