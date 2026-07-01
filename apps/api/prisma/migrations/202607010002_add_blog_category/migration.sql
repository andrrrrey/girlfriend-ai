-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'News';

-- CreateIndex
CREATE INDEX "blog_posts_category_idx" ON "blog_posts"("category");
