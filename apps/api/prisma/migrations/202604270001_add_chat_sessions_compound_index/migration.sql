-- Drop the old single-column userId index (replaced by compound index below)
DROP INDEX IF EXISTS "chat_sessions_user_id_idx";

-- Compound index for getUserChats query:
-- filters by (userId, deletedAt IS NULL) and sorts by lastMessageAt DESC
CREATE INDEX "chat_sessions_user_id_deleted_at_last_message_at_idx"
  ON "chat_sessions" ("user_id", "deleted_at", "last_message_at" DESC);
