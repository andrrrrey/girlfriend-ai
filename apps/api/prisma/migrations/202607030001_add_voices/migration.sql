-- CreateTable
CREATE TABLE "voices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "voice_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voices_is_active_order_idx" ON "voices"("is_active", "order");
