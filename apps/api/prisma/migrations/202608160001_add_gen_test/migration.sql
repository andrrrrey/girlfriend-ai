-- CreateTable
CREATE TABLE "gen_test_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "mode" TEXT NOT NULL DEFAULT 'img2img',
    "total" INTEGER NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "concurrency" INTEGER NOT NULL DEFAULT 3,
    "seed" INTEGER,
    "params" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "gen_test_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gen_test_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "selections" JSONB NOT NULL DEFAULT '{}',
    "prompt" TEXT NOT NULL,
    "job_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "image_url" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gen_test_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gen_test_tasks_status_idx" ON "gen_test_tasks"("status");

-- CreateIndex
CREATE INDEX "gen_test_items_task_id_idx" ON "gen_test_items"("task_id");

-- AddForeignKey
ALTER TABLE "gen_test_items" ADD CONSTRAINT "gen_test_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "gen_test_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
