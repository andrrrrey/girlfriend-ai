-- CreateTable
CREATE TABLE "character_options" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_options_category_idx" ON "character_options"("category");
