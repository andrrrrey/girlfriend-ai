/**
 * @file payments-admin.service.ts
 * @description Админка платежей: ключи провайдеров, каталог, платежи, возвраты,
 * блокировка покупок. Значения секретов наружу не выходят и в логи не пишутся.
 */

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import type { PaymentRefundDto, ProductDto, UpdateProviderDto } from "./dto/admin-payments.dto";
import { PaymentRegistryService } from "./payment-registry.service";
import { PAYMENT_PROVIDER_IDS, type PaymentProvider, type PaymentProviderId } from "./payment-provider";
import { PaymentsService } from "./payments.service";
import { ProviderConfigService } from "./provider-config.service";

const PAGE_SIZE = 50;
const STATS_DAYS = 30;
/** Настройки без секретов, которые можно менять из админки. */
const ALLOWED_SETTINGS: Record<PaymentProviderId, Record<string, RegExp>> = {
  coingate: { COINGATE_RECEIVE_CURRENCY: /^(?:[A-Z0-9]{2,10}|DO_NOT_CONVERT)$/ },
  upgate: {},
};

/** callback_token_hash наружу не отдаём. */
const PAYMENT_FIELDS = {
  id: true,
  userId: true,
  provider: true,
  productKind: true,
  productTitle: true,
  amountMinor: true,
  currency: true,
  credits: true,
  periodDays: true,
  status: true,
  externalId: true,
  refundedMinor: true,
  needsReview: true,
  reviewReason: true,
  paidAt: true,
  createdAt: true,
  user: { select: { email: true, paymentsBlockedAt: true, paymentsBlockReason: true } },
} as const;

export interface PaymentFilters {
  status?: string;
  provider?: string;
  needsReview?: boolean;
  cursor?: string;
}

@Injectable()
export class PaymentsAdminService {
  private readonly logger = new Logger(PaymentsAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentRegistryService,
    private readonly configs: ProviderConfigService,
    private readonly payments: PaymentsService,
  ) {}

  // ─── Провайдеры ─────────────────────────────────────────────────────────────

  async listProviders() {
    return Promise.all(PAYMENT_PROVIDER_IDS.map((id) => this.describeProvider(id)));
  }

  private async describeProvider(id: PaymentProviderId) {
    return {
      ...(await this.configs.describe(id)),
      requiredSecrets: this.registry.get(id)?.requiredSecrets ?? [],
      webhookUrl: this.payments.webhookUrl(id),
      available: await this.registry.isEnabled(id),
    };
  }

  async updateProvider(id: string, dto: UpdateProviderDto, actorUserId: string) {
    const provider = this.requireProvider(id);
    const unknownSecret = Object.keys(dto.secrets).find((name) => !provider.requiredSecrets.includes(name));
    if (unknownSecret) throw new BadRequestException(`Unknown secret: ${unknownSecret}`);
    if (Object.values(dto.secrets).some((value) => typeof value !== "string")) {
      throw new BadRequestException("Secrets must be strings");
    }
    const settings = this.validateSettings(provider.id, dto.settings);

    try {
      await this.configs.save(provider.id, {
        enabled: dto.enabled,
        mode: dto.mode,
        secrets: dto.secrets,
        settings,
        updatedBy: actorUserId,
      });
    } catch (err: any) {
      if (String(err?.message).includes("SECRETS_ENC_KEY")) {
        throw new BadRequestException("SECRETS_ENC_KEY is not configured: secrets cannot be saved");
      }
      throw err;
    }

    const changed = Object.entries(dto.secrets).filter(([, value]) => value.trim() !== "").map(([name]) => name);
    this.logger.log(
      `payment provider ${provider.id} updated by ${actorUserId}: enabled=${dto.enabled} mode=${dto.mode} secrets=[${changed.join(",")}]`,
    );
    return this.describeProvider(provider.id);
  }

  /** Пустое значение убирает настройку; неизвестная или неверная отклоняется. */
  private validateSettings(id: PaymentProviderId, input: Record<string, string>) {
    const allowed = ALLOWED_SETTINGS[id];
    const settings: Record<string, string> = {};
    for (const [name, value] of Object.entries(input)) {
      const pattern = allowed[name];
      if (!pattern) throw new BadRequestException(`Unknown setting: ${name}`);
      if (value === "") continue;
      if (typeof value !== "string" || !pattern.test(value)) throw new BadRequestException(`Invalid value of ${name}`);
      settings[name] = value;
    }
    return settings;
  }

