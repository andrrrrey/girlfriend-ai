/**
 * @file proactive.service.ts
 * @description Инициативные сообщения: персонаж пишет первым, если пользователь
 * давно молчит.
 *
 * - расписание: после реплики пользователя (событие message.created) —
 *   nextProactiveAt = реплика + delaysHours[0]; после каждого инициативного —
 *   следующая задержка; после maxUnanswered сообщений без ответа — стоп;
 * - планировщик (лидер-лок) раз в минуту берёт созревшие диалоги и проверяет
 *   политику: включено ли, тихие часы (часовой пояс владельца чата), дневной
 *   бюджет кредитов владельца кошелька, Telegram (бот заблокирован, /mute,
 *   оплата Stars); затем ставит событие chat.proactive в outbox с dedupeKey
 *   chat:<id>:proactive:<реплика>:<n> — повтор не создаёт второе сообщение;
 * - генерация — ядро (respond, source=proactive) с резервом кредитов; для бота
 *   клиентов — в контексте списаний клиента (как его обычные сообщения);
 * - доставка: сайт — бейдж непрочитанных; Telegram — существующий outbox;
 * - A/B: вариант (задержка, подсказка модели) — по hash(chatId); вариант
 *   пишется в metadata сообщения и в PostHog (proactive_sent / proactive_replied).
 *
 * Политика — AppSetting PROACTIVE_POLICY (JSON, админка), для ботов клиентов —
 * переопределение TelegramBot.proactive.
 */

import { ConflictException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma.service";
import { OUTBOX_EVENTS, OutboxService } from "../outbox/outbox.service";
import { SchedulerService } from "../common/scheduler.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { PricingService } from "../billing/pricing.service";
import { runWithBillingContext } from "../billing/billing-context";
import { ConversationEngine } from "./conversation.engine";

export const PROACTIVE_POLICY_SETTING = "PROACTIVE_POLICY";
export const PROACTIVE_EVENT = "chat.proactive";

const TICK_INTERVAL_MS = 60_000;
const TICK_BATCH = 20;
const POLICY_CACHE_TTL_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Ответ после инициативного сообщения засчитывается в течение этого времени. */
export const REPLY_WINDOW_HOURS = 24;

/** Вариант A/B: множитель задержек и подсказка модели. */
export interface ProactiveVariant {
  name: string;
  delayFactor: number;
  prompt: string;
}

export interface ProactivePolicy {
  enabled: boolean;
  /** Задержки (часы): до 1-го сообщения после реплики, до 2-го и т.д. (последняя повторяется). */
  delaysHours: number[];
  /** Максимум сообщений подряд без ответа. */
  maxUnanswered: number;
  /** Тихие часы по местному времени владельца чата: [quietStart, quietEnd). */
  quietStart: number;
  quietEnd: number;
  /** Дневной бюджет кредитов на инициативные сообщения одного кошелька (0 — без ограничения). */
  dailyBudgetCredits: number;
  variants: ProactiveVariant[];
}

/** Переопределение для бота клиентов (владелец бота). */
export type ProactiveOverride = Partial<Pick<ProactivePolicy, "enabled" | "delaysHours" | "maxUnanswered" | "quietStart" | "quietEnd">>;

export const DEFAULT_PROACTIVE_POLICY: ProactivePolicy = {
  enabled: false,
  delaysHours: [6, 24, 72],
  maxUnanswered: 3,
  quietStart: 23,
  quietEnd: 9,
  dailyBudgetCredits: 0,
  variants: [
    {
      name: "A",
      delayFactor: 1,
      prompt:
        "[Service note, not from the user: the user has not replied for a while. Write to them first: " +
        "a short, warm message in character that continues your story together or recalls something they told you. " +
        "Do not mention this note.]",
    },
    {
      name: "B",
      delayFactor: 0.5,
      prompt:
        "[Service note, not from the user: the user has gone quiet. Write to them first with one short message in character " +
        "that ends with a playful question about their day. Do not mention this note.]",
    },
  ],
};

const clampHour = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
};

