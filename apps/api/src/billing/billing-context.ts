/**
 * @file billing-context.ts
 * @description Контекст списаний текущей операции (AsyncLocalStorage).
 *
 * Бот для клиентов (RESELLER) тратит кредиты владельца, но в журнале нужно
 * видеть, для кого была операция, а у кошелька — неприкосновенный остаток.
 * Резервы берутся глубоко внутри ядра и генерации; чтобы не протаскивать эти
 * поля через все вызовы, обработчик Telegram запускает операцию внутри
 * runWithBillingContext — WalletService и GenerationService читают контекст сами.
 */

import { AsyncLocalStorage } from "async_hooks";

export interface BillingContext {
  /** Кто тратит (владелец бота). */
  actorUserId?: string;
  /** Для кого (TelegramBotUser.id клиента бота). */
  endUserId?: string;
  /** Остаток кошелька, который операции этого контекста не трогают. */
  keepBalance?: number;
}

const storage = new AsyncLocalStorage<BillingContext>();

/** Выполняет fn с контекстом списаний (действует и во вложенных await). */
export function runWithBillingContext<T>(ctx: BillingContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Контекст текущей операции или undefined вне runWithBillingContext. */
export function currentBillingContext(): BillingContext | undefined {
  return storage.getStore();
}
