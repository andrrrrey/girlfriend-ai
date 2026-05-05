-- CreateTable
CREATE TABLE "scene_categories" (
    "id" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene_options" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scene_categories_tab_idx" ON "scene_categories"("tab");

-- CreateIndex
CREATE INDEX "scene_options_category_id_idx" ON "scene_options"("category_id");

-- AddForeignKey
ALTER TABLE "scene_options" ADD CONSTRAINT "scene_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "scene_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
