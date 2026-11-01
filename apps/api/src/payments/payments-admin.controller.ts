/**
 * @file payments-admin.controller.ts
 * @description Админка платежей (роль admin).
 *
 *   GET  /admin/payments/providers           — настройки провайдеров, секреты маскированы
 *   PUT  /admin/payments/providers/:provider — сохранить настройки и новые ключи
 *   POST /admin/payments/providers/:provider/test — проверить ключ
 *   GET|POST /admin/payments/products, PUT /admin/payments/products/:id — каталог
 *   GET  /admin/payments, /admin/payments/stats, /admin/payments/:id — платежи
 *   POST /admin/payments/:id/resolve         — снять отметку о проверке
 *   POST /admin/payments/:id/refund          — запросить возврат у провайдера
 *   POST /admin/payments/users/:id/block|unblock — блокировка покупок
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { PaymentRefundDto, BlockUserDto, ProductDto, UpdateProviderDto } from "./dto/admin-payments.dto";
import { PaymentsAdminService } from "./payments-admin.service";

@ApiTags("admin-payments")
@ApiBearerAuth()
@Controller("admin/payments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class PaymentsAdminController {
  constructor(private readonly admin: PaymentsAdminService) {}

  @ApiOperation({ summary: "Payment providers with masked secrets" })
  @Get("providers")
  listProviders() {
    return this.admin.listProviders();
  }

  @ApiOperation({ summary: "Update provider settings and secrets" })
  @Put("providers/:provider")
  updateProvider(@Req() req: any, @Param("provider") provider: string, @Body() dto: UpdateProviderDto) {
    return this.admin.updateProvider(provider, dto, req.user.id);
  }

  @ApiOperation({ summary: "Test provider credentials" })
  @HttpCode(HttpStatus.OK)
  @Post("providers/:provider/test")
  testProvider(@Param("provider") provider: string) {
    return this.admin.testProvider(provider);
  }

  @ApiOperation({ summary: "All catalog products" })
  @Get("products")
  listProducts() {
    return this.admin.listProducts();
  }

  @ApiOperation({ summary: "Create a catalog product" })
  @Post("products")
  createProduct(@Body() dto: ProductDto) {
    return this.admin.createProduct(dto);
  }

  @ApiOperation({ summary: "Update a catalog product" })
  @Put("products/:id")
  updateProduct(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ProductDto) {
    return this.admin.updateProduct(id, dto);
  }

  @ApiOperation({ summary: "Payments with filters" })
  @Get()
  listPayments(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("needsReview") needsReview?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.admin.listPayments({ status, provider, needsReview: needsReview === "true", cursor });
  }

  @ApiOperation({ summary: "Revenue by provider for the last 30 days" })
  @Get("stats")
  stats() {
    return this.admin.stats();
  }

  @ApiOperation({ summary: "Payment with transactions" })
  @Get(":id")
  getPayment(@Param("id", ParseUUIDPipe) id: string) {
    return this.admin.getPayment(id);
  }

  @ApiOperation({ summary: "Clear the review flag" })
  @HttpCode(HttpStatus.OK)
  @Post(":id/resolve")
  resolveReview(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    return this.admin.resolveReview(id, req.user.id);
  }

  @ApiOperation({ summary: "Request a refund from the provider" })
  @HttpCode(HttpStatus.OK)
  @Post(":id/refund")
  refund(@Req() req: any, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PaymentRefundDto) {
    return this.admin.refund(id, dto, req.user.id);
  }

  @ApiOperation({ summary: "Block a user's purchases" })
  @HttpCode(HttpStatus.OK)
  @Post("users/:id/block")
  blockUser(@Req() req: any, @Param("id", ParseUUIDPipe) id: string, @Body() dto: BlockUserDto) {
    return this.admin.blockUser(id, dto.reason, req.user.id);
  }

  @ApiOperation({ summary: "Unblock a user's purchases" })
  @HttpCode(HttpStatus.OK)
  @Post("users/:id/unblock")
  unblockUser(@Req() req: any, @Param("id", ParseUUIDPipe) id: string) {
    return this.admin.unblockUser(id, req.user.id);
  }
}
