-- Личный Telegram-бот: боты, пользователи ботов, журнал обновлений, токены привязки.

CREATE TABLE "telegram_bots" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'PERSONAL',
  "character_id" UUID NOT NULL,
  "token_enc" TEXT NOT NULL,
  "bot_tg_id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "webhook_secret" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "telegram_bots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_bots_bot_tg_id_key" ON "telegram_bots"("bot_tg_id");
CREATE INDEX "telegram_bots_owner_user_id_idx" ON "telegram_bots"("owner_user_id");
ALTER TABLE "telegram_bots" ADD CONSTRAINT "telegram_bots_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_bots" ADD CONSTRAINT "telegram_bots_character_id_fkey"
  FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "telegram_bot_users" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "tg_user_id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "username" TEXT,
  "first_name" TEXT,
  "linked_user_id" UUID,
  "chat_session_id" UUID,
  "muted" BOOLEAN NOT NULL DEFAULT false,
  "blocked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_bot_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_bot_users_bot_id_tg_user_id_key" ON "telegram_bot_users"("bot_id", "tg_user_id");
CREATE INDEX "telegram_bot_users_chat_session_id_idx" ON "telegram_bot_users"("chat_session_id");
ALTER TABLE "telegram_bot_users" ADD CONSTRAINT "telegram_bot_users_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_bot_users" ADD CONSTRAINT "telegram_bot_users_chat_session_id_fkey"
  FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "telegram_updates" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "update_id" BIGINT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "telegram_updates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_updates_bot_id_update_id_key" ON "telegram_updates"("bot_id", "update_id");
CREATE INDEX "telegram_updates_status_available_at_idx" ON "telegram_updates"("status", "available_at");
ALTER TABLE "telegram_updates" ADD CONSTRAINT "telegram_updates_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "telegram_link_tokens" (
  "id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "bot_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "telegram_link_tokens_token_key" ON "telegram_link_tokens"("token");
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
