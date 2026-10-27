/**
 * @file telegram-bots.service.ts
 * @description Подключение личных Telegram-ботов и привязка аккаунта.
 *
 * Подключение: токен от @BotFather → getMe (проверка) → токен шифруется
 * (CryptoService) → webhook с секретом (или deleteWebhook в polling-режиме)
 * → команды бота. Один бот (botTgId) подключается только к одному аккаунту.
 *
 * Привязка: одноразовый токен (TTL 15 минут) → deep-link t.me/<bot>?start=<token>;
 * его обрабатывает TelegramHandlerService при /start.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../prisma.service";
import { CryptoService } from "../common/crypto.service";
import { TelegramApi, TelegramApiError } from "./telegram-api";

const LINK_TOKEN_TTL_MS = 15 * 60_000;
const BOT_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Команды бота (меню Telegram). */
export const BOT_COMMANDS = [
  { command: "start", description: "Начать / привязать аккаунт" },
  { command: "help", description: "Помощь" },
  { command: "newchat", description: "Начать диалог заново" },
  { command: "mute", description: "Вкл/выкл сообщения от персонажа первой" },
];

/** Бот в виде для интерфейса (без токена и секрета). */
export interface TelegramBotView {
  id: string;
  username: string;
  mode: string;
  status: string;
  lastError: string | null;
  character: { id: string; name: string; avatarUrl: string | null };
  /** Привязан ли Telegram-аккаунт владельца к этому боту. */
  linked: boolean;
  createdAt: Date;
}

/** Режим получения обновлений: polling для локальной разработки. */
export function isPollingMode(): boolean {
  return (loadEnv().TELEGRAM_POLLING || "").trim().toLowerCase() === "true";
}

/** Публичный URL webhook бота. */
export function webhookUrl(botId: string): string {
  const env = loadEnv();
  // Завершающие слэши убираем у обоих вариантов: «https://site.ai/» + «/api-proxy»
  // давало «//api-proxy», а сервер отвечал на такой адрес редиректом 308 —
  // редиректы Telegram не выполняет, и обновления не доходили.
  const trim = (url: string) => url.trim().replace(/\/+$/, "");
  const base = env.TELEGRAM_WEBHOOK_BASE_URL?.trim()
    ? trim(env.TELEGRAM_WEBHOOK_BASE_URL)
    : `${trim(env.WEB_URL)}/api-proxy`;
  return `${base}/telegram/webhook/${botId}`;
}

