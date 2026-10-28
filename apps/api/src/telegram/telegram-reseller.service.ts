/**
 * @file telegram-reseller.service.ts
 * @description Бот для клиентов (TelegramBot.mode = RESELLER).
 *
 * - у каждого клиента бота свой диалог с персонажем; диалог принадлежит
 *   владельцу (кредиты списываются с его кошелька), но скрыт от него на сайте
 *   (ChatSession.hiddenFromOwner) — переписку клиентов владелец не видит;
 * - списания идут в контексте клиента (billing-context): в журнале у каждой
 *   записи — владелец (actorUserId) и клиент (endUserId), а неприкосновенный
 *   остаток кошелька (BotLimits.keepBalance) клиенты не тратят;
 * - лимиты сообщений и медиа в сутки (UTC) на бота и на клиента (BotLimits);
 * - статистика владельцу: клиенты, активность и расход по дням — без переписки;
 * - данные клиента: выгрузка (/mydata) и удаление (/deletemydata или владельцем).
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import type { ProactiveOverride } from "../conversation/proactive.service";

/** Лимиты бота; null — без ограничения. */
export interface BotLimitsView {
  messagesPerDay: number | null;
  messagesPerUser: number | null;
  mediaPerDay: number | null;
  mediaPerUser: number | null;
  keepBalance: number;
}

/** Решение по входящему сообщению клиента с учётом лимитов. */
export interface ResellerAllowance {
  /** Можно ли ответить на сообщение. */
  messages: boolean;
  /** Можно ли прислать фото/видео. */
  media: boolean;
  /** Неприкосновенный остаток владельца для контекста списаний. */
  keepBalance: number;
}

export const NO_LIMITS: BotLimitsView = {
  messagesPerDay: null,
  messagesPerUser: null,
  mediaPerDay: null,
  mediaPerUser: null,
  keepBalance: 0,
};

const MAX_STATS_DAYS = 90;

/** Начало текущих суток по UTC. */
export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Лимит исчерпан: задан и использовано не меньше. */
export function limitReached(limit: number | null | undefined, used: number): boolean {
  return limit !== null && limit !== undefined && used >= limit;
}

/** Нормализует лимит из запроса: пусто/отрицательное — null (без ограничения). */
function limitValue(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`${field} must be a non-negative number or null`);
  return Math.floor(n);
}

