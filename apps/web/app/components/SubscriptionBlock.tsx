"use client";

import React from "react";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";

/* ═══════════════════════════════════════
   Shared subscription block — used both in the profile Subscription tab
   and on the standalone /subscription page. Upgrade / Manage buttons are
   intentionally stubs (no handlers), matching the profile behaviour.
═══════════════════════════════════════ */

const FEATURES: { icon: string; labelKey: TKey; free: string; pro: string }[] = [
  { icon: "💬", labelKey: "profile.featMessages",      free: "10",  pro: "∞" },
  { icon: "🖼️", labelKey: "profile.featImages",        free: "10",  pro: "∞" },
  { icon: "🎬", labelKey: "profile.featVideo",         free: "✗",   pro: "✓" },
  { icon: "❤️", labelKey: "profile.featRelationships", free: "1",   pro: "∞" },
  { icon: "⭐", labelKey: "profile.featPremiumChars",  free: "✗",   pro: "✓" },
  { icon: "🎭", labelKey: "profile.featPersonas",      free: "✗",   pro: "✓" },
  { icon: "📷", labelKey: "profile.featNsfw",          free: "✗",   pro: "✓" },
  { icon: "⚡", labelKey: "profile.featPriority",      free: "✗",   pro: "✓" },
];

function IcoDiamond() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M6 3h12l4 6-10 13L2 9z" fill="none" stroke="#F95BAD" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 9h20" stroke="#F95BAD" strokeWidth="1.5"/>
      <path d="M12 3 8 9m4-6 4 6" stroke="#FF99CE" strokeWidth="1" opacity="0.7"/>
    </svg>
  );
}

function IcoCheckCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke="#C1F0AA" strokeWidth="1.4"/>
      <path d="M8 12l3 3 5-5" stroke="#C1F0AA" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IcoXCircle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9.5" stroke="#848484" strokeWidth="1.4"/>
      <path d="M15 9l-6 6M9 9l6 6" stroke="#848484" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

/**
 * Standalone CSS for the subscription block. The profile page already defines
 * these classes as part of its own stylesheet, so it does NOT need this — but
 * the /subscription page includes it via <SubscriptionBlockStyles />.
 */
export const SUBSCRIPTION_CSS = `
.pp-sub { display: flex; gap: 8px; align-items: flex-start; }
.pp-sub-card {
  flex: 0 0 300px; width: 300px; min-height: 416px;
  border: 1px solid rgba(255,153,206,0.6); border-radius: 4px;
  padding: 20px 16px; display: flex; flex-direction: column; gap: 12px;
  align-items: center; text-align: center;
  background:
    radial-gradient(circle 160px at 50% 60%, rgba(200,40,110,0.55) 0%, rgba(100,15,60,0.25) 50%, transparent 72%),
    linear-gradient(180deg, #0d080e 0%, #120a12 100%);
}
.pp-sub-icon {
  width: 54px; height: 54px;
  background: #1e1e1e; border: 0.8px solid rgba(228,0,120,0.3);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
}
.pp-sub-title {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1; color: #fff;
}
.pp-sub-price { display: flex; gap: 6px; align-items: flex-end; justify-content: center; }
.pp-sub-amount {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1; color: #fff;
}
.pp-sub-period {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0; margin-bottom: 4px;
}
.pp-sub-charge {
  background: rgba(0,0,0,0.35); height: 28px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; padding: 0 12px;
  font-size: 11px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0; white-space: nowrap; width: 100%;
}
.pp-sub-spacer { flex: 1; }
.pp-sub-btns { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.pp-btn-grad {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-btn-grad:disabled { opacity: 0.6; cursor: not-allowed; }
.pp-btn-dark {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: #121212; border: 1px solid #313131; width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-sub-right { flex: 1; min-width: 0; }
.pp-feat-table { display: grid; grid-template-columns: 1fr 76px; gap: 6px; }
.pp-feat-card {
  background: #252525; border: 1px solid #313131; border-radius: 4px;
  padding: 10px 12px; display: flex; gap: 10px; align-items: center;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-feat-ico {
  width: 26px; height: 26px; flex-shrink: 0;
  background: rgba(48,39,43,0.5); border-radius: 4px;
  display: flex; align-items: center; justify-content: center; font-size: 13px;
}
.pp-cmp-cell {
  background: #1e1e1e; border: 1px solid #313131; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.pp-cmp-val { font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #d0d0d0; }
@media (max-width: 768px) {
  .pp-sub { flex-direction: column; }
  .pp-sub-card { flex: none; width: 100%; }
  .pp-sub-right { flex-direction: column; }
}
`;

export function SubscriptionBlockStyles() {
  return <style dangerouslySetInnerHTML={{ __html: SUBSCRIPTION_CSS }} />;
}

export default function SubscriptionBlock() {
  const { t } = useT();
  return (
    <div className="pp-sub">
      <div className="pp-sub-card">
        <div className="pp-sub-icon"><IcoDiamond /></div>
        <div className="pp-sub-title">{t("profile.proPlan")}</div>
        <div className="pp-sub-price">
          <span className="pp-sub-amount">$ 25</span>
          <span className="pp-sub-period">{t("profile.perMonths")}</span>
        </div>
        <div className="pp-sub-charge">{t("profile.chargeOn", { date: "07/23/2026" })}</div>
        <div className="pp-sub-spacer" />
        <div className="pp-sub-btns">
          <button className="pp-btn-grad">{t("profile.upgrade")}</button>
          <button className="pp-btn-dark">{t("profile.manageSubscription")}</button>
        </div>
      </div>

      <div className="pp-sub-right">
        <div className="pp-feat-table">
          {FEATURES.map((f) => (
            <React.Fragment key={f.labelKey}>
              <div className="pp-feat-card" key={`${f.labelKey}-card`}>
                <div className="pp-feat-ico">{f.icon}</div>
                {t(f.labelKey)}
              </div>
              <div className="pp-cmp-cell" key={`${f.labelKey}-cmp`}>
                {f.pro === "✓" ? <IcoCheckCircle /> : f.pro === "✗" ? <IcoXCircle /> : <span className="pp-cmp-val">{f.pro}</span>}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
