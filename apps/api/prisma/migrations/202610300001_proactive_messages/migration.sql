-- Инициативные сообщения: память диалога, состояние проактивности, непрочитанные, часовой пояс.

ALTER TABLE "chat_sessions" ADD COLUMN "summary" TEXT;
ALTER TABLE "chat_sessions" ADD COLUMN "summary_up_to_seq" BIGINT;
ALTER TABLE "chat_sessions" ADD COLUMN "last_user_message_at" TIMESTAMP(3);
ALTER TABLE "chat_sessions" ADD COLUMN "proactive_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "chat_sessions" ADD COLUMN "proactive_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chat_sessions" ADD COLUMN "next_proactive_at" TIMESTAMP(3);
ALTER TABLE "chat_sessions" ADD COLUMN "unread_count" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "chat_sessions_next_proactive_at_idx" ON "chat_sessions"("next_proactive_at");

ALTER TABLE "users" ADD COLUMN "timezone" TEXT;

ALTER TABLE "telegram_bots" ADD COLUMN "proactive" JSONB;
