-- Create chat_profiles table (user-created personas)
CREATE TABLE "chat_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "chat_profiles_pkey" PRIMARY KEY ("id")
);

-- Index for listing a user's active profiles
CREATE INDEX "chat_profiles_user_id_deleted_at_idx" ON "chat_profiles"("user_id", "deleted_at");

-- FK: chat_profiles.user_id -> users.id (cascade delete)
ALTER TABLE "chat_profiles" ADD CONSTRAINT "chat_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add selected chat profile to chat sessions (per-chat persona)
ALTER TABLE "chat_sessions" ADD COLUMN "chat_profile_id" UUID;

-- FK: chat_sessions.chat_profile_id -> chat_profiles.id (null on profile delete)
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_chat_profile_id_fkey"
    FOREIGN KEY ("chat_profile_id") REFERENCES "chat_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
