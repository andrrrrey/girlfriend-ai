"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/auth";
import { useT } from "../../context/language";
import {
  chats,
  resizedMediaUrl,
  telegram,
  type ChatSession,
  type TelegramBotClient,
  type TelegramBotDiagnostics,
  type TelegramBotInfo,
  type TelegramBotLimits,
  type TelegramBotMode,
  type TelegramBotStats,
} from "../../lib/api";
import type { TKey } from "../../lib/i18n";

const PAGE_CSS = `
  .tg-page { max-width: 720px; margin: 0 auto; padding: 28px 20px 60px; display: flex; flex-direction: column; gap: 20px; }
  .tg-title { font-size: 28px; font-weight: 700; margin: 0; }
  .tg-subtitle { color: #969696; font-size: 14px; margin: 4px 0 0; line-height: 1.5; }
  .tg-card { background: #141414; border: 1px solid #252525; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .tg-howto { white-space: pre-line; color: #bdbdbd; font-size: 13px; line-height: 1.7; margin: 0; }
  .tg-label { color: #969696; font-size: 12px; margin-bottom: 6px; display: block; }
  .tg-input, .tg-select { width: 100%; background: #1e1e1e; border: 1px solid #313131; border-radius: 8px; padding: 10px 12px; color: #fff; font-size: 14px; outline: none; font-family: inherit; }
  .tg-input:focus, .tg-select:focus { border-color: #f95bad; }
  .tg-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .tg-btn { height: 38px; padding: 0 16px; border-radius: 8px; border: none; background: linear-gradient(to right, #f95bad, #ff0084); color: #fff; font-weight: 600; font-size: 13px; cursor: pointer; font-family: inherit; }
  .tg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .tg-btn-ghost { background: transparent; border: 1px solid #313131; color: #fff; }
  .tg-btn-danger { background: transparent; border: 1px solid rgba(227,100,102,0.5); color: #e36466; }
  .tg-bot-head { display: flex; align-items: center; gap: 12px; }
  .tg-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #252525; flex-shrink: 0; }
  .tg-bot-name { font-weight: 600; font-size: 15px; }
  .tg-bot-meta { color: #848484; font-size: 12px; }
  .tg-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(193,240,170,0.12); color: #c1f0aa; }
  .tg-badge-error { background: rgba(227,100,102,0.12); color: #e36466; }
  .tg-error { color: #e36466; font-size: 13px; }
  .tg-hint { color: #848484; font-size: 12px; }
  .tg-diag { border-top: 1px solid #252525; padding-top: 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #bdbdbd; word-break: break-all; }
  .tg-diag-row { display: flex; gap: 8px; }
  .tg-diag-key { color: #848484; flex-shrink: 0; }
  .tg-diag-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .tg-diag-table td { padding: 4px 8px 4px 0; vertical-align: top; color: #bdbdbd; }
  .tg-diag-bad { color: #e36466; }
  .tg-section { border-top: 1px solid #252525; padding-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .tg-section-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tg-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
  .tg-tile { border: 1px solid #252525; border-radius: 8px; padding: 10px; }
  .tg-tile-label { color: #848484; font-size: 11px; }
  .tg-tile-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .tg-table-wrap { overflow-x: auto; }
  .tg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .tg-table th { text-align: left; color: #848484; font-weight: 500; padding: 4px 8px 4px 0; white-space: nowrap; }
  .tg-table td { padding: 4px 8px 4px 0; color: #bdbdbd; white-space: nowrap; }
  .tg-limits { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .tg-chip { height: 26px; padding: 0 10px; border-radius: 13px; border: 1px solid #313131; background: transparent; color: #bdbdbd; font-size: 12px; cursor: pointer; font-family: inherit; }
  .tg-chip-active { border-color: #f95bad; color: #fff; }
  .tg-mode { display: flex; gap: 8px; flex-wrap: wrap; }
`;

