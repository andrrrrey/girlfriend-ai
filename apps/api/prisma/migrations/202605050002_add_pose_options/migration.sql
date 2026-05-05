-- CreateTable
CREATE TABLE "pose_categories" (
    "id" TEXT NOT NULL,
    "tab" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pose_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pose_options" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pose_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pose_categories_tab_idx" ON "pose_categories"("tab");

-- CreateIndex
CREATE INDEX "pose_options_category_id_idx" ON "pose_options"("category_id");

-- AddForeignKey
ALTER TABLE "pose_options" ADD CONSTRAINT "pose_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "pose_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
