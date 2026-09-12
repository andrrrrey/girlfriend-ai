-- CreateTable
CREATE TABLE "engagement_gen_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" TEXT NOT NULL DEFAULT 'running',
    "total" INTEGER NOT NULL,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "images_per_char" INTEGER NOT NULL DEFAULT 0,
    "videos_per_char" INTEGER NOT NULL DEFAULT 0,
    "characterIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "mediaJobIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "params" JSONB NOT NULL DEFAULT '{}',
    "last_error" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "engagement_gen_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_gen_tasks_status_idx" ON "engagement_gen_tasks"("status");
