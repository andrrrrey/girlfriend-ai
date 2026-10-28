/**
 * @file telegram.controller.ts
 * @description Личные Telegram-боты пользователя (JWT) и webhook Telegram.
 *
 *   GET    /telegram/bots                    — мои боты
 *   POST   /telegram/bots                    — подключить { token, characterId }
 *   PATCH  /telegram/bots/:id                — сменить персонажа { characterId }
 *   POST   /telegram/bots/:id/reconfigure    — заново настроить webhook и команды
 *   POST   /telegram/bots/:id/link           — ссылка привязки Telegram-аккаунта (deep-link)
 *   GET    /telegram/bots/:id/diagnostics    — состояние webhook и последние обновления
 *   DELETE /telegram/bots/:id                — отключить
 *
 *   Бот для клиентов (mode=RESELLER):
 *   GET    /telegram/bots/:id/stats?days=30  — клиенты, активность и расход по дням
 *   GET    /telegram/bots/:id/users?page=1   — клиенты бота (без переписки)
 *   DELETE /telegram/bots/:id/users/:userId  — удалить данные клиента
 *   GET    /telegram/bots/:id/limits         — лимиты бота
 *   PUT    /telegram/bots/:id/limits         — изменить лимиты
 *
 *   Оплата Telegram Stars (бот для клиентов):
 *   GET    /telegram/bots/:id/stars                         — настройки, тарифы, платежи
 *   PUT    /telegram/bots/:id/stars                         — { enabled?, termsText?, supportText? }
 *   POST   /telegram/bots/:id/stars/plans                   — { title, priceStars, periodDays }
 *   DELETE /telegram/bots/:id/stars/plans/:planId           — снять тариф с продажи
 *   POST   /telegram/bots/:id/stars/payments/:paymentId/refund — вернуть платёж
 *
 *   POST   /telegram/webhook/:botId          — webhook Telegram (проверка секретного заголовка)
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { timingSafeEqual } from "crypto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";
import { BOT_MODES, type BotMode, TelegramBotsService } from "./telegram-bots.service";
import { TelegramResellerService } from "./telegram-reseller.service";
import { TelegramStarsService } from "./telegram-stars.service";
import { TelegramUpdatesService } from "./telegram-updates.service";
import type { TgUpdate } from "./telegram-api";

/** Тело POST /telegram/bots. */
export class ConnectBotDto {
  /** Токен от @BotFather. */
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;

  /** Персонаж, с которым общается бот. */
  @IsString()
  characterId!: string;

  /** PERSONAL — личный бот владельца, RESELLER — бот для клиентов. */
  @IsOptional()
  @IsIn(BOT_MODES)
  mode?: BotMode;
}

/** Тело PUT /telegram/bots/:id/limits. null или отсутствие — без ограничения. */
export class BotLimitsDto {
  @IsOptional() @IsInt() @Min(0) messagesPerDay?: number | null;
  @IsOptional() @IsInt() @Min(0) messagesPerUser?: number | null;
  @IsOptional() @IsInt() @Min(0) mediaPerDay?: number | null;
  @IsOptional() @IsInt() @Min(0) mediaPerUser?: number | null;
  /** Неприкосновенный остаток кошелька владельца (кредиты). */
  @IsOptional() @IsInt() @Min(0) keepBalance?: number | null;
}

/** Тело PUT /telegram/bots/:id/stars. */
export class StarsSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) termsText?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) supportText?: string | null;
}

/** Тело POST /telegram/bots/:id/stars/plans. */
export class BotPlanDto {
  @IsString() @MinLength(1) @MaxLength(32) title!: string;
  @IsInt() @Min(1) @Max(10_000) priceStars!: number;
  @IsInt() @Min(1) @Max(3_650) periodDays!: number;
}

/** Тело PATCH /telegram/bots/:id. */
export class UpdateBotDto {
  @IsString()
  characterId!: string;
}

