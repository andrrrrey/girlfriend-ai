-- CreateTable
CREATE TABLE "autogen_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "params" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "characterIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "autogen_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autogen_tasks_status_idx" ON "autogen_tasks"("status");
