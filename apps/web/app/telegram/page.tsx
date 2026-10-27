"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/auth";
import { useT } from "../../context/language";
import { chats, telegram, type ChatSession, type TelegramBotInfo } from "../../lib/api";

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
`;

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
  const [busy, setBusy] = useState<string | null>(null);
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
      await telegram.connectBot(token.trim(), characterId);
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
              <img className="tg-avatar" src={bot.character.avatarUrl} alt={bot.character.name} />
            ) : (
              <div className="tg-avatar" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tg-bot-name">@{bot.username}</div>
              <div className="tg-bot-meta">{bot.character.name}</div>
            </div>
            {bot.status === "error" ? (
              <span className="tg-badge tg-badge-error">{t("tg.statusError")}</span>
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
            <button className="tg-btn" disabled={busy !== null} onClick={() => link(bot)}>
              {bot.linked ? t("tg.relink") : t("tg.link")}
            </button>
            <a className="tg-btn tg-btn-ghost" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={`https://t.me/${bot.username}`} target="_blank" rel="noopener noreferrer">
              {t("tg.open")}
            </a>
            {bot.status === "error" && (
              <button className="tg-btn tg-btn-ghost" disabled={busy !== null} onClick={() => run(`retry-${bot.id}`, () => telegram.reconfigure(bot.id))}>
                {t("tg.retry")}
              </button>
            )}
            <button
              className="tg-btn tg-btn-danger"
              disabled={busy !== null}
              onClick={() => confirm(t("tg.confirmDisconnect")) && run(`off-${bot.id}`, () => telegram.disconnect(bot.id))}
            >
              {t("tg.disconnect")}
            </button>
          </div>
          {!bot.linked && <div className="tg-hint">{t("tg.linkHint")}</div>}
        </div>
      ))}

      {bots && bots.length === 0 && (
        <div className="tg-card">
          <p className="tg-howto">{t("tg.howTo")}</p>
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
