-- CreateTable: ai_jobs
CREATE TABLE "ai_jobs" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "type"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "input"        JSONB,
    "output"       JSONB,
    "user_id"      UUID NOT NULL,
    "tokens_used"  INTEGER,
    "error"        TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: usage_logs
CREATE TABLE "usage_logs" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID NOT NULL,
    "action"      TEXT NOT NULL,
    "tokens_used" INTEGER,
    "metadata"    JSONB,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_copy_audits
CREATE TABLE "message_copy_audits" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "user_id"    UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_copy_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_jobs_user_id_idx" ON "ai_jobs"("user_id");
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- CreateIndex
CREATE INDEX "usage_logs_user_id_idx" ON "usage_logs"("user_id");
CREATE INDEX "usage_logs_created_at_idx" ON "usage_logs"("created_at");

-- CreateIndex
CREATE INDEX "message_copy_audits_user_id_idx" ON "message_copy_audits"("user_id");

-- AddForeignKey
ALTER TABLE "ai_jobs"
    ADD CONSTRAINT "ai_jobs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs"
    ADD CONSTRAINT "usage_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_copy_audits"
    ADD CONSTRAINT "message_copy_audits_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
