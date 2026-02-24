-- CreateTable
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_user_id_action_key" ON "usage_counters"("user_id", "action");

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
