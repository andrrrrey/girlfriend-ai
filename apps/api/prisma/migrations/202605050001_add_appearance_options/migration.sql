-- CreateTable
CREATE TABLE "appearance_categories" (
    "id" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appearance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appearance_options" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appearance_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appearance_categories_tab_idx" ON "appearance_categories"("tab");

-- CreateIndex
CREATE INDEX "appearance_options_category_id_idx" ON "appearance_options"("category_id");

-- AddForeignKey
ALTER TABLE "appearance_options" ADD CONSTRAINT "appearance_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "appearance_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