/** Политика из JSON настройки (битые поля — значения по умолчанию). */
export function parseProactivePolicy(raw: string | null | undefined): ProactivePolicy {
  let data: Record<string, unknown> = {};
  try {
    data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    data = {};
  }
  return mergePolicy(DEFAULT_PROACTIVE_POLICY, data);
}

/** Накладывает частичные поля (настройку или переопределение бота) на политику. */
export function mergePolicy(base: ProactivePolicy, patch: Record<string, unknown> | null | undefined): ProactivePolicy {
  if (!patch || typeof patch !== "object") return base;
  const delays = Array.isArray(patch.delaysHours)
    ? patch.delaysHours.map(Number).filter((h) => Number.isFinite(h) && h > 0).slice(0, 10)
    : null;
  const variants = Array.isArray(patch.variants)
    ? (patch.variants as Record<string, unknown>[])
        .filter((v) => v && typeof v.name === "string" && typeof v.prompt === "string" && v.prompt.trim())
        .map((v) => ({
          name: String(v.name).slice(0, 20),
          delayFactor: Number(v.delayFactor) > 0 ? Number(v.delayFactor) : 1,
          prompt: String(v.prompt).slice(0, 1000),
        }))
        .slice(0, 5)
    : null;
  const max = Number(patch.maxUnanswered);
  const budget = Number(patch.dailyBudgetCredits);
  return {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : base.enabled,
    delaysHours: delays?.length ? delays : base.delaysHours,
    maxUnanswered: Number.isInteger(max) && max >= 0 && max <= 20 ? max : base.maxUnanswered,
    quietStart: clampHour(patch.quietStart ?? base.quietStart, base.quietStart),
    quietEnd: clampHour(patch.quietEnd ?? base.quietEnd, base.quietEnd),
    dailyBudgetCredits: Number.isFinite(budget) && budget >= 0 ? Math.floor(budget) : base.dailyBudgetCredits,
    variants: variants?.length ? variants : base.variants,
  };
}

/** Вариант A/B для диалога — стабилен для одного чата. */
export function variantFor(chatId: string, variants: ProactiveVariant[]): ProactiveVariant {
  const n = parseInt(createHash("sha1").update(chatId).digest("hex").slice(0, 8), 16);
  return variants[n % variants.length];
}

/** Задержка до n-го инициативного сообщения (n с 1). */
export function delayMs(policy: ProactivePolicy, variant: ProactiveVariant, n: number): number {
  const hours = policy.delaysHours[Math.min(n - 1, policy.delaysHours.length - 1)];
  return Math.round(hours * variant.delayFactor * HOUR_MS);
}

/** Местный час (0–23) в часовом поясе; неизвестный пояс — UTC. */
export function localHour(date: Date, timeZone?: string | null): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timeZone || "UTC" }).format(date);
    return Number(hour) % 24;
  } catch {
    return date.getUTCHours();
  }
}

/** Тихий ли час: [start, end), через полночь — если start > end. */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Ближайший момент после тихих часов (шаг 15 минут, максимум сутки). */
export function quietHoursEnd(from: Date, policy: ProactivePolicy, timeZone?: string | null): Date {
  let t = from.getTime();
  for (let i = 0; i < 96 && isQuietHour(localHour(new Date(t), timeZone), policy.quietStart, policy.quietEnd); i++) {
    t += 15 * 60_000;
  }
  return new Date(t);
}

interface ProactiveEventPayload {
  chatSessionId: string;
  /** Номер инициативного сообщения подряд (с 1). */
  n: number;
  variant: string;
  /** lastUserMessageAt на момент постановки (ms) — пользователь ответил раньше → не шлём. */
  since: number;
}

