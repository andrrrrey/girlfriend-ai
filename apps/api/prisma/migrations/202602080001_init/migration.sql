-- CreateTable: users
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "nickname" TEXT,
  "avatar_url" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "subscription" TEXT NOT NULL DEFAULT 'free',
  "is_demo" BOOLEAN NOT NULL DEFAULT false,
  "lang" TEXT NOT NULL DEFAULT 'en',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateTable: sessions
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "user_agent" TEXT,
  "ip" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_refresh_token_key" ON "sessions"("refresh_token");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateTable: social_links
CREATE TABLE IF NOT EXISTS "social_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  CONSTRAINT "social_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "social_links_user_id_provider_key" ON "social_links"("user_id", "provider");

-- CreateTable: app_settings
CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable: characters
CREATE TABLE IF NOT EXISTS "characters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "system_prompt" TEXT NOT NULL,
  "personality" JSONB NOT NULL DEFAULT '{}',
  "avatar_url" TEXT,
  "voice_id" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "is_public" BOOLEAN NOT NULL DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chat_sessions
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "character_id" UUID NOT NULL,
  "title" TEXT,
  "last_message_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "chat_sessions_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id")
);
CREATE INDEX IF NOT EXISTS "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "chat_sessions_character_id_idx" ON "chat_sessions"("character_id");

-- CreateTable: messages
CREATE TABLE IF NOT EXISTS "messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chat_session_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "media_url" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "messages_chat_session_id_idx" ON "messages"("chat_session_id");
