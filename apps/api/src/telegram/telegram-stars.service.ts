/**
 * @file telegram-stars.service.ts
 * @description Оплата доступа к боту для клиентов (RESELLER) в Telegram Stars.
 *
 * - paywall: если у бота включены Stars и есть тарифы, клиент без активной
 *   подписки вместо ответа персонажа получает счета (createInvoiceLink, XTR);
 * - pre_checkout_query → проверка тарифа и суммы → answerPreCheckoutQuery;
 * - successful_payment → идемпотентная запись по telegram_payment_charge_id →
 *   продление expiresAt (для подписки — до subscription_expiration_date);
 * - тариф на 30 дней — подписка Telegram с автопродлением; отмена/возобновление —
 *   editUserStarSubscription (/subscription у клиента);
 * - возврат владельцем — refundStarPayment: платёж помечается refunded, срок
 *   доступа сокращается на оплаченный период; refunded_payment — то же без вызова API;
 * - истечение проверяется при каждом сообщении (доступ закрыт, история на месте);
 * - сверка раз в сутки по getStarTransactions: пропущенные платежи и возвраты.
 */

import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { TelegramBotsService } from "./telegram-bots.service";
import type {
  InlineKeyboard,
  TelegramApi,
  TgPreCheckoutQuery,
  TgRefundedPayment,
  TgStarTransaction,
  TgSuccessfulPayment,
} from "./telegram-api";

const DAY_MS = 86_400_000;
/** Единственный период подписки, который поддерживает Telegram (30 дней). */
export const SUBSCRIPTION_PERIOD_DAYS = 30;
const SUBSCRIPTION_PERIOD_SEC = SUBSCRIPTION_PERIOD_DAYS * 86_400;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Префикс payload счёта: plan:<planId>. */
const PAYLOAD_PREFIX = "plan:";
const MAX_PRICE_STARS = 10_000;
const MAX_PERIOD_DAYS = 3_650;
/** Сколько транзакций проверяет сверка (страницы по 100). */
const RECONCILE_PAGES = 5;

/** callback_data кнопок /subscription. */
export const SUBSCRIPTION_CALLBACK = { cancel: "sc:cancel", resume: "sc:resume" };

const TEXTS = {
  paywall: "Чтобы продолжить общение, оформите доступ:",
  paid: (until: Date) => `Оплата прошла! Доступ открыт до ${formatDate(until)}.`,
  refunded: "Платёж возвращён. Срок доступа уменьшен.",
  noSubscription: "Активного доступа нет.",
  subscription: (until: Date, autoRenew: boolean) =>
    `Доступ до ${formatDate(until)}.` + (autoRenew ? "\nАвтопродление включено." : ""),
  cancelRenew: "Отключить автопродление",
  resumeRenew: "Включить автопродление",
  renewCanceled: "Автопродление отключено. Доступ сохранится до конца оплаченного периода.",
  renewResumed: "Автопродление снова включено.",
  planUnavailable: "Этот тариф больше недоступен.",
  priceChanged: "Цена изменилась — запросите счёт заново.",
  noTerms: "Условия использования не заданы владельцем бота.",
  noSupport: "Контакты поддержки не заданы владельцем бота.",
};

export function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Новый срок доступа: от большей из дат (сейчас / текущий срок) плюс период. */
export function extendExpiry(current: Date | null | undefined, periodDays: number, now = new Date()): Date {
  const base = current && current > now ? current : now;
  return new Date(base.getTime() + periodDays * DAY_MS);
}

/** id тарифа из payload счёта или null. */
export function planIdFromPayload(payload: string): string | null {
  const id = payload.startsWith(PAYLOAD_PREFIX) ? payload.slice(PAYLOAD_PREFIX.length) : "";
  return UUID_RE.test(id) ? id : null;
}

