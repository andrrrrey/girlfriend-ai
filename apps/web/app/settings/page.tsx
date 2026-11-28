"use client";

import React from "react";
import { useT } from "../../context/language";
import { TelegramSettings } from "./TelegramSettings";

const PAGE_CSS = `
  .settings-page { max-width: 760px; margin: 0 auto; padding: 28px 20px 0; display: flex; flex-direction: column; gap: 24px; }
  .settings-title { font-size: 32px; font-weight: 700; margin: 0; font-family: var(--font-heading, inherit); }
  .settings-tabs { display: flex; gap: 0; border-bottom: 1px solid #252525; overflow-x: auto; }
  .settings-tab { display: inline-flex; align-items: center; gap: 8px; padding: 12px 18px; color: #fff; font-size: 15px; font-weight: 500;
    background: none; border: none; border-bottom: 3px solid #f95bad; margin-bottom: -1px; font-family: inherit; white-space: nowrap; }
  @media (max-width: 600px) { .settings-page { padding: 20px 16px 0; } .settings-title { font-size: 26px; } }
`;

/**
 * Страница «Настройки». Сейчас один раздел — Telegram (перенесён с /telegram);
 * новые разделы добавляются вкладками в .settings-tabs.
 */
export default function SettingsPage() {
  const { t } = useT();
  return (
    <div className="settings-page">
      <style>{PAGE_CSS}</style>
      <h1 className="settings-title">{t("nav.settings")}</h1>
      <div className="settings-tabs" role="tablist">
        <span className="settings-tab" role="tab" aria-selected="true" id="telegram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 4.5L2.5 11.8l6.3 2.2 2.4 6.5 3.4-4.3 4.9 3.6z"/><path d="M8.8 14l12.7-9.5"/></svg>
          {t("nav.telegram")}
        </span>
      </div>
      <TelegramSettings />
    </div>
  );
}