@Injectable()
export class TelegramResellerService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Лимиты ─────────────────────────────────────────────────────────────────

  async getLimits(botId: string): Promise<BotLimitsView> {
    const row = await this.prisma.botLimits.findUnique({ where: { botId } });
    if (!row) return { ...NO_LIMITS };
    return {
      messagesPerDay: row.messagesPerDay,
      messagesPerUser: row.messagesPerUser,
      mediaPerDay: row.mediaPerDay,
      mediaPerUser: row.mediaPerUser,
      keepBalance: row.keepBalance,
    };
  }

  /** Лимиты бота владельца. */
  async ownedLimits(ownerUserId: string, botId: string): Promise<BotLimitsView> {
    await this.ownedBot(ownerUserId, botId);
    return this.getLimits(botId);
  }

  async setLimits(ownerUserId: string, botId: string, body: Record<string, unknown>): Promise<BotLimitsView> {
    await this.ownedBot(ownerUserId, botId);
    const data = {
      messagesPerDay: limitValue(body.messagesPerDay, "messagesPerDay"),
      messagesPerUser: limitValue(body.messagesPerUser, "messagesPerUser"),
      mediaPerDay: limitValue(body.mediaPerDay, "mediaPerDay"),
      mediaPerUser: limitValue(body.mediaPerUser, "mediaPerUser"),
      keepBalance: limitValue(body.keepBalance, "keepBalance") ?? 0,
    };
    await this.prisma.botLimits.upsert({ where: { botId }, create: { botId, ...data }, update: data });
    return this.getLimits(botId);
  }

  /**
   * Что можно клиенту сейчас: сообщения и медиа за сутки (UTC) на бота и на
   * клиента сравниваются с лимитами.
   */
  async allowance(botId: string, botUserId: string): Promise<ResellerAllowance> {
    const limits = await this.getLimits(botId);
    const since = startOfUtcDay();
    const needMessages = limits.messagesPerDay !== null || limits.messagesPerUser !== null;
    const needMedia = limits.mediaPerDay !== null || limits.mediaPerUser !== null;

    const [botMessages, userMessages] = needMessages
      ? await Promise.all([this.countMessages(botId, null, since, "text"), this.countMessages(botId, botUserId, since, "text")])
      : [0, 0];
    const [botMedia, userMedia] = needMedia
      ? await Promise.all([this.countMessages(botId, null, since, "media"), this.countMessages(botId, botUserId, since, "media")])
      : [0, 0];

    return {
      messages: !limitReached(limits.messagesPerDay, botMessages) && !limitReached(limits.messagesPerUser, userMessages),
      media: !limitReached(limits.mediaPerDay, botMedia) && !limitReached(limits.mediaPerUser, userMedia),
      keepBalance: limits.keepBalance,
    };
  }

  /**
   * Сообщения клиентов бота с начала суток: "text" — реплики клиентов,
   * "media" — фото/видео персонажа.
   */
  private async countMessages(botId: string, botUserId: string | null, since: Date, kind: "text" | "media"): Promise<number> {
    const filter =
      kind === "text"
        ? Prisma.sql`m."role" = 'user'`
        : Prisma.sql`m."role" = 'assistant' AND m."type" IN ('image', 'video')`;
    const user = botUserId ? Prisma.sql`AND u."id" = ${botUserId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS "n"
      FROM "messages" m
      JOIN "chat_sessions" c ON c."id" = m."chat_session_id"
      JOIN "telegram_bot_users" u ON u."id" = c."end_user_id"
      WHERE u."bot_id" = ${botId}::uuid ${user}
        AND m."created_at" >= ${since}
        AND ${filter}`;
    return Number(rows[0]?.n ?? 0);
  }

  // ─── Инициативные сообщения ─────────────────────────────────────────────────

  /** Переопределение политики инициативных сообщений для клиентов бота. */
  async getProactive(ownerUserId: string, botId: string): Promise<ProactiveOverride> {
    await this.ownedBot(ownerUserId, botId);
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: botId }, select: { proactive: true } });
    return (bot?.proactive as ProactiveOverride | null) ?? {};
  }

  /** Сохраняет переопределение (пустое поле — как в общей политике платформы). */
  async setProactive(ownerUserId: string, botId: string, body: ProactiveOverride): Promise<ProactiveOverride> {
    await this.ownedBot(ownerUserId, botId);
    const hour = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : undefined);
    const delays = Array.isArray(body.delaysHours)
      ? body.delaysHours.map(Number).filter((h) => Number.isFinite(h) && h > 0).slice(0, 10)
      : undefined;
    const override: ProactiveOverride = {
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
      ...(Number.isInteger(body.maxUnanswered) && body.maxUnanswered! >= 0 && body.maxUnanswered! <= 20
        ? { maxUnanswered: body.maxUnanswered }
        : {}),
      ...(delays?.length ? { delaysHours: delays } : {}),
      ...(hour(body.quietStart) !== undefined ? { quietStart: hour(body.quietStart) } : {}),
      ...(hour(body.quietEnd) !== undefined ? { quietEnd: hour(body.quietEnd) } : {}),
    };
    await this.prisma.telegramBot.update({
      where: { id: botId },
      data: { proactive: Object.keys(override).length ? (override as Prisma.InputJsonObject) : Prisma.DbNull },
    });
    return override;
  }

  // ─── Диалог клиента ─────────────────────────────────────────────────────────

  /**
   * Скрытый диалог клиента: текущий, если он его и с персонажем бота, иначе новый.
   * @param fresh — начать новый диалог (/newchat); прежний остаётся для выгрузки/удаления
   */
  async ensureEndUserSession(
    bot: { ownerUserId: string; characterId: string; character: { name: string } },
    botUser: { id: string; chatSessionId: string | null },
    fresh = false,
  ): Promise<string> {
    if (botUser.chatSessionId && !fresh) {
      const alive = await this.prisma.chatSession.findFirst({
        where: { id: botUser.chatSessionId, deletedAt: null, characterId: bot.characterId, endUserId: botUser.id },
        select: { id: true },
      });
      if (alive) return alive.id;
    }
    const session = await this.prisma.chatSession.create({
      data: {
        userId: bot.ownerUserId,
        characterId: bot.characterId,
        title: `Telegram: ${bot.character.name}`,
        lastMessageAt: new Date(),
        hiddenFromOwner: true,
        endUserId: botUser.id,
      },
      select: { id: true },
    });
    await this.prisma.telegramBotUser.update({ where: { id: botUser.id }, data: { chatSessionId: session.id } });
    return session.id;
  }

  // ─── Статистика для владельца ───────────────────────────────────────────────

  /** Клиенты, активность и расход по дням (UTC). Переписка не раскрывается. */
  async stats(ownerUserId: string, botId: string, days = 30) {
    await this.ownedBot(ownerUserId, botId);
    const span = Math.min(Math.max(Math.floor(days) || 30, 1), MAX_STATS_DAYS);
    const since = new Date(startOfUtcDay().getTime() - (span - 1) * 86_400_000);

    const [totalUsers, newUsers, activity, spend] = await Promise.all([
      this.prisma.telegramBotUser.count({ where: { botId } }),
      this.prisma.$queryRaw<{ day: Date; n: bigint }[]>`
        SELECT date_trunc('day', "created_at" AT TIME ZONE 'UTC') AS "day", count(*) AS "n"
        FROM "telegram_bot_users"
        WHERE "bot_id" = ${botId}::uuid AND "created_at" >= ${since}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ day: Date; users: bigint; messages: bigint; media: bigint }[]>`
        SELECT date_trunc('day', m."created_at" AT TIME ZONE 'UTC') AS "day",
               count(DISTINCT u."id") FILTER (WHERE m."role" = 'user') AS "users",
               count(*) FILTER (WHERE m."role" = 'user') AS "messages",
               count(*) FILTER (WHERE m."role" = 'assistant' AND m."type" IN ('image', 'video')) AS "media"
        FROM "messages" m
        JOIN "chat_sessions" c ON c."id" = m."chat_session_id"
        JOIN "telegram_bot_users" u ON u."id" = c."end_user_id"
        WHERE u."bot_id" = ${botId}::uuid AND m."created_at" >= ${since}
        GROUP BY 1`,
      // Расход = списания минус возвраты по клиентам этого бота.
      this.prisma.$queryRaw<{ day: Date; credits: bigint }[]>`
        SELECT date_trunc('day', l."created_at" AT TIME ZONE 'UTC') AS "day",
               -sum(l."balance_delta") AS "credits"
        FROM "ledger_entries" l
        JOIN "telegram_bot_users" u ON u."id"::text = l."end_user_id"
        WHERE u."bot_id" = ${botId}::uuid AND l."type" IN ('capture', 'refund') AND l."created_at" >= ${since}
        GROUP BY 1`,
    ]);

    const key = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const byDay = new Map<string, { date: string; newUsers: number; activeUsers: number; messages: number; media: number; credits: number }>();
    for (let i = 0; i < span; i++) {
      const date = key(new Date(since.getTime() + i * 86_400_000));
      byDay.set(date, { date, newUsers: 0, activeUsers: 0, messages: 0, media: 0, credits: 0 });
    }
    for (const r of newUsers) {
      const d = byDay.get(key(r.day));
      if (d) d.newUsers = Number(r.n);
    }
    for (const r of activity) {
      const d = byDay.get(key(r.day));
      if (d) Object.assign(d, { activeUsers: Number(r.users), messages: Number(r.messages), media: Number(r.media) });
    }
    for (const r of spend) {
      const d = byDay.get(key(r.day));
      if (d) d.credits = Number(r.credits);
    }
    const series = [...byDay.values()];
    return {
      totalUsers,
      days: series,
      totals: series.reduce(
        (acc, d) => ({
          messages: acc.messages + d.messages,
          media: acc.media + d.media,
          credits: acc.credits + d.credits,
        }),
        { messages: 0, media: 0, credits: 0 },
      ),
      limits: await this.getLimits(botId),
    };
  }

  /** Клиенты бота: кто и когда писал, сколько потратил — без переписки. */
  async listEndUsers(ownerUserId: string, botId: string, page = 1, pageSize = 50) {
    await this.ownedBot(ownerUserId, botId);
    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [total, rows] = await Promise.all([
      this.prisma.telegramBotUser.count({ where: { botId } }),
      this.prisma.$queryRaw<
        { id: string; username: string | null; firstName: string | null; createdAt: Date; blockedAt: Date | null; lastMessageAt: Date | null; messages: bigint; credits: bigint | null }[]
      >`
        SELECT u."id", u."username", u."first_name" AS "firstName", u."created_at" AS "createdAt",
               u."blocked_at" AS "blockedAt",
               (SELECT max(m."created_at") FROM "messages" m JOIN "chat_sessions" c ON c."id" = m."chat_session_id"
                 WHERE c."end_user_id" = u."id" AND m."role" = 'user') AS "lastMessageAt",
               (SELECT count(*) FROM "messages" m JOIN "chat_sessions" c ON c."id" = m."chat_session_id"
                 WHERE c."end_user_id" = u."id" AND m."role" = 'user') AS "messages",
               (SELECT -sum(l."balance_delta") FROM "ledger_entries" l
                 WHERE l."end_user_id" = u."id"::text AND l."type" IN ('capture', 'refund')) AS "credits"
        FROM "telegram_bot_users" u
        WHERE u."bot_id" = ${botId}::uuid
        ORDER BY "lastMessageAt" DESC NULLS LAST, u."created_at" DESC
        LIMIT ${take} OFFSET ${skip}`,
    ]);
    return {
      total,
      items: rows.map((r) => ({ ...r, messages: Number(r.messages), credits: Number(r.credits ?? 0) })),
    };
  }

  // ─── Данные клиента ─────────────────────────────────────────────────────────

  /** Выгрузка переписки клиента (текст для файла /mydata). */
  async exportEndUserData(botUserId: string): Promise<string> {
    const botUser = await this.prisma.telegramBotUser.findUnique({
      where: { id: botUserId },
      include: { bot: { select: { username: true } } },
    });
    if (!botUser) throw new NotFoundException("User not found");
    const messages = await this.prisma.message.findMany({
      where: { chatSession: { endUserId: botUserId }, deletedAt: null },
      orderBy: { seq: "asc" },
      select: { role: true, type: true, content: true, mediaUrl: true, createdAt: true },
    });
    const head = [
      `Бот: @${botUser.bot.username}`,
      `Пользователь Telegram: ${botUser.tgUserId}${botUser.username ? ` (@${botUser.username})` : ""}`,
      `Первое сообщение: ${botUser.createdAt.toISOString()}`,
      `Сообщений: ${messages.length}`,
      "",
    ];
    const lines = messages.map((m) => {
      const who = m.role === "user" ? "Вы" : "Персонаж";
      const body = m.type === "image" || m.type === "video" ? `[${m.type === "video" ? "видео" : "фото"}]` : m.content;
      return `[${m.createdAt.toISOString()}] ${who}: ${body}`;
    });
    return [...head, ...lines].join("\n");
  }

  /**
   * Удаляет данные клиента: переписку, его медиа-задания, журнал обновлений
   * Telegram и саму запись клиента. Записи журнала кредитов остаются (учёт
   * владельца), но в них лишь обезличенный id.
   */
  async deleteEndUserData(botUserId: string): Promise<void> {
    const botUser = await this.prisma.telegramBotUser.findUnique({ where: { id: botUserId } });
    if (!botUser) return;
    await this.prisma.$transaction([
      // Сообщения удаляются каскадом вместе с диалогами.
      this.prisma.chatSession.deleteMany({ where: { endUserId: botUserId } }),
      this.prisma.aiJob.deleteMany({ where: { endUserId: botUserId } }),
      this.prisma.$executeRaw`
        DELETE FROM "telegram_updates"
        WHERE "bot_id" = ${botUser.botId}::uuid
          AND (("payload" -> 'message' -> 'from' ->> 'id') = ${botUser.tgUserId}
            OR ("payload" -> 'callback_query' -> 'from' ->> 'id') = ${botUser.tgUserId})`,
      this.prisma.telegramBotUser.delete({ where: { id: botUserId } }),
    ]);
  }

  /** Удаление данных клиента по запросу владельца бота. */
  async deleteEndUserByOwner(ownerUserId: string, botId: string, botUserId: string): Promise<void> {
    await this.ownedBot(ownerUserId, botId);
    const botUser = await this.prisma.telegramBotUser.findFirst({ where: { id: botUserId, botId }, select: { id: true } });
    if (!botUser) throw new NotFoundException("User not found");
    await this.deleteEndUserData(botUser.id);
  }

  private async ownedBot(ownerUserId: string, botId: string) {
    const bot = await this.prisma.telegramBot.findFirst({
      where: { id: botId, ownerUserId, deletedAt: null },
      select: { id: true, mode: true },
    });
    if (!bot) throw new NotFoundException("Bot not found");
    return bot;
  }
}
