/**
 * @file chat-diagnostics.service.ts
 * @description Диагностика чата персонажей из админки — когда логи сервера
 * недоступны (боевой стенд), а пользователь видит только «AI временно недоступен».
 *
 * Собирает в одном ответе:
 *  - какие настройки чата реально лежат в БД (провайдер, модель, задан ли ключ —
 *    сами ключи не отдаём);
 *  - жив ли AI-сервис (GET /health);
 *  - тестовый запрос к чат-модели через AI-сервис — точный HTTP-статус и тело
 *    ошибки, которые AI-сервис вернул бы чату;
 *  - последние неудачные чат-задания (ai_jobs.error) — причины реальных сбоев
 *    у пользователей.
 */

import { Injectable } from "@nestjs/common";
import { resolveOpenRouterChatModel } from "@repo/types";
import { PrismaService } from "../../prisma.service";
import { AI_BASE } from "../../conversation/ai-client";

/** Результат одного HTTP-запроса к AI-сервису. */
export interface ProbeResult {
  ok: boolean;
  status: number | null;
  ms: number;
  /** Тело ответа (обрезано) или текст сетевой ошибки. */
  body: string;
}

export interface ChatDiagnostics {
  checkedAt: string;
  aiBase: string;
  settings: {
    chatProvider: string;
    openrouterChatModelSaved: string | null;
    openrouterChatModelEffective: string;
    modelslabChatModel: string | null;
    openrouterKeySet: boolean;
    modelslabKeySet: boolean;
  };
  health: ProbeResult;
  testReply: ProbeResult;
  recentFailures: { id: string; createdAt: Date; error: string | null; model: unknown }[];
}

const PROBE_TIMEOUT_MS = 60_000;

@Injectable()
export class ChatDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<ChatDiagnostics> {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        key: { in: ["CHAT_PROVIDER", "OPENROUTER_CHAT_MODEL", "MODELSLAB_CHAT_MODEL", "OPENROUTER_API_KEY", "MODELSLAB_API_KEY"] },
      },
    });
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""])) as Record<string, string>;

    const [health, testReply, recentFailures] = await Promise.all([
      this.probe(`${AI_BASE}/health`, { method: "GET" }),
      // Тот же провайдер/модель (и запасные), что у чата персонажей.
      this.probe(`${AI_BASE}/ai/text/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: "You are a friendly companion. Reply briefly.",
          messages: [{ role: "user", content: "Привет! Как дела?" }],
          maxTokens: 60,
        }),
      }),
      this.prisma.aiJob.findMany({
        where: { type: "chat", status: "failed" },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, createdAt: true, error: true, input: true },
      }),
    ]);

    return {
      checkedAt: new Date().toISOString(),
      aiBase: AI_BASE,
      settings: {
        chatProvider: (cfg.CHAT_PROVIDER || "modelslab").toLowerCase(),
        openrouterChatModelSaved: cfg.OPENROUTER_CHAT_MODEL || null,
        openrouterChatModelEffective: resolveOpenRouterChatModel(cfg.OPENROUTER_CHAT_MODEL),
        modelslabChatModel: cfg.MODELSLAB_CHAT_MODEL || null,
        openrouterKeySet: Boolean(cfg.OPENROUTER_API_KEY?.trim()),
        modelslabKeySet: Boolean(cfg.MODELSLAB_API_KEY?.trim()),
      },
      health,
      testReply,
      recentFailures: recentFailures.map((j) => ({
        id: j.id,
        createdAt: j.createdAt,
        error: j.error,
        model: (j.input as Record<string, unknown> | null)?.model ?? null,
      })),
    };
  }

  /** HTTP-запрос к AI-сервису: статус, время и тело — без исключений. */
  private async probe(url: string, init: RequestInit): Promise<ProbeResult> {
    const started = Date.now();
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      const body = await res.text().catch(() => "");
      return { ok: res.ok, status: res.status, ms: Date.now() - started, body: body.slice(0, 2000) };
    } catch (err) {
      // Сетевая ошибка (AI-сервис не запущен, не тот AI_HOST, таймаут).
      const e = err as Error & { cause?: { code?: string; message?: string } };
      const cause = e.cause ? ` (${e.cause.code ?? ""} ${e.cause.message ?? ""})` : "";
      return { ok: false, status: null, ms: Date.now() - started, body: `${e.name}: ${e.message}${cause}` };
    }
  }
}