@Injectable()
export class TelegramBotsService {
  private readonly logger = new Logger(TelegramBotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Клиент Bot API бота (токен расшифровывается). */
  apiFor(bot: { tokenEnc: string }): TelegramApi {
    return new TelegramApi(this.crypto.decrypt(bot.tokenEnc));
  }

  /** Боты пользователя. */
  async list(userId: string): Promise<TelegramBotView[]> {
    const bots = await this.prisma.telegramBot.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        character: { select: { id: true, name: true, avatarUrl: true } },
        users: { where: { linkedUserId: userId }, select: { id: true }, take: 1 },
      },
    });
    return bots.map((b) => ({
      id: b.id,
      username: b.username,
      mode: b.mode,
      status: b.status,
      lastError: b.lastError,
      character: b.character,
      linked: b.users.length > 0,
      createdAt: b.createdAt,
    }));
  }

  /**
   * Подключает бота по токену от @BotFather.
   * @throws 400 — неверный токен/персонаж, 409 — бот уже подключён к другому аккаунту
   */
  async connect(userId: string, token: string, characterId: string): Promise<TelegramBotView> {
    token = token.trim();
    if (!BOT_TOKEN_RE.test(token)) throw new BadRequestException({ error: "INVALID_BOT_TOKEN", message: "Неверный формат токена" });
    await this.assertCharacter(characterId, userId);

    const api = new TelegramApi(token);
    let me;
    try {
      me = await api.getMe();
    } catch (err) {
      throw new BadRequestException({
        error: "INVALID_BOT_TOKEN",
        message: err instanceof TelegramApiError ? `Telegram отклонил токен: ${err.description}` : "Не удалось проверить токен",
      });
    }

    const botTgId = String(me.id);
    const existing = await this.prisma.telegramBot.findUnique({ where: { botTgId } });
    if (existing && existing.ownerUserId !== userId && !existing.deletedAt) {
      throw new ConflictException({ error: "BOT_ALREADY_CONNECTED", message: "Этот бот уже подключён к другому аккаунту" });
    }

    const data = {
      ownerUserId: userId,
      characterId,
      tokenEnc: this.crypto.encrypt(token),
      username: me.username ?? botTgId,
      webhookSecret: randomBytes(24).toString("hex"),
      status: "active",
      lastError: null,
      deletedAt: null,
    };
    if (existing && existing.ownerUserId !== userId) {
      // Бот перешёл к другому владельцу (прежний его отключил) — прежние привязки не переносим.
      await this.prisma.telegramBotUser.deleteMany({ where: { botId: existing.id } });
    }
    const bot = existing
      ? await this.prisma.telegramBot.update({ where: { id: existing.id }, data })
      : await this.prisma.telegramBot.create({ data: { ...data, botTgId, mode: "PERSONAL" } });

    await this.configureBot(bot.id, api, bot.webhookSecret);
    return (await this.list(userId)).find((b) => b.id === bot.id)!;
  }

  /** Отключает бота: снимает webhook и помечает удалённым (история диалога остаётся). */
  async disconnect(userId: string, botId: string): Promise<void> {
    const bot = await this.ownedBot(userId, botId);
    await this.apiFor(bot)
      .deleteWebhook()
      .catch((err) => this.logger.warn(`deleteWebhook failed for bot ${bot.id}: ${err?.message}`));
    await this.prisma.telegramBot.update({ where: { id: bot.id }, data: { status: "disabled", deletedAt: new Date() } });
  }

  /** Меняет персонажа бота. Уже привязанные пользователи начнут новый диалог с ним. */
  async setCharacter(userId: string, botId: string, characterId: string): Promise<TelegramBotView> {
    const bot = await this.ownedBot(userId, botId);
    await this.assertCharacter(characterId, userId);
    await this.prisma.$transaction([
      this.prisma.telegramBot.update({ where: { id: bot.id }, data: { characterId } }),
      this.prisma.telegramBotUser.updateMany({ where: { botId: bot.id }, data: { chatSessionId: null } }),
    ]);
    return (await this.list(userId)).find((b) => b.id === bot.id)!;
  }

  /** Повторно настраивает webhook и команды (после смены домена, ошибки и т.п.). */
  async reconfigure(userId: string, botId: string): Promise<TelegramBotView> {
    const bot = await this.ownedBot(userId, botId);
    await this.configureBot(bot.id, this.apiFor(bot), bot.webhookSecret);
    return (await this.list(userId)).find((b) => b.id === bot.id)!;
  }

  /** Одноразовая ссылка привязки Telegram-аккаунта (deep-link /start <token>). */
  async createLink(userId: string, botId: string): Promise<{ url: string; expiresAt: Date }> {
    const bot = await this.ownedBot(userId, botId);
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);
    await this.prisma.telegramLinkToken.create({ data: { token, botId: bot.id, userId, expiresAt } });
    return { url: `https://t.me/${bot.username}?start=${token}`, expiresAt };
  }

  /** webhook (или polling) и команды бота; ошибка сохраняется в lastError. */
  private async configureBot(botId: string, api: TelegramApi, secret: string): Promise<void> {
    try {
      if (isPollingMode()) await api.deleteWebhook();
      else await api.setWebhook(webhookUrl(botId), secret);
      await api.setMyCommands(BOT_COMMANDS);
      await this.prisma.telegramBot.update({ where: { id: botId }, data: { status: "active", lastError: null } });
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 500);
      this.logger.error(`configure bot ${botId} failed: ${message}`);
      await this.prisma.telegramBot.update({ where: { id: botId }, data: { status: "error", lastError: message } });
    }
  }

  private async ownedBot(userId: string, botId: string) {
    if (!UUID_RE.test(botId)) throw new NotFoundException("Bot not found");
    const bot = await this.prisma.telegramBot.findFirst({ where: { id: botId, ownerUserId: userId, deletedAt: null } });
    if (!bot) throw new NotFoundException("Bot not found");
    return bot;
  }

  /** Персонаж доступен: публичный, платформенный или свой. */
  private async assertCharacter(characterId: string, userId: string): Promise<void> {
    const character = UUID_RE.test(characterId)
      ? await this.prisma.character.findFirst({
          where: { id: characterId, deletedAt: null },
          select: { createdBy: true, isPublic: true },
        })
      : null;
    if (!character || (character.createdBy && character.createdBy !== userId && !character.isPublic)) {
      throw new BadRequestException({ error: "INVALID_CHARACTER", message: "Персонаж не найден" });
    }
  }
}