const LIMIT_FIELDS: { key: keyof TelegramBotLimits; label: TKey }[] = [
  { key: "messagesPerDay", label: "tg.limitMessagesPerDay" },
  { key: "messagesPerUser", label: "tg.limitMessagesPerUser" },
  { key: "mediaPerDay", label: "tg.limitMediaPerDay" },
  { key: "mediaPerUser", label: "tg.limitMediaPerUser" },
  { key: "keepBalance", label: "tg.keepBalance" },
];

/**
 * Бот для клиентов: статистика по дням, лимиты и клиенты. Переписка клиентов
 * владельцу не показывается — только счётчики и расход.
 */
function ResellerPanel({ botId }: { botId: string }) {
  const { t } = useT();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<TelegramBotStats | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [clients, setClients] = useState<{ total: number; items: TelegramBotClient[] } | null>(null);
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fail = (err: any) => setError(err?.body?.message || err.message);

  useEffect(() => {
    telegram
      .stats(botId, days)
      .then((s) => {
        setStats(s);
        setLimits(
          Object.fromEntries(
            LIMIT_FIELDS.map(({ key }) => [key, s.limits[key] === null || (key === "keepBalance" && !s.limits[key]) ? "" : String(s.limits[key])]),
          ),
        );
      })
      .catch(fail);
  }, [botId, days]);

  const loadClients = useCallback(() => {
    telegram.clients(botId, page).then(setClients).catch(fail);
  }, [botId, page]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const saveLimits = async () => {
    setError("");
    setSaved(false);
    try {
      const body = Object.fromEntries(
        LIMIT_FIELDS.map(({ key }) => [key, limits[key]?.trim() ? Math.max(0, Math.floor(Number(limits[key]))) : null]),
      ) as Partial<TelegramBotLimits>;
      await telegram.setLimits(botId, body);
      setSaved(true);
    } catch (err) {
      fail(err);
    }
  };

  const deleteClient = async (client: TelegramBotClient) => {
    if (!confirm(t("tg.confirmDeleteClient"))) return;
    try {
      await telegram.deleteClient(botId, client.id);
      loadClients();
    } catch (err) {
      fail(err);
    }
  };

  const pages = clients ? Math.max(1, Math.ceil(clients.total / 50)) : 1;
  const activeDays = stats?.days.filter((d) => d.messages || d.newUsers || d.media || d.credits).reverse() ?? [];

  return (
    <>
      {error && <div className="tg-error">{error}</div>}

      <div className="tg-section">
        <div className="tg-section-title">
          {t("tg.stats")}
          {[1, 7, 30].map((d) => (
            <button key={d} className={`tg-chip${d === days ? " tg-chip-active" : ""}`} onClick={() => setDays(d)}>
              {d} {t("tg.days")}
            </button>
          ))}
        </div>
        {stats && (
          <>
            <div className="tg-tiles">
              <div className="tg-tile">
                <div className="tg-tile-label">{t("tg.statsUsers")}</div>
                <div className="tg-tile-value">{stats.totalUsers}</div>
              </div>
              <div className="tg-tile">
                <div className="tg-tile-label">{t("tg.statsMessages")}</div>
                <div className="tg-tile-value">{stats.totals.messages}</div>
              </div>
              <div className="tg-tile">
                <div className="tg-tile-label">{t("tg.statsMedia")}</div>
                <div className="tg-tile-value">{stats.totals.media}</div>
              </div>
              <div className="tg-tile">
                <div className="tg-tile-label">{t("tg.statsCredits")}</div>
                <div className="tg-tile-value">{stats.totals.credits}</div>
              </div>
            </div>
            {activeDays.length > 0 && (
              <div className="tg-table-wrap">
                <table className="tg-table">
                  <thead>
                    <tr>
                      <th>{t("tg.statsDate")}</th>
                      <th>{t("tg.statsNew")}</th>
                      <th>{t("tg.statsActive")}</th>
                      <th>{t("tg.statsMessages")}</th>
                      <th>{t("tg.statsMedia")}</th>
                      <th>{t("tg.statsCredits")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDays.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.newUsers}</td>
                        <td>{d.activeUsers}</td>
                        <td>{d.messages}</td>
                        <td>{d.media}</td>
                        <td>{d.credits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="tg-section">
        <div className="tg-section-title">{t("tg.limits")}</div>
        <div className="tg-hint">{t("tg.limitsHint")}</div>
        <div className="tg-limits">
          {LIMIT_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="tg-label">{t(label)}</label>
              <input
                className="tg-input"
                type="number"
                min={0}
                value={limits[key] ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setLimits((prev) => ({ ...prev, [key]: e.target.value }));
                }}
              />
            </div>
          ))}
        </div>
        <div className="tg-row">
          <button className="tg-btn" onClick={saveLimits}>{t("tg.save")}</button>
          {saved && <span className="tg-hint">{t("tg.saved")}</span>}
        </div>
      </div>

      <div className="tg-section">
        <div className="tg-section-title">
          {t("tg.clients")} {clients ? `(${clients.total})` : ""}
        </div>
        {clients && clients.items.length === 0 && <div className="tg-hint">{t("tg.clientsEmpty")}</div>}
        {clients && clients.items.length > 0 && (
          <div className="tg-table-wrap">
            <table className="tg-table">
              <thead>
                <tr>
                  <th />
                  <th>{t("tg.clientLastSeen")}</th>
                  <th>{t("tg.statsMessages")}</th>
                  <th>{t("tg.statsCredits")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.username ? `@${c.username}` : c.firstName || "—"}
                      {c.blockedAt && <span className="tg-hint"> · {t("tg.clientBlocked")}</span>}
                    </td>
                    <td>{c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : "—"}</td>
                    <td>{c.messages}</td>
                    <td>{c.credits}</td>
                    <td>
                      <button className="tg-chip" onClick={() => deleteClient(c)}>{t("tg.deleteClient")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="tg-row">
            <button className="tg-chip" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("tg.prev")}</button>
            <span className="tg-hint">{page} / {pages}</span>
            <button className="tg-chip" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("tg.next")}</button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Диагностика бота: куда Telegram шлёт сообщения, последняя ошибка доставки
 * и последние входящие обновления с результатом обработки.
 */
function BotDiagnostics({ botId }: { botId: string }) {
  const { t } = useT();
  const [data, setData] = useState<TelegramBotDiagnostics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    telegram.diagnostics(botId).then(setData).catch((err) => setError(err?.body?.message || err.message));
  }, [botId]);

  if (error) return <div className="tg-diag tg-diag-bad">{error}</div>;
  if (!data) return <div className="tg-diag">…</div>;
  const urlMismatch = data.expectedWebhookUrl && data.webhook && data.webhook.url !== data.expectedWebhookUrl;
  return (
    <div className="tg-diag">
      {data.pollingMode && <div>TELEGRAM_POLLING=true</div>}
      {data.webhookError && <div className="tg-diag-bad">{data.webhookError}</div>}
      {data.webhook && (
        <>
          <div className="tg-diag-row">
            <span className="tg-diag-key">{t("tg.diagWebhook")}:</span>
            <span className={urlMismatch || !data.webhook.url ? "tg-diag-bad" : undefined}>{data.webhook.url || "—"}</span>
          </div>
          {urlMismatch && (
            <div className="tg-diag-row">
              <span className="tg-diag-key">{t("tg.diagExpected")}:</span>
              <span>{data.expectedWebhookUrl}</span>
            </div>
          )}
          <div className="tg-diag-row">
            <span className="tg-diag-key">{t("tg.diagPending")}:</span>
            <span className={data.webhook.pendingUpdateCount > 0 ? "tg-diag-bad" : undefined}>{data.webhook.pendingUpdateCount}</span>
          </div>
          {data.webhook.lastErrorMessage && (
            <div className="tg-diag-row">
              <span className="tg-diag-key">{t("tg.diagLastError")}:</span>
              <span className="tg-diag-bad">
                {data.webhook.lastErrorMessage}
                {data.webhook.lastErrorAt ? ` (${new Date(data.webhook.lastErrorAt).toLocaleString()})` : ""}
              </span>
            </div>
          )}
        </>
      )}
      <div className="tg-diag-key" style={{ marginTop: 6 }}>{t("tg.diagUpdates")}:</div>
      {data.updates.length === 0 ? (
        <div>{t("tg.diagEmpty")}</div>
      ) : (
        <table className="tg-diag-table">
          <tbody>
            {data.updates.map((u) => (
              <tr key={u.updateId}>
                <td>{new Date(u.createdAt).toLocaleTimeString()}</td>
                <td className={u.status === "done" ? undefined : "tg-diag-bad"}>
                  {u.status} ×{u.attempts}
                </td>
                <td className="tg-diag-bad">{u.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Личный Telegram-бот: подключение по токену @BotFather, привязка Telegram-
 * аккаунта (deep-link), смена персонажа, отключение. Переписка и кредиты
 * общие с сайтом.
 */
export default function TelegramPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const [bots, setBots] = useState<TelegramBotInfo[] | null>(null);
  const [chatList, setChatList] = useState<ChatSession[]>([]);
  const [token, setToken] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [mode, setMode] = useState<TelegramBotMode>("PERSONAL");
  const [busy, setBusy] = useState<string | null>(null);
  const [diagFor, setDiagFor] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Персонажи, с которыми у пользователя есть чаты (без повторов).
  const characterOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const c of chatList) if (!seen.has(c.character.id)) seen.set(c.character.id, c.character);
    return [...seen.values()];
  }, [chatList]);

  const load = useCallback(async () => {
    try {
      const [botList, chatPage] = await Promise.all([telegram.listBots(), chats.list()]);
      setBots(botList);
      setChatList(chatPage.items);
    } catch (err: any) {
      setError(err?.body?.message || err.message);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) load();
  }, [loading, user, load]);

  useEffect(() => {
    if (!characterId && characterOptions.length) setCharacterId(characterOptions[0].id);
  }, [characterOptions, characterId]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(err?.body?.message || err.message);
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      await telegram.connectBot(token.trim(), characterId, mode);
      setToken("");
    });

  const link = (bot: TelegramBotInfo) =>
    run(`link-${bot.id}`, async () => {
      const { url } = await telegram.createLink(bot.id);
      window.open(url, "_blank", "noopener");
    });

  if (loading) return null;
  if (!user) {
    return (
      <div className="tg-page">
        <style>{PAGE_CSS}</style>
        <Link href="/login" className="tg-btn" style={{ display: "inline-flex", alignItems: "center", width: "fit-content" }}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="tg-page">
      <style>{PAGE_CSS}</style>
      <div>
        <h1 className="tg-title">{t("tg.title")}</h1>
        <p className="tg-subtitle">{t("tg.subtitle")}</p>
      </div>

      {error && <div className="tg-error">{error}</div>}

      {bots?.map((bot) => (
        <div key={bot.id} className="tg-card">
          <div className="tg-bot-head">
            {bot.character.avatarUrl ? (
              <img
                className="tg-avatar"
                src={resizedMediaUrl(bot.character.avatarUrl, { w: 128 }) ?? bot.character.avatarUrl}
                alt={bot.character.name}
              />
            ) : (
              <div className="tg-avatar" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tg-bot-name">@{bot.username}</div>
              <div className="tg-bot-meta">{bot.character.name}</div>
            </div>
            {bot.status === "error" ? (
              <span className="tg-badge tg-badge-error">{t("tg.statusError")}</span>
            ) : bot.mode === "RESELLER" ? (
              <span className="tg-badge">{t("tg.resellerBadge")}</span>
            ) : bot.linked ? (
              <span className="tg-badge">{t("tg.linked")}</span>
            ) : null}
          </div>

          {bot.status === "error" && bot.lastError && <div className="tg-error">{bot.lastError}</div>}

          <div>
            <label className="tg-label">{t("tg.character")}</label>
            <select
              className="tg-select"
              value={bot.character.id}
              disabled={busy !== null}
              onChange={(e) => run(`char-${bot.id}`, () => telegram.setCharacter(bot.id, e.target.value))}
            >
              {!characterOptions.some((c) => c.id === bot.character.id) && (
                <option value={bot.character.id}>{bot.character.name}</option>
              )}
              {characterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="tg-row">
            {bot.mode !== "RESELLER" && (
              <button className="tg-btn" disabled={busy !== null} onClick={() => link(bot)}>
                {bot.linked ? t("tg.relink") : t("tg.link")}
              </button>
            )}
            <a className="tg-btn tg-btn-ghost" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
              {t("tg.open")}
            </a>
            {/* Заново регистрирует webhook и команды — после смены домена/настроек сервера. */}
            <button className="tg-btn tg-btn-ghost" disabled={busy !== null} onClick={() => run(`retry-${bot.id}`, () => telegram.reconfigure(bot.id))}>
              {bot.status === "error" ? t("tg.retry") : t("tg.reconfigure")}
            </button>
            <button
              className="tg-btn tg-btn-ghost"
              onClick={() => setDiagFor(diagFor === bot.id ? null : bot.id)}
            >
              {t("tg.diagnostics")}
            </button>
            <button
              className="tg-btn tg-btn-danger"
              disabled={busy !== null}
              onClick={() => confirm(t("tg.confirmDisconnect")) && run(`off-${bot.id}`, () => telegram.disconnect(bot.id))}
            >
              {t("tg.disconnect")}
            </button>
          </div>
          {bot.mode !== "RESELLER" && !bot.linked && <div className="tg-hint">{t("tg.linkHint")}</div>}
          {diagFor === bot.id && <BotDiagnostics key={busy ?? "idle"} botId={bot.id} />}
          {bot.mode === "RESELLER" && <ResellerPanel botId={bot.id} />}
        </div>
      ))}

      {bots && (
        <div className="tg-card">
          {bots.length > 0 && <div className="tg-section-title">{t("tg.addAnother")}</div>}
          <p className="tg-howto">{t("tg.howTo")}</p>
          <div>
            <label className="tg-label">{t("tg.mode")}</label>
            <div className="tg-mode">
              {(["PERSONAL", "RESELLER"] as const).map((m) => (
                <button key={m} className={`tg-chip${mode === m ? " tg-chip-active" : ""}`} onClick={() => setMode(m)}>
                  {m === "PERSONAL" ? t("tg.modePersonal") : t("tg.modeReseller")}
                </button>
              ))}
            </div>
            <div className="tg-hint" style={{ marginTop: 6 }}>
              {mode === "PERSONAL" ? t("tg.modePersonalHint") : t("tg.modeResellerHint")}
            </div>
          </div>
          <div>
            <label className="tg-label">{t("tg.token")}</label>
            <input
              className="tg-input"
              placeholder="123456789:AA..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="tg-label">{t("tg.character")}</label>
            {characterOptions.length ? (
              <select className="tg-select" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                {characterOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="tg-hint">
                {t("tg.noChats")} <Link href="/characters" style={{ color: "#f95bad" }}>→</Link>
              </div>
            )}
          </div>
          <div className="tg-row">
            <button className="tg-btn" disabled={busy !== null || !token.trim() || !characterId} onClick={connect}>
              {busy === "connect" ? t("tg.connecting") : t("tg.connect")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
