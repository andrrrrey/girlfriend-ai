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
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { timingSafeEqual } from "crypto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";
import { TelegramBotsService } from "./telegram-bots.service";
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
  constructor(private readonly bots: TelegramBotsService) {}

  @ApiOperation({ summary: "My Telegram bots" })
  @Get()
  async list(@Req() req: any) {
    return this.bots.list(req.user.id);
  }

  @ApiOperation({ summary: "Connect a personal Telegram bot by @BotFather token" })
  @Post()
  async connect(@Req() req: any, @Body() dto: ConnectBotDto) {
    return this.bots.connect(req.user.id, dto.token, dto.characterId);
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
