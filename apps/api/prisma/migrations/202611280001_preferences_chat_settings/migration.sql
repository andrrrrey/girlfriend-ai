-- Предпочтения пользователя (стиль, возраст, теги) — фильтры по умолчанию на сайте.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" JSONB NOT NULL DEFAULT '{}';
-- Настройки персонажа под конкретный чат пользователя (карточка персонажа не меняется).
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
