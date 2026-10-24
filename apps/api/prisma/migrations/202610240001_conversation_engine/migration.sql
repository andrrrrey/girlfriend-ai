-- Единое ядро сообщений: порядок, источник, идемпотентность, статус ответа + outbox.

-- ─── messages: новые поля ───────────────────────────────────────────────────
ALTER TABLE "messages"
  ADD COLUMN "seq" BIGINT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web',
  ADD COLUMN "external_id" TEXT,
  ADD COLUMN "client_message_id" TEXT,
  ADD COLUMN "reply_to_id" UUID,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed';

-- Существующим сообщениям проставляем seq в хронологическом порядке.
UPDATE "messages" m
SET "seq" = s.rn
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at", "id") AS rn FROM "messages") s
WHERE m."id" = s."id";

-- Последовательность для новых сообщений (имя совпадает с тем, что ждёт Prisma
-- для @default(autoincrement()) на поле seq).
CREATE SEQUENCE "messages_seq_seq" OWNED BY "messages"."seq";
SELECT setval('"messages_seq_seq"', COALESCE((SELECT MAX("seq") FROM "messages"), 0) + 1, false);
ALTER TABLE "messages"
  ALTER COLUMN "seq" SET DEFAULT nextval('"messages_seq_seq"'),
  ALTER COLUMN "seq" SET NOT NULL;

-- ─── messages: индексы ──────────────────────────────────────────────────────
DROP INDEX IF EXISTS "messages_chat_session_id_idx";
CREATE INDEX "messages_chat_session_id_seq_idx" ON "messages"("chat_session_id", "seq");
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");
CREATE UNIQUE INDEX "messages_chat_session_id_client_message_id_key"
  ON "messages"("chat_session_id", "client_message_id");
CREATE UNIQUE INDEX "messages_chat_session_id_source_external_id_key"
  ON "messages"("chat_session_id", "source", "external_id");

-- ─── outbox_events ──────────────────────────────────────────────────────────
CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dedupe_key" TEXT,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbox_events_dedupe_key_key" ON "outbox_events"("dedupe_key");
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");
