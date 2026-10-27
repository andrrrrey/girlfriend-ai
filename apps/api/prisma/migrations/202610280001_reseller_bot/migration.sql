-- Бот для клиентов (RESELLER): скрытые диалоги клиентов, атрибуция списаний, лимиты бота.

ALTER TABLE "chat_sessions" ADD COLUMN "hidden_from_owner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "chat_sessions" ADD COLUMN "end_user_id" UUID;
CREATE INDEX "chat_sessions_end_user_id_idx" ON "chat_sessions"("end_user_id");
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_end_user_id_fkey"
  FOREIGN KEY ("end_user_id") REFERENCES "telegram_bot_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_jobs" ADD COLUMN "end_user_id" UUID;
CREATE INDEX "ai_jobs_end_user_id_idx" ON "ai_jobs"("end_user_id");

ALTER TABLE "credit_reservations" ADD COLUMN "actor_user_id" UUID;
ALTER TABLE "credit_reservations" ADD COLUMN "end_user_id" TEXT;

CREATE TABLE "bot_limits" (
  "bot_id" UUID NOT NULL,
  "messages_per_day" INTEGER,
  "messages_per_user" INTEGER,
  "media_per_day" INTEGER,
  "media_per_user" INTEGER,
  "keep_balance" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_limits_pkey" PRIMARY KEY ("bot_id")
);
ALTER TABLE "bot_limits" ADD CONSTRAINT "bot_limits_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ledger_entries_end_user_id_idx" ON "ledger_entries"("end_user_id");
