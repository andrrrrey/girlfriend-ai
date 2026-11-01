-- Платежи сайта: каталог, настройки провайдеров, платежи, очередь событий, Premium.

ALTER TABLE "users" ADD COLUMN "payments_blocked_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "payments_block_reason" TEXT;

CREATE TABLE "billing_products" (
  "id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "credits" INTEGER NOT NULL DEFAULT 0,
  "period_days" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_products_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "billing_products_active_sort_order_idx" ON "billing_products"("active", "sort_order");

CREATE TABLE "payment_provider_configs" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" TEXT NOT NULL DEFAULT 'sandbox',
  "secrets_enc" TEXT,
  "settings" JSONB,
  "updated_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_provider_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_provider_configs_provider_key" ON "payment_provider_configs"("provider");

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "provider" TEXT NOT NULL,
  "product_id" UUID,
  "product_kind" TEXT NOT NULL,
  "product_title" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "period_days" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'created',
  "external_id" TEXT,
  "callback_token_hash" TEXT,
  "refunded_minor" INTEGER NOT NULL DEFAULT 0,
  "needs_review" BOOLEAN NOT NULL DEFAULT false,
  "review_reason" TEXT,
  "terms_accepted_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_provider_external_id_key" ON "payments"("provider", "external_id");
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
CREATE INDEX "payments_needs_review_idx" ON "payments"("needs_review");
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "billing_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "external_transaction_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "credits_delta" INTEGER NOT NULL DEFAULT 0,
  "related_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_transactions_provider_external_transaction_id_key"
  ON "payment_transactions"("provider", "external_transaction_id");
CREATE INDEX "payment_transactions_payment_id_created_at_idx" ON "payment_transactions"("payment_id", "created_at");
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key_key" ON "payment_webhook_events"("provider", "event_key");
CREATE INDEX "payment_webhook_events_status_available_at_idx" ON "payment_webhook_events"("status", "available_at");

CREATE TABLE "site_subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "product_id" UUID,
  "origin_payment_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "auto_renew" BOOLEAN NOT NULL DEFAULT false,
  "external_subscription_id" TEXT,
  "last_event_version" INTEGER,
  "provider_cancel_pending" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "site_subscriptions_user_id_key" ON "site_subscriptions"("user_id");
CREATE UNIQUE INDEX "site_subscriptions_provider_external_subscription_id_key"
  ON "site_subscriptions"("provider", "external_subscription_id");
CREATE INDEX "site_subscriptions_status_expires_at_idx" ON "site_subscriptions"("status", "expires_at");
ALTER TABLE "site_subscriptions" ADD CONSTRAINT "site_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
