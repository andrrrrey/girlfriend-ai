-- Add aboutMe field to users
ALTER TABLE "users" ADD COLUMN "about_me" TEXT;

-- Add unique constraint to nickname (PostgreSQL treats NULLs as distinct, so multiple users can have NULL)
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname") WHERE "nickname" IS NOT NULL;

-- Create follows table
CREATE TABLE "follows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on follower+followee pair
CREATE UNIQUE INDEX "follows_follower_id_followee_id_key" ON "follows"("follower_id", "followee_id");

-- Index for querying followers of a user
CREATE INDEX "follows_followee_id_idx" ON "follows"("followee_id");

-- Add foreign keys
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey"
    FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey"
    FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
