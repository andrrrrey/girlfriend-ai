-- Кошелёк кредитов: кошельки, журнал операций, резервы и версионируемые цены.

CREATE TABLE "wallets" (
  "id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallets_owner_user_id_key" ON "wallets"("owner_user_id");
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ledger_entries" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "balance_delta" INTEGER NOT NULL DEFAULT 0,
  "reserved_delta" INTEGER NOT NULL DEFAULT 0,
  "balance_after" INTEGER NOT NULL,
  "reserved_after" INTEGER NOT NULL,
  "operation_key" TEXT NOT NULL,
  "reservation_key" TEXT,
  "ai_job_id" UUID,
  "actor_user_id" UUID,
  "end_user_id" TEXT,
  "reason" TEXT,
  "meta" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ledger_entries_operation_key_key" ON "ledger_entries"("operation_key");
CREATE INDEX "ledger_entries_wallet_id_created_at_idx" ON "ledger_entries"("wallet_id", "created_at");
CREATE INDEX "ledger_entries_reservation_key_idx" ON "ledger_entries"("reservation_key");
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credit_reservations" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "operation_key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "captured_amount" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'held',
  "ai_job_id" UUID,
  "price_version" INTEGER,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_reservations_operation_key_key" ON "credit_reservations"("operation_key");
CREATE INDEX "credit_reservations_status_expires_at_idx" ON "credit_reservations"("status", "expires_at");
CREATE INDEX "credit_reservations_ai_job_id_idx" ON "credit_reservations"("ai_job_id");
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "price_tables" (
  "id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "items" JSONB NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_tables_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "price_tables_version_key" ON "price_tables"("version");