@Injectable()
export class ProactiveService implements OnModuleInit {
  private readonly logger = new Logger(ProactiveService.name);
  private policyCache: { at: number; value: ProactivePolicy } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scheduler: SchedulerService,
    private readonly analytics: AnalyticsService,
    private readonly pricing: PricingService,
    private readonly engine: ConversationEngine,
  ) {}

  onModuleInit(): void {
    this.outbox.registerHandler(OUTBOX_EVENTS.MESSAGE_CREATED, async (event) => {
      const p = event.payload as { chatSessionId?: string; role?: string };
      if (p.role === "user" && p.chatSessionId) await this.onUserMessage(p.chatSessionId);
    });
    this.outbox.registerHandler(PROACTIVE_EVENT, (event) => this.send(event.payload as unknown as ProactiveEventPayload));
    this.scheduler.scheduleInterval("proactive-tick", TICK_INTERVAL_MS, async () => {
      await this.tick();
    });
  }

  // ─── Политика ───────────────────────────────────────────────────────────────

  async getPolicy(): Promise<ProactivePolicy> {
    if (this.policyCache && Date.now() - this.policyCache.at < POLICY_CACHE_TTL_MS) return this.policyCache.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key: PROACTIVE_POLICY_SETTING } });
    const value = parseProactivePolicy(row?.value);
    this.policyCache = { at: Date.now(), value };
    return value;
  }

  async setPolicy(patch: Record<string, unknown>): Promise<ProactivePolicy> {
    const value = mergePolicy(await this.getPolicy(), patch);
    await this.prisma.appSetting.upsert({
      where: { key: PROACTIVE_POLICY_SETTING },
      create: { key: PROACTIVE_POLICY_SETTING, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    this.policyCache = { at: Date.now(), value };
    return value;
  }

  /** Политика диалога: глобальная + переопределение бота клиентов. */
  private async policyFor(chat: { endUserId: string | null }): Promise<ProactivePolicy> {
    const policy = await this.getPolicy();
    if (!chat.endUserId) return policy;
    const botUser = await this.prisma.telegramBotUser.findUnique({
      where: { id: chat.endUserId },
      select: { bot: { select: { proactive: true } } },
    });
    return mergePolicy(policy, botUser?.bot.proactive as Record<string, unknown> | null);
  }

  // ─── Расписание ─────────────────────────────────────────────────────────────

  /** Реплика пользователя: учёт ответа на инициативное сообщение и новое расписание. */
  async onUserMessage(chatSessionId: string): Promise<void> {
    const chat = await this.prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { id: true, userId: true, endUserId: true, proactiveEnabled: true, proactiveCount: true, lastUserMessageAt: true, deletedAt: true },
    });
    if (!chat || chat.deletedAt) return;
    const policy = await this.policyFor(chat);
    const variant = variantFor(chat.id, policy.variants);

    if (chat.proactiveCount > 0) {
      this.analytics.capture(chat.userId, "proactive_replied", { chatId: chat.id, variant: variant.name, n: chat.proactiveCount });
    }
    const base = chat.lastUserMessageAt ?? new Date();
    await this.prisma.chatSession.update({
      where: { id: chat.id },
      data: {
        proactiveCount: 0,
        nextProactiveAt:
          policy.enabled && chat.proactiveEnabled && policy.maxUnanswered > 0
            ? new Date(base.getTime() + delayMs(policy, variant, 1))
            : null,
      },
    });
  }

  /** Планировщик: созревшие диалоги → проверки политики → событие в outbox. */
  async tick(now = new Date()): Promise<number> {
    const due = await this.prisma.chatSession.findMany({
      where: { nextProactiveAt: { lte: now }, proactiveEnabled: true, deletedAt: null },
      orderBy: { nextProactiveAt: "asc" },
      take: TICK_BATCH,
      select: {
        id: true,
        userId: true,
        endUserId: true,
        proactiveCount: true,
        nextProactiveAt: true,
        lastUserMessageAt: true,
        user: { select: { timezone: true } },
      },
    });
    let queued = 0;
    for (const chat of due) {
      // Захват: другой инстанс уже взял этот диалог — пропускаем.
      const claimed = await this.prisma.chatSession.updateMany({
        where: { id: chat.id, nextProactiveAt: chat.nextProactiveAt },
        data: { nextProactiveAt: null },
      });
      if (claimed.count === 0) continue;
      try {
        const next = await this.evaluate(chat, now);
        if (next instanceof Date) {
          await this.prisma.chatSession.update({ where: { id: chat.id }, data: { nextProactiveAt: next } });
        } else if (next === "queue") {
          queued++;
        }
      } catch (err: any) {
        this.logger.warn(`proactive check for chat ${chat.id} failed: ${err?.message}`);
      }
    }
    return queued;
  }

  /**
   * Проверки перед отправкой.
   * @returns "queue" — событие поставлено; Date — отложить до; null — расписание снято
   */
  private async evaluate(
    chat: { id: string; userId: string; endUserId: string | null; proactiveCount: number; lastUserMessageAt: Date | null; user: { timezone: string | null } },
    now: Date,
  ): Promise<"queue" | Date | null> {
    const policy = await this.policyFor(chat);
    const n = chat.proactiveCount + 1;
    if (!policy.enabled || !chat.lastUserMessageAt || n > policy.maxUnanswered) return null;
    if (!(await this.telegramAllows(chat))) return null;

    if (isQuietHour(localHour(now, chat.user.timezone), policy.quietStart, policy.quietEnd)) {
      return quietHoursEnd(now, policy, chat.user.timezone);
    }
    if (!(await this.withinBudget(chat.userId, policy, now))) {
      // Бюджет на сегодня исчерпан — пробуем завтра (UTC).
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));
      return tomorrow;
    }

    const variant = variantFor(chat.id, policy.variants);
    const since = chat.lastUserMessageAt.getTime();
    const payload: ProactiveEventPayload = { chatSessionId: chat.id, n, variant: variant.name, since };
    await this.outbox.enqueue(this.prisma, PROACTIVE_EVENT, { ...payload }, `chat:${chat.id}:proactive:${since}:${n}`);
    return "queue";
  }

  /** Диалог Telegram-бота: бот не заблокирован, нет /mute; бот клиентов с оплатой — есть доступ. */
  private async telegramAllows(chat: { id: string; endUserId: string | null }): Promise<boolean> {
    const botUsers = await this.prisma.telegramBotUser.findMany({
      where: { chatSessionId: chat.id, bot: { deletedAt: null } },
      select: { tgUserId: true, blockedAt: true, muted: true, bot: { select: { id: true, mode: true, starsEnabled: true } } },
    });
    for (const u of botUsers) {
      if (u.muted || u.blockedAt) return false;
      if (u.bot.mode === "RESELLER" && u.bot.starsEnabled) {
        const plans = await this.prisma.botPlan.count({ where: { botId: u.bot.id, active: true } });
        if (plans > 0) {
          const sub = await this.prisma.botSubscription.findUnique({
            where: { botId_tgUserId: { botId: u.bot.id, tgUserId: u.tgUserId } },
          });
          if (!sub || sub.expiresAt <= new Date()) return false;
        }
      }
    }
    return true;
  }

  /** Дневной бюджет кошелька: инициативные сообщения за сутки (UTC) × цена сообщения. */
  private async withinBudget(walletOwnerId: string, policy: ProactivePolicy, now: Date): Promise<boolean> {
    if (!policy.dailyBudgetCredits) return true;
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sent = await this.prisma.message.count({
      where: { source: "proactive", role: "assistant", createdAt: { gte: dayStart }, chatSession: { userId: walletOwnerId } },
    });
    const { amount } = await this.pricing.quote({ kind: "chat_message" });
    return (sent + 1) * amount <= policy.dailyBudgetCredits;
  }

  // ─── Отправка ───────────────────────────────────────────────────────────────

  /** Обработчик chat.proactive: сообщение персонажа через ядро и следующее расписание. */
  async send(payload: ProactiveEventPayload): Promise<void> {
    const chat = await this.prisma.chatSession.findUnique({
      where: { id: payload.chatSessionId },
      select: {
        id: true,
        userId: true,
        endUserId: true,
        deletedAt: true,
        proactiveEnabled: true,
        proactiveCount: true,
        lastUserMessageAt: true,
        user: { select: { id: true, subscription: true, contentMode: true, isAdult: true } },
      },
    });
    // Пользователь успел ответить, выключил или диалог уже получил это сообщение.
    if (
      !chat ||
      chat.deletedAt ||
      !chat.proactiveEnabled ||
      chat.proactiveCount !== payload.n - 1 ||
      chat.lastUserMessageAt?.getTime() !== payload.since
    ) {
      return;
    }
    const policy = await this.policyFor(chat);
    const variant = policy.variants.find((v) => v.name === payload.variant) ?? variantFor(chat.id, policy.variants);

    const run = async () => {
      let messageId: string | undefined;
      for await (const event of this.engine.respond({
        chatId: chat.id,
        actor: chat.user,
        source: "proactive",
        enforceLimits: false,
        trailingNote: variant.prompt,
        jobInput: { proactive: true, variant: variant.name, n: payload.n },
        replyMetadata: { proactive: true, variant: variant.name, n: payload.n },
      })) {
        if (event.type === "done" && !event.failed) messageId = event.messageId;
      }
      return messageId;
    };

    let messageId: string | undefined;
    try {
      messageId = chat.endUserId ? await this.runAsEndUser(chat.userId, chat.endUserId, run) : await run();
    } catch (err) {
      // Диалог занят (пользователь как раз пишет) — outbox повторит позже.
      if (err instanceof ConflictException) throw err;
      // Нет кредитов и т.п. — не повторяем; расписание вернётся со следующей репликой.
      this.logger.warn(`proactive message for chat ${chat.id} failed: ${(err as Error)?.message}`);
      return;
    }
    if (!messageId) return;

    const hasNext = payload.n < policy.maxUnanswered;
    await this.prisma.chatSession.updateMany({
      where: { id: chat.id, proactiveCount: payload.n - 1 },
      data: {
        proactiveCount: payload.n,
        nextProactiveAt: hasNext ? new Date(Date.now() + delayMs(policy, variant, payload.n + 1)) : null,
      },
    });
    this.analytics.capture(chat.userId, "proactive_sent", { chatId: chat.id, variant: variant.name, n: payload.n });
  }

  /** Бот клиентов: списание с владельца в контексте клиента (как обычные сообщения). */
  private async runAsEndUser<T>(ownerUserId: string, endUserId: string, fn: () => Promise<T>): Promise<T> {
    const botUser = await this.prisma.telegramBotUser.findUnique({
      where: { id: endUserId },
      select: { bot: { select: { limits: { select: { keepBalance: true } } } } },
    });
    const keepBalance = botUser?.bot.limits?.keepBalance ?? 0;
    return runWithBillingContext({ actorUserId: ownerUserId, endUserId, keepBalance }, fn);
  }

  // ─── Админка ────────────────────────────────────────────────────────────────

  /** Отправлено и отвечено по вариантам за период (ответ — реплика в течение REPLY_WINDOW_HOURS). */
  async stats(days = 30) {
    const span = Math.min(Math.max(Math.floor(days) || 30, 1), 180);
    const since = new Date(Date.now() - span * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ variant: string | null; sent: bigint; replied: bigint }[]>`
      SELECT m."metadata" ->> 'variant' AS "variant",
             count(*) AS "sent",
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "messages" r
               WHERE r."chat_session_id" = m."chat_session_id" AND r."role" = 'user'
                 AND r."seq" > m."seq" AND r."created_at" <= m."created_at" + make_interval(hours => ${REPLY_WINDOW_HOURS})
             )) AS "replied"
      FROM "messages" m
      WHERE m."source" = 'proactive' AND m."role" = 'assistant' AND m."created_at" >= ${since}
      GROUP BY 1
      ORDER BY 1`;
    const scheduled = await this.prisma.chatSession.count({ where: { nextProactiveAt: { not: null }, proactiveEnabled: true, deletedAt: null } });
    return {
      days: span,
      scheduled,
      variants: rows.map((r) => ({
        variant: r.variant ?? "—",
        sent: Number(r.sent),
        replied: Number(r.replied),
        replyRate: Number(r.sent) ? Number(r.replied) / Number(r.sent) : 0,
      })),
    };
  }
}
