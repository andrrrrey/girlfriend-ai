-- Фото из чата остаются в галерее персонажа, даже если сообщение скрыто
-- сбросом чата. Из галереи фото убирает только явное удаление сообщения.
ALTER TABLE "messages" ADD COLUMN "in_gallery" BOOLEAN NOT NULL DEFAULT true;

-- Уже удалённые сообщения в галерею не возвращаем.
UPDATE "messages" SET "in_gallery" = false WHERE "deleted_at" IS NOT NULL;
