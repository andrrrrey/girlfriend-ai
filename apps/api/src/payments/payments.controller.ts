/**
 * @file payments.controller.ts
 * @description Покупки на сайте и приём webhook провайдеров.
 *
 *   GET  /payments/catalog            — продукты и доступные способы оплаты
 *   POST /payments/checkout           — создать оплату, вернуть redirectUrl
 *   GET  /payments                    — история платежей пользователя
 *   GET  /payments/subscription       — Premium пользователя
 *   POST /payments/subscription/cancel — отключить автопродление
 *   GET  /payments/:id                — статус платежа (страница возврата)
 *   POST /payments/webhook/:provider  — webhook провайдера (проверяет адаптер)
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
  BadRequestException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateCheckoutDto } from "./dto/create-checkout.dto";
import { PaymentEventsService } from "./payment-events.service";
import { PaymentRegistryService } from "./payment-registry.service";
import { WebhookRejectedError } from "./payment-provider";
import { PaymentsService } from "./payments.service";

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly registry: PaymentRegistryService,
    private readonly events: PaymentEventsService,
  ) {}

  @ApiOperation({ summary: "Active products and available payment methods" })
  @Get("catalog")
  async catalog() {
    return this.payments.catalog();
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a checkout and return the provider's payment URL" })
  @UseGuards(JwtAuthGuard)
  @Post("checkout")
  async checkout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    return this.payments.createCheckout(req.user.id, dto.productId, dto.provider);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user's payments (newest first)" })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    return this.payments.listOwn(req.user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user's Premium subscription" })
  @UseGuards(JwtAuthGuard)
  @Get("subscription")
  async subscription(@Req() req: any) {
    return this.payments.getOwnSubscription(req.user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Turn off Premium auto-renewal" })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post("subscription/cancel")
  async cancelSubscription(@Req() req: any) {
    return this.payments.cancelAutoRenew(req.user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Status of the current user's payment" })
  @UseGuards(JwtAuthGuard)
  @Get(":id")
  async get(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    return this.payments.getOwn(req.user.id, id);
  }

  /**
   * Без DTO: глобальный forbidNonWhitelisted отклонил бы незнакомые поля провайдера.
   * Без троттлинга: весь трафик из прокси приходит с одного IP.
   * Не отвечаем 401/403 и редиректами: CoinGate после них прекращает доставку.
   */
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post("webhook/:provider")
  async webhook(
    @Param("provider") providerId: string,
    @Req() req: RawBodyRequest<any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const provider = this.registry.get(providerId);
    if (!provider) throw new NotFoundException();
    // Не 200: провайдер повторит доставку, когда настройки починят.
    if (!(await this.registry.isEnabled(provider.id))) throw new ServiceUnavailableException();
    if (!req.rawBody) throw new BadRequestException();

    try {
      const events = await provider.parseWebhook({ rawBody: req.rawBody, headers });
      await this.events.enqueue(provider.id, events);
      return { ok: true };
    } catch (err: any) {
      if (err instanceof WebhookRejectedError) {
        this.logger.warn(`webhook ${provider.id} rejected: ${err.message}`);
        throw new BadRequestException();
      }
      if (err instanceof HttpException) throw err;
      this.logger.error(`webhook ${provider.id} failed: ${err?.message}`);
      throw new ServiceUnavailableException();
    }
  }
}
