-- CreateTable
CREATE TABLE "camera_options" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "camera_options_section_idx" ON "camera_options"("section");
