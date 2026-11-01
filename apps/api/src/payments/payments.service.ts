/**
 * @file payments.service.ts
 * @description Каталог, создание оплаты и статус платежа для покупателя.
 * Цена берётся только из каталога на сервере; платёж создаётся до обращения к
 * провайдеру, поэтому его webhook всегда находит нашу запись.
 */

import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../prisma.service";
import { PaymentRegistryService } from "./payment-registry.service";
import type { PaymentProviderId } from "./payment-provider";

/** Страховка от накрутки заказов: у CoinGate лимит 500 заказов в час на весь бизнес. */
const MAX_CHECKOUTS_PER_HOUR = 10;

/** Поля платежа, которые видит покупатель. */
const PUBLIC_PAYMENT_FIELDS = {
  id: true,
  provider: true,
  productKind: true,
  productTitle: true,
  amountMinor: true,
  currency: true,
  credits: true,
  periodDays: true,
  status: true,
  refundedMinor: true,
  paidAt: true,
  createdAt: true,
} as const;

function trimSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentRegistryService,
  ) {}

  /** Витрина: активные продукты и доступные способы оплаты. */
  async catalog() {
    const [products, providers] = await Promise.all([
      this.prisma.billingProduct.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, title: true, priceMinor: true, currency: true, credits: true, periodDays: true },
      }),
      this.registry.enabledIds(),
    ]);
    return { products, providers };
  }

  async createCheckout(userId: string, productId: string, providerId: PaymentProviderId) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException("User not found");
    if (user.isDemo) throw new ForbiddenException({ error: "PAYMENTS_DEMO_USER", message: "Register to make purchases" });
    if (!user.isAdult) throw new ForbiddenException({ error: "PAYMENTS_ADULT_ONLY", message: "Purchases are 18+ only" });
    if (user.paymentsBlockedAt) throw new ForbiddenException({ error: "PAYMENTS_BLOCKED", message: "Purchases are blocked" });

    const product = await this.prisma.billingProduct.findFirst({ where: { id: productId, active: true } });
    if (!product) throw new NotFoundException("Product not found");

    const provider = this.registry.get(providerId);
    if (!provider || !(await this.registry.isEnabled(providerId))) {
      throw new BadRequestException({ error: "PAYMENT_METHOD_UNAVAILABLE", message: "Payment method is unavailable" });
    }

    if (product.kind === "premium") {
      // Иначе вторая покупка оставит активным автосписание первой.
      const sub = await this.prisma.siteSubscription.findUnique({ where: { userId } });
      if (sub?.status === "active" && sub.autoRenew && sub.expiresAt > new Date()) {
        throw new ConflictException({ error: "SUBSCRIPTION_ACTIVE", message: "Auto-renewing subscription is active" });
      }
    }

    const recent = await this.prisma.payment.count({
      where: { userId, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= MAX_CHECKOUTS_PER_HOUR) {
      throw new HttpException({ error: "TOO_MANY_CHECKOUTS", message: "Too many attempts" }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        provider: providerId,
        productId: product.id,
        productKind: product.kind,
        productTitle: product.title,
        amountMinor: product.priceMinor,
        currency: product.currency,
        credits: product.credits,
        periodDays: product.periodDays,
        termsAcceptedAt: new Date(),
      },
    });

    try {
      const result = await provider.createCheckout({
        payment,
        customer: { userId, email: user.email, lang: user.lang },
        returnUrl: `${trimSlashes(this.env.WEB_URL)}/payment/return?paymentId=${payment.id}`,
        webhookUrl: this.webhookUrl(providerId),
      });
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { externalId: result.externalId, callbackTokenHash: result.callbackTokenHash },
      });
      return { paymentId: payment.id, redirectUrl: result.redirectUrl };
    } catch (err: any) {
      this.logger.error(`checkout ${payment.id} via ${providerId} failed: ${err?.message}`);
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
      throw new BadGatewayException({ error: "PAYMENT_PROVIDER_ERROR", message: "Payment provider is unavailable" });
    }
  }

  /** Статус для страницы возврата: только собственный платёж пользователя. */
  async getOwn(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      select: PUBLIC_PAYMENT_FIELDS,
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  /** История платежей (новые первыми). */
  async listOwn(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: PUBLIC_PAYMENT_FIELDS,
    });
  }

  /** Premium пользователя для страницы подписки. */
  async getOwnSubscription(userId: string) {
    const [subscription, user] = await Promise.all([
      this.prisma.siteSubscription.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { paymentsBlockedAt: true } }),
    ]);
    const blocked = Boolean(user?.paymentsBlockedAt);
    if (!subscription) return { subscription: null, paymentsBlocked: blocked };
    const { status, expiresAt, autoRenew, provider } = subscription;
    return { subscription: { status, expiresAt, autoRenew, provider }, paymentsBlocked: blocked };
  }

  /** Отключает автопродление у провайдера. Оплаченный срок сохраняется. */
  async cancelAutoRenew(userId: string) {
    const subscription = await this.prisma.siteSubscription.findUnique({ where: { userId } });
    if (!subscription || subscription.status !== "active" || !subscription.autoRenew) {
      throw new ConflictException({ error: "NO_AUTO_RENEW", message: "Auto-renewal is not active" });
    }
    try {
      await this.registry.get(subscription.provider)?.cancelSubscription?.(subscription);
    } catch (err: any) {
      this.logger.error(`cancel auto-renew of ${subscription.id} failed: ${err?.message}`);
      throw new BadGatewayException({ error: "PAYMENT_PROVIDER_ERROR", message: "Payment provider is unavailable" });
    }
    await this.prisma.siteSubscription.update({ where: { id: subscription.id }, data: { autoRenew: false } });
    return { autoRenew: false };
  }

  webhookUrl(provider: PaymentProviderId): string {
    const base = this.env.PAYMENTS_PUBLIC_BASE_URL || `${trimSlashes(this.env.WEB_URL)}/api-proxy`;
    return `${trimSlashes(base)}/payments/webhook/${provider}`;
  }
}