/** Подпись срока тарифа. */
export function periodLabel(days: number): string {
  if (days === SUBSCRIPTION_PERIOD_DAYS) return "месяц";
  if (days % 365 === 0) return `${days / 365} г.`;
  return `${days} дн.`;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

type StarsBot = { id: string; mode: string; starsEnabled: boolean };

@Injectable()
export class TelegramStarsService implements OnModuleInit {
  private readonly logger = new Logger(TelegramStarsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bots: TelegramBotsService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.scheduleDaily("telegram-stars-reconcile", 5, () => this.reconcileAll());
  }

  // ─── Доступ клиента ─────────────────────────────────────────────────────────

  /** Работает ли paywall: бот для клиентов, Stars включены, есть тарифы в продаже. */
  async paywallActive(bot: StarsBot): Promise<boolean> {
    if (bot.mode !== "RESELLER" || !bot.starsEnabled) return false;
    return (await this.prisma.botPlan.count({ where: { botId: bot.id, active: true } })) > 0;
  }

  /** Активная подписка клиента или null (истёкшая — тоже null). */
  async activeSubscription(botId: string, tgUserId: string, now = new Date()) {
    const sub = await this.prisma.botSubscription.findUnique({ where: { botId_tgUserId: { botId, tgUserId } } });
    return sub && sub.expiresAt > now ? sub : null;
  }

  /** Отправляет клиенту счета на все тарифы бота (по кнопке на каждый). */
  async sendPlans(api: TelegramApi, botId: string, chatId: string): Promise<void> {
    const plans = await this.prisma.botPlan.findMany({
      where: { botId, active: true },
      orderBy: [{ periodDays: "asc" }, { priceStars: "asc" }],
    });
    const rows: InlineKeyboard["inline_keyboard"] = [];
    for (const plan of plans) {
      const recurring = plan.periodDays === SUBSCRIPTION_PERIOD_DAYS;
      const url = await api.createInvoiceLink({
        title: plan.title.slice(0, 32),
        description: `Доступ к боту на ${periodLabel(plan.periodDays)}${recurring ? " с автопродлением" : ""}.`,
        payload: `${PAYLOAD_PREFIX}${plan.id}`,
        amount: plan.priceStars,
        label: plan.title.slice(0, 32),
        ...(recurring ? { subscriptionPeriodSec: SUBSCRIPTION_PERIOD_SEC } : {}),
      });
      rows.push([{ text: `${plan.title} — ${plan.priceStars} ⭐`, url }]);
    }
    await api.sendMessage(chatId, TEXTS.paywall, { inline_keyboard: rows });
  }

  // ─── Оплата ─────────────────────────────────────────────────────────────────

  /** pre_checkout_query: тариф существует, в продаже и сумма совпадает. */
  async answerPreCheckout(bot: StarsBot, api: TelegramApi, query: TgPreCheckoutQuery): Promise<void> {
    const planId = planIdFromPayload(query.invoice_payload);
    const plan = planId
      ? await this.prisma.botPlan.findFirst({ where: { id: planId, botId: bot.id, active: true } })
      : null;
    if (!bot.starsEnabled || !plan || query.currency !== "XTR") {
      await api.answerPreCheckoutQuery(query.id, false, TEXTS.planUnavailable);
      return;
    }
    if (plan.priceStars !== query.total_amount) {
      await api.answerPreCheckoutQuery(query.id, false, TEXTS.priceChanged);
      return;
    }
    await api.answerPreCheckoutQuery(query.id, true);
  }

  /**
   * successful_payment: запись платежа (повтор с тем же charge id — без второго
   * продления) и продление доступа.
   * @returns срок доступа и признак, что платёж обработан впервые
   */
  async applyPayment(
    botId: string,
    tgUserId: string,
    payment: Pick<TgSuccessfulPayment, "total_amount" | "invoice_payload" | "telegram_payment_charge_id"> &
      Partial<Pick<TgSuccessfulPayment, "subscription_expiration_date" | "is_recurring" | "is_first_recurring">>,
  ): Promise<{ expiresAt: Date; fresh: boolean }> {
    const planId = planIdFromPayload(payment.invoice_payload);
    const plan = planId ? await this.prisma.botPlan.findFirst({ where: { id: planId, botId } }) : null;
    const periodDays = plan?.periodDays ?? SUBSCRIPTION_PERIOD_DAYS;
    const recurring = Boolean(payment.is_recurring || payment.subscription_expiration_date);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.starsPayment.create({
          data: {
            botId,
            tgUserId,
            planId: plan?.id ?? null,
            chargeId: payment.telegram_payment_charge_id,
            payload: payment.invoice_payload,
            amount: payment.total_amount,
            periodDays,
            isRecurring: recurring,
          },
        });
        const current = await tx.botSubscription.findUnique({ where: { botId_tgUserId: { botId, tgUserId } } });
        const expiresAt = payment.subscription_expiration_date
          ? new Date(payment.subscription_expiration_date * 1000)
          : extendExpiry(current?.expiresAt, periodDays);
        // charge id первого платежа подписки нужен для отмены/возобновления автопродления.
        const subscriptionChargeId = recurring
          ? payment.is_first_recurring || !current?.subscriptionChargeId
            ? payment.telegram_payment_charge_id
            : current.subscriptionChargeId
          : current?.subscriptionChargeId ?? null;
        await tx.botSubscription.upsert({
          where: { botId_tgUserId: { botId, tgUserId } },
          create: { botId, tgUserId, planId: plan?.id ?? null, expiresAt, autoRenew: recurring, subscriptionChargeId },
          update: { planId: plan?.id ?? null, expiresAt, autoRenew: recurring, subscriptionChargeId },
        });
        return { expiresAt, fresh: true };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const sub = await this.prisma.botSubscription.findUnique({ where: { botId_tgUserId: { botId, tgUserId } } });
      return { expiresAt: sub?.expiresAt ?? new Date(), fresh: false };
    }
  }

  /** Сообщение successful_payment от клиента. */
  async onSuccessfulPayment(api: TelegramApi, botId: string, tgUserId: string, chatId: string, payment: TgSuccessfulPayment) {
    const res = await this.applyPayment(botId, tgUserId, payment);
    if (res.fresh) await api.sendMessage(chatId, TEXTS.paid(res.expiresAt));
    return res;
  }

  /**
   * Возврат: платёж → refunded, срок доступа сокращается на оплаченный период.
   * Повтор ничего не делает.
   * @returns true, если возврат применён этим вызовом
   */
  async applyRefund(botId: string, chargeId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.starsPayment.findFirst({ where: { botId, chargeId } });
      if (!payment) return false;
      const marked = await tx.starsPayment.updateMany({
        where: { id: payment.id, status: "paid" },
        data: { status: "refunded", refundedAt: new Date() },
      });
      if (marked.count === 0) return false;
      const sub = await tx.botSubscription.findUnique({ where: { botId_tgUserId: { botId, tgUserId: payment.tgUserId } } });
      if (sub) {
        const shortened = new Date(sub.expiresAt.getTime() - payment.periodDays * DAY_MS);
        await tx.botSubscription.update({
          where: { id: sub.id },
          data: {
            expiresAt: shortened > payment.createdAt ? shortened : payment.createdAt,
            ...(payment.isRecurring ? { autoRenew: false } : {}),
          },
        });
      }
      return true;
    });
  }

  /** Сообщение refunded_payment (возврат сделан в Telegram). */
  async onRefundedPayment(api: TelegramApi, botId: string, chatId: string, refund: TgRefundedPayment): Promise<void> {
    if (await this.applyRefund(botId, refund.telegram_payment_charge_id)) {
      await api.sendMessage(chatId, TEXTS.refunded);
    }
  }

  // ─── Команды клиента ────────────────────────────────────────────────────────

  async terms(api: TelegramApi, bot: { termsText: string | null }, chatId: string) {
    await api.sendMessage(chatId, bot.termsText?.trim() || TEXTS.noTerms);
  }

  async support(api: TelegramApi, bot: { supportText: string | null }, chatId: string) {
    await api.sendMessage(chatId, bot.supportText?.trim() || TEXTS.noSupport);
  }

  /** /subscription: срок доступа и кнопка автопродления. */
  async subscriptionStatus(api: TelegramApi, botId: string, tgUserId: string, chatId: string): Promise<void> {
    const sub = await this.activeSubscription(botId, tgUserId);
    if (!sub) {
      await api.sendMessage(chatId, TEXTS.noSubscription);
      return;
    }
    const button = sub.subscriptionChargeId
      ? sub.autoRenew
        ? { text: TEXTS.cancelRenew, callback_data: SUBSCRIPTION_CALLBACK.cancel }
        : { text: TEXTS.resumeRenew, callback_data: SUBSCRIPTION_CALLBACK.resume }
      : null;
    await api.sendMessage(
      chatId,
      TEXTS.subscription(sub.expiresAt, sub.autoRenew),
      button ? { inline_keyboard: [[button]] } : undefined,
    );
  }

  /** Кнопка отмены/возобновления автопродления. */
  async setAutoRenew(api: TelegramApi, botId: string, tgUserId: string, chatId: string, autoRenew: boolean): Promise<void> {
    const sub = await this.activeSubscription(botId, tgUserId);
    if (!sub?.subscriptionChargeId) {
      await api.sendMessage(chatId, TEXTS.noSubscription);
      return;
    }
    await api.editUserStarSubscription(tgUserId, sub.subscriptionChargeId, !autoRenew);
    await this.prisma.botSubscription.update({ where: { id: sub.id }, data: { autoRenew } });
    await api.sendMessage(chatId, autoRenew ? TEXTS.renewResumed : TEXTS.renewCanceled);
  }

  // ─── Владелец ───────────────────────────────────────────────────────────────

  /** Настройки оплаты, тарифы, последние платежи и число активных подписчиков. */
  async overview(ownerUserId: string, botId: string) {
    const bot = await this.ownedBot(ownerUserId, botId);
    const [plans, payments, activeSubscribers, revenue] = await Promise.all([
      this.prisma.botPlan.findMany({ where: { botId, active: true }, orderBy: [{ periodDays: "asc" }, { priceStars: "asc" }] }),
      this.prisma.starsPayment.findMany({ where: { botId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.botSubscription.count({ where: { botId, expiresAt: { gt: new Date() } } }),
      this.prisma.starsPayment.aggregate({ where: { botId, status: "paid" }, _sum: { amount: true } }),
    ]);
    return {
      enabled: bot.starsEnabled,
      termsText: bot.termsText,
      supportText: bot.supportText,
      plans,
      payments,
      activeSubscribers,
      revenueStars: revenue._sum.amount ?? 0,
    };
  }

  /** Включение Stars и тексты /terms, /support. Включение перенастраивает webhook (pre_checkout_query). */
  async updateSettings(
    ownerUserId: string,
    botId: string,
    body: { enabled?: boolean; termsText?: string | null; supportText?: string | null },
  ) {
    const bot = await this.ownedBot(ownerUserId, botId);
    const enabling = body.enabled === true && !bot.starsEnabled;
    await this.prisma.telegramBot.update({
      where: { id: botId },
      data: {
        ...(body.enabled !== undefined ? { starsEnabled: body.enabled } : {}),
        ...(body.termsText !== undefined ? { termsText: body.termsText?.trim() || null } : {}),
        ...(body.supportText !== undefined ? { supportText: body.supportText?.trim() || null } : {}),
      },
    });
    if (enabling) await this.bots.reconfigure(ownerUserId, botId);
    return this.overview(ownerUserId, botId);
  }

  async createPlan(ownerUserId: string, botId: string, body: { title: string; priceStars: number; periodDays: number }) {
    await this.ownedBot(ownerUserId, botId);
    const title = body.title?.trim();
    const price = Math.floor(body.priceStars);
    const days = Math.floor(body.periodDays);
    if (!title || title.length > 32) throw new BadRequestException({ error: "INVALID_PLAN", message: "Название тарифа: 1–32 символа" });
    if (!(price >= 1 && price <= MAX_PRICE_STARS)) {
      throw new BadRequestException({ error: "INVALID_PLAN", message: `Цена: от 1 до ${MAX_PRICE_STARS} Stars` });
    }
    if (!(days >= 1 && days <= MAX_PERIOD_DAYS)) throw new BadRequestException({ error: "INVALID_PLAN", message: "Неверный срок" });
    return this.prisma.botPlan.create({ data: { botId, title, priceStars: price, periodDays: days } });
  }

  /** Снимает тариф с продажи (оплаченные подписки продолжают действовать). */
  async archivePlan(ownerUserId: string, botId: string, planId: string): Promise<void> {
    await this.ownedBot(ownerUserId, botId);
    if (!UUID_RE.test(planId)) throw new NotFoundException("Plan not found");
    const res = await this.prisma.botPlan.updateMany({ where: { id: planId, botId }, data: { active: false } });
    if (res.count === 0) throw new NotFoundException("Plan not found");
  }

  /** Возврат платежа владельцем: refundStarPayment, затем сокращение доступа. */
  async refund(ownerUserId: string, botId: string, paymentId: string) {
    const bot = await this.ownedBot(ownerUserId, botId);
    if (!UUID_RE.test(paymentId)) throw new NotFoundException("Payment not found");
    const payment = await this.prisma.starsPayment.findFirst({ where: { id: paymentId, botId } });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== "paid") throw new BadRequestException({ error: "ALREADY_REFUNDED", message: "Платёж уже возвращён" });
    await this.bots.apiFor(bot).refundStarPayment(payment.tgUserId, payment.chargeId);
    await this.applyRefund(botId, payment.chargeId);
    return this.prisma.starsPayment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  // ─── Сверка ─────────────────────────────────────────────────────────────────

  /** Сверка всех ботов с включёнными Stars. */
  async reconcileAll(): Promise<void> {
    const bots = await this.prisma.telegramBot.findMany({
      where: { deletedAt: null, mode: "RESELLER", starsEnabled: true },
      select: { id: true, tokenEnc: true },
    });
    for (const bot of bots) {
      try {
        const res = await this.reconcile(bot.id, this.bots.apiFor(bot));
        if (res.payments || res.refunds) {
          this.logger.warn(`stars reconcile bot ${bot.id}: +${res.payments} missed payments, +${res.refunds} refunds`);
        }
      } catch (err: any) {
        this.logger.warn(`stars reconcile bot ${bot.id} failed: ${err?.message}`);
      }
    }
  }

  /**
   * Сверка с getStarTransactions: входящий платёж без записи — зачисляется
   * (successful_payment потерялся), исходящий возврат по оплаченному платежу —
   * применяется.
   */
  async reconcile(botId: string, api: TelegramApi): Promise<{ payments: number; refunds: number }> {
    let payments = 0;
    let refunds = 0;
    for (let page = 0; page < RECONCILE_PAGES; page++) {
      const { transactions } = await api.getStarTransactions(page * 100, 100);
      for (const tx of transactions) payments += (await this.reconcileIncoming(botId, tx)) ? 1 : 0;
      for (const tx of transactions) refunds += (await this.reconcileRefund(botId, tx)) ? 1 : 0;
      if (transactions.length < 100) break;
    }
    return { payments, refunds };
  }

  private async reconcileIncoming(botId: string, tx: TgStarTransaction): Promise<boolean> {
    const source = tx.source;
    if (source?.type !== "user" || !source.user || !source.invoice_payload || !planIdFromPayload(source.invoice_payload)) return false;
    if (await this.prisma.starsPayment.findUnique({ where: { chargeId: tx.id } })) return false;
    const res = await this.applyPayment(botId, String(source.user.id), {
      total_amount: tx.amount,
      invoice_payload: source.invoice_payload,
      telegram_payment_charge_id: tx.id,
      is_recurring: Boolean(source.subscription_period),
    });
    return res.fresh;
  }

  private async reconcileRefund(botId: string, tx: TgStarTransaction): Promise<boolean> {
    if (tx.receiver?.type !== "user") return false;
    return this.applyRefund(botId, tx.id);
  }

  private async ownedBot(ownerUserId: string, botId: string) {
    if (!UUID_RE.test(botId)) throw new NotFoundException("Bot not found");
    const bot = await this.prisma.telegramBot.findFirst({ where: { id: botId, ownerUserId, deletedAt: null } });
    if (!bot) throw new NotFoundException("Bot not found");
    if (bot.mode !== "RESELLER") {
      throw new BadRequestException({ error: "NOT_RESELLER_BOT", message: "Оплата Stars доступна только в боте для клиентов" });
    }
    return bot;
  }
}