/** Сравнение секретов за постоянное время. */
function secretsEqual(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@ApiTags("telegram")
@ApiBearerAuth()
@Controller("telegram/bots")
@UseGuards(JwtAuthGuard)
export class TelegramBotsController {
  constructor(
    private readonly bots: TelegramBotsService,
    private readonly reseller: TelegramResellerService,
    private readonly stars: TelegramStarsService,
  ) {}

  @ApiOperation({ summary: "My Telegram bots" })
  @Get()
  async list(@Req() req: any) {
    return this.bots.list(req.user.id);
  }

  @ApiOperation({ summary: "Connect a Telegram bot (personal or for clients) by @BotFather token" })
  @Post()
  async connect(@Req() req: any, @Body() dto: ConnectBotDto) {
    return this.bots.connect(req.user.id, dto.token, dto.characterId, dto.mode ?? "PERSONAL");
  }

  @ApiOperation({ summary: "Change the bot's character" })
  @Patch(":id")
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateBotDto) {
    return this.bots.setCharacter(req.user.id, id, dto.characterId);
  }

  @ApiOperation({ summary: "Re-register webhook and commands" })
  @Post(":id/reconfigure")
  async reconfigure(@Req() req: any, @Param("id") id: string) {
    return this.bots.reconfigure(req.user.id, id);
  }

  @ApiOperation({ summary: "One-time deep link to bind the Telegram account" })
  @Post(":id/link")
  async link(@Req() req: any, @Param("id") id: string) {
    return this.bots.createLink(req.user.id, id);
  }

  @ApiOperation({ summary: "Webhook state and recent updates (diagnostics)" })
  @Get(":id/diagnostics")
  async diagnostics(@Req() req: any, @Param("id") id: string) {
    return this.bots.diagnostics(req.user.id, id);
  }

  @ApiOperation({ summary: "Client bot stats by day (no conversations)" })
  @Get(":id/stats")
  async stats(@Req() req: any, @Param("id") id: string, @Query("days") days?: string) {
    return this.reseller.stats(req.user.id, id, Number(days) || 30);
  }

  @ApiOperation({ summary: "Client bot users (no conversations)" })
  @Get(":id/users")
  async users(@Req() req: any, @Param("id") id: string, @Query("page") page?: string) {
    return this.reseller.listEndUsers(req.user.id, id, Number(page) || 1);
  }

  @ApiOperation({ summary: "Delete a client's data" })
  @Delete(":id/users/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Req() req: any, @Param("id") id: string, @Param("userId") userId: string) {
    await this.reseller.deleteEndUserByOwner(req.user.id, id, userId);
  }

  @ApiOperation({ summary: "Client bot limits" })
  @Get(":id/limits")
  async limits(@Req() req: any, @Param("id") id: string) {
    return this.reseller.ownedLimits(req.user.id, id);
  }

  @ApiOperation({ summary: "Update client bot limits (null = unlimited)" })
  @Put(":id/limits")
  async setLimits(@Req() req: any, @Param("id") id: string, @Body() dto: BotLimitsDto) {
    return this.reseller.setLimits(req.user.id, id, { ...dto });
  }

  @ApiOperation({ summary: "Telegram Stars: settings, plans, recent payments" })
  @Get(":id/stars")
  async starsOverview(@Req() req: any, @Param("id") id: string) {
    return this.stars.overview(req.user.id, id);
  }

  @ApiOperation({ summary: "Telegram Stars: enable/disable, /terms and /support texts" })
  @Put(":id/stars")
  async starsSettings(@Req() req: any, @Param("id") id: string, @Body() dto: StarsSettingsDto) {
    return this.stars.updateSettings(req.user.id, id, dto);
  }

  @ApiOperation({ summary: "Telegram Stars: add a plan" })
  @Post(":id/stars/plans")
  async createPlan(@Req() req: any, @Param("id") id: string, @Body() dto: BotPlanDto) {
    return this.stars.createPlan(req.user.id, id, dto);
  }

  @ApiOperation({ summary: "Telegram Stars: archive a plan" })
  @Delete(":id/stars/plans/:planId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archivePlan(@Req() req: any, @Param("id") id: string, @Param("planId") planId: string) {
    await this.stars.archivePlan(req.user.id, id, planId);
  }

  @ApiOperation({ summary: "Telegram Stars: refund a payment" })
  @Post(":id/stars/payments/:paymentId/refund")
  async refund(@Req() req: any, @Param("id") id: string, @Param("paymentId") paymentId: string) {
    return this.stars.refund(req.user.id, id, paymentId);
  }

  @ApiOperation({ summary: "Disconnect the bot" })
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@Req() req: any, @Param("id") id: string) {
    await this.bots.disconnect(req.user.id, id);
  }
}

@ApiTags("telegram")
@Controller("telegram/webhook")
@SkipThrottle()
export class TelegramWebhookController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly updates: TelegramUpdatesService,
  ) {}

  /**
   * Webhook Telegram. Отвечает 200 сразу после записи обновления в очередь;
   * повтор update_id игнорируется. Чужой/неверный секрет — 403.
   */
  @Post(":botId")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Param("botId") botId: string,
    @Headers("x-telegram-bot-api-secret-token") secret: string | undefined,
    @Body() update: TgUpdate,
  ) {
    const bot = /^[0-9a-f-]{36}$/i.test(botId)
      ? await this.prisma.telegramBot.findFirst({ where: { id: botId, deletedAt: null }, select: { id: true, webhookSecret: true } })
      : null;
    if (!bot || !secretsEqual(secret, bot.webhookSecret)) throw new ForbiddenException();
    await this.updates.accept(bot.id, update);
    return { ok: true };
  }
}
