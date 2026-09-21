-- CreateTable
CREATE TABLE "autochat_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" TEXT NOT NULL DEFAULT 'running',
    "characterIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "turns_per_char" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "sessionIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "params" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "autochat_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autochat_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID,
    "character_id" UUID,
    "scope" TEXT NOT NULL DEFAULT 'character',
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL DEFAULT '[]',
    "messages_analyzed" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autochat_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autochat_tasks_status_idx" ON "autochat_tasks"("status");

-- CreateIndex
CREATE INDEX "autochat_analyses_task_id_idx" ON "autochat_analyses"("task_id");

-- CreateIndex
CREATE INDEX "autochat_analyses_character_id_idx" ON "autochat_analyses"("character_id");
