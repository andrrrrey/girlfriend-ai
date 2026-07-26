-- Фундамент режима контента (NSFW/SFW) и накрутки лайков.
--
-- User.content_mode / is_adult — предпочтение пользователя и подтверждение 18+.
-- Character.nsfw / ai_jobs.nsfw — рейтинг контента; DEFAULT true означает, что
--   весь существующий контент помечается как NSFW (скрыт в SFW-режиме).
-- *.boost_likes — денормализованная надбавка лайков из админки.

ALTER TABLE "users"
  ADD COLUMN "content_mode" TEXT NOT NULL DEFAULT 'nsfw',
  ADD COLUMN "is_adult" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "characters"
  ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "boost_likes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ai_jobs"
  ADD COLUMN "nsfw" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "boost_likes" INTEGER NOT NULL DEFAULT 0;

-- Индексы для фильтрации фидов по рейтингу контента.
CREATE INDEX "characters_nsfw_idx" ON "characters"("nsfw");
CREATE INDEX "ai_jobs_nsfw_idx" ON "ai_jobs"("nsfw");