  /** Проверка ключа. Ошибка возвращается как результат: сама проверка прошла штатно. */
  async testProvider(id: string) {
    const provider = this.requireProvider(id);
    try {
      await provider.testConnection();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  }

  private requireProvider(id: string): PaymentProvider {
    const provider = this.registry.get(id);
    if (!provider) throw new NotFoundException("Unknown payment provider");
    return provider;
  }

  // ─── Каталог ────────────────────────────────────────────────────────────────

  listProducts() {
    return this.prisma.billingProduct.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  }

  createProduct(dto: ProductDto) {
    return this.prisma.billingProduct.create({ data: this.productData(dto) });
  }

  async updateProduct(id: string, dto: ProductDto) {
    const existing = await this.prisma.billingProduct.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Product not found");
    return this.prisma.billingProduct.update({ where: { id }, data: this.productData(dto) });
  }

  private productData(dto: ProductDto) {
    if (dto.kind === "premium" && !dto.periodDays) throw new BadRequestException("Premium requires a period in days");
    if (dto.kind === "credits" && dto.credits < 1) throw new BadRequestException("A credit pack requires credits");
    return {
      kind: dto.kind,
      title: dto.title,
      priceMinor: dto.priceMinor,
      currency: dto.currency,
      credits: dto.credits,
      periodDays: dto.kind === "premium" ? dto.periodDays : null,
      active: dto.active,
      sortOrder: dto.sortOrder,
    };
  }

  // ─── Платежи ────────────────────────────────────────────────────────────────

  async listPayments({ status, provider, needsReview, cursor }: PaymentFilters) {
    const rows = await this.prisma.payment.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(provider ? { provider } : {}),
        ...(needsReview ? { needsReview: true } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: PAYMENT_FIELDS,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getPayment(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        ...PAYMENT_FIELDS,
        transactions: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            externalTransactionId: true,
            type: true,
            amountMinor: true,
            currency: true,
            creditsDelta: true,
            createdAt: true,
          },
        },
      },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  /** Деньги и количество за 30 дней. Возвраты и чарджбэки считаются отдельными строками. */
  async stats() {
    const rows = await this.prisma.paymentTransaction.groupBy({
      by: ["provider", "currency", "type"],
      where: { createdAt: { gte: new Date(Date.now() - STATS_DAYS * 24 * 60 * 60_000) } },
      _sum: { amountMinor: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      provider: row.provider,
      currency: row.currency,
      type: row.type,
      amountMinor: row._sum.amountMinor ?? 0,
      count: row._count._all,
    }));
  }

  async resolveReview(id: string, actorUserId: string) {
    const { count } = await this.prisma.payment.updateMany({
      where: { id },
      data: { needsReview: false, reviewReason: null },
    });
    if (count === 0) throw new NotFoundException("Payment not found");
    this.logger.log(`payment ${id} review resolved by ${actorUserId}`);
    return { ok: true };
  }

  /** Только запрос к провайдеру: кредиты и статус изменит его постбэк. */
  async refund(id: string, dto: PaymentRefundDto, actorUserId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException("Payment not found");
    const provider = this.registry.get(payment.provider);
    if (!provider?.refund) {
      throw new BadRequestException("Refunds of this provider are made in its dashboard");
    }
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { id: dto.transactionId, paymentId: id, type: { in: ["sale", "rebill"] } },
    });
    if (!transaction) throw new NotFoundException("Purchase transaction not found");
    if (dto.amountMinor !== undefined && dto.amountMinor > transaction.amountMinor) {
      throw new BadRequestException("Refund exceeds the transaction amount");
    }

    try {
      await provider.refund({
        externalTransactionId: transaction.externalTransactionId,
        amountMinor: dto.amountMinor,
        currency: transaction.currency,
        reason: dto.reason,
        initiatedBy: actorUserId,
      });
    } catch (err: any) {
      this.logger.error(`refund of payment ${id} failed: ${err?.message}`);
      throw new BadGatewayException(`Provider refused the refund: ${err?.message}`);
    }
    this.logger.log(`refund of payment ${id} requested by ${actorUserId}: ${dto.amountMinor ?? "full"}`);
    return { ok: true };
  }

  // ─── Блокировка покупок ─────────────────────────────────────────────────────

  async blockUser(userId: string, reason: string, actorUserId: string) {
    await this.setBlock(userId, { paymentsBlockedAt: new Date(), paymentsBlockReason: reason });
    this.logger.log(`payments of user ${userId} blocked by ${actorUserId}`);
    return { ok: true };
  }

  async unblockUser(userId: string, actorUserId: string) {
    await this.setBlock(userId, { paymentsBlockedAt: null, paymentsBlockReason: null });
    this.logger.log(`payments of user ${userId} unblocked by ${actorUserId}`);
    return { ok: true };
  }

  private async setBlock(userId: string, data: Prisma.UserUpdateManyMutationInput) {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId }, data });
    if (count === 0) throw new NotFoundException("User not found");
  }
}
