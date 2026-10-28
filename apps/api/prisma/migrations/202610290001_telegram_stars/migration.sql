-- Оплата Telegram Stars в боте для клиентов: тарифы, платежи, подписки.

ALTER TABLE "telegram_bots" ADD COLUMN "stars_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "telegram_bots" ADD COLUMN "terms_text" TEXT;
ALTER TABLE "telegram_bots" ADD COLUMN "support_text" TEXT;

CREATE TABLE "bot_plans" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "price_stars" INTEGER NOT NULL,
  "period_days" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bot_plans_bot_id_idx" ON "bot_plans"("bot_id");
ALTER TABLE "bot_plans" ADD CONSTRAINT "bot_plans_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stars_payments" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "tg_user_id" TEXT NOT NULL,
  "plan_id" UUID,
  "charge_id" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "period_days" INTEGER NOT NULL,
  "is_recurring" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'paid',
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stars_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stars_payments_charge_id_key" ON "stars_payments"("charge_id");
CREATE INDEX "stars_payments_bot_id_created_at_idx" ON "stars_payments"("bot_id", "created_at");
ALTER TABLE "stars_payments" ADD CONSTRAINT "stars_payments_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bot_subscriptions" (
  "id" UUID NOT NULL,
  "bot_id" UUID NOT NULL,
  "tg_user_id" TEXT NOT NULL,
  "plan_id" UUID,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "auto_renew" BOOLEAN NOT NULL DEFAULT false,
  "subscription_charge_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bot_subscriptions_bot_id_tg_user_id_key" ON "bot_subscriptions"("bot_id", "tg_user_id");
ALTER TABLE "bot_subscriptions" ADD CONSTRAINT "bot_subscriptions_bot_id_fkey"
  FOREIGN KEY ("bot_id") REFERENCES "telegram_bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
