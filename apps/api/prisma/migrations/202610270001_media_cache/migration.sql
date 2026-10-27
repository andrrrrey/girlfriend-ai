-- Общий кэш медиа: ассеты (пул вариантов), выдачи, идущие генерации, file_id Telegram.

-- Копии результата из кэша (не показываются в публичных лентах).
ALTER TABLE "ai_jobs" ADD COLUMN "cached_from" UUID;

CREATE TABLE "media_assets" (
  "id" UUID NOT NULL,
  "cache_key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "owner_user_id" UUID,
  "character_id" UUID,
  "source_job_id" UUID NOT NULL,
  "prompt" TEXT,
  "moderation" TEXT NOT NULL DEFAULT 'ok',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_assets_source_job_id_key" ON "media_assets"("source_job_id");
CREATE INDEX "media_assets_cache_key_moderation_idx" ON "media_assets"("cache_key", "moderation");

CREATE TABLE "media_deliveries" (
  "id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "ai_job_id" UUID,
  "via" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "media_deliveries_asset_id_user_id_key" ON "media_deliveries"("asset_id", "user_id");
CREATE INDEX "media_deliveries_created_at_idx" ON "media_deliveries"("created_at");
ALTER TABLE "media_deliveries" ADD CONSTRAINT "media_deliveries_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "generation_requests" (
  "id" UUID NOT NULL,
  "cache_key" TEXT NOT NULL,
  "leader_job_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "asset_id" UUID,
  "lease_until" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "generation_requests_leader_job_id_key" ON "generation_requests"("leader_job_id");
CREATE INDEX "generation_requests_cache_key_status_idx" ON "generation_requests"("cache_key", "status");

CREATE TABLE "telegram_file_cache" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "file_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_file_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_file_cache_bot_id_asset_id_key" ON "telegram_file_cache"("bot_id", "asset_id");
ALTER TABLE "telegram_file_cache" ADD CONSTRAINT "telegram_file_cache_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_file_cache" ADD CONSTRAINT "telegram_file_cache_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
