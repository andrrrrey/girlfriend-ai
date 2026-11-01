"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";
import {
  ApiError,
  payments,
  type BillingProduct,
  type OwnSubscription,
  type PaymentProviderId,
  type PaymentSummary,
} from "../../lib/api";

/* ═══════════════════════════════════════
   Shared subscription block — used both in the profile Subscription tab
   and on the standalone /subscription page: Premium, credit packs, checkout
   and payment history. Цены и способы оплаты приходят с сервера.
═══════════════════════════════════════ */

/** Предупреждаем о конце Premium без автопродления за столько дней. */
const EXPIRY_WARNING_DAYS = 7;

const METHOD_LABELS: Record<PaymentProviderId, TKey> = {
  upgate: "pay.methodUpgate",
  coingate: "pay.methodCoingate",
};

const ERROR_KEYS: Record<string, TKey> = {
  PAYMENTS_BLOCKED: "pay.errorBlocked",
  PAYMENTS_ADULT_ONLY: "pay.errorAdult",
  PAYMENTS_DEMO_USER: "pay.errorDemo",
  SUBSCRIPTION_ACTIVE: "pay.errorSubscriptionActive",
  TOO_MANY_CHECKOUTS: "pay.errorTooMany",
  PAYMENT_METHOD_UNAVAILABLE: "pay.errorMethod",
};

function errorKey(err: unknown): TKey {
  if (err instanceof ApiError) {
    if (err.status === 429) return "pay.errorTooMany";
    const code = err.body?.error;
    if (typeof code === "string" && ERROR_KEYS[code]) return ERROR_KEYS[code];
  }
  return "pay.errorGeneric";
}

export function formatMoney(minor: number, currency: string, lang: string): string {
  return new Intl.NumberFormat(lang, { style: "currency", currency }).format(minor / 100);
}

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

/** Стили оплаты. Профиль не подключает SUBSCRIPTION_CSS, поэтому они отдельно. */
const PAYMENTS_CSS = `
.pay-root { display: flex; flex-direction: column; gap: 24px; font-family: 'Syne', sans-serif; color: #fff; }
.pay-banner { border: 1px solid #313131; border-radius: 4px; background: #1e1e1e; padding: 12px 16px;
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; font-size: 13px; }
.pay-banner-title { font-weight: 700; margin-bottom: 4px; }
.pay-muted { color: #969696; font-size: 12px; line-height: 1.5; }
.pay-warning { color: #f0b429; }
.pay-error { color: #e36466; font-size: 12px; line-height: 1.5; }
.pay-h2 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
.pay-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 12px; }
.pay-pack { background: #1e1e1e; border: 1px solid #313131; border-radius: 4px; padding: 14px;
  display: flex; flex-direction: column; gap: 8px; }
.pay-pack-name { font-size: 14px; font-weight: 700; }
.pay-pack-price { font-size: 20px; font-weight: 700; }
.pay-plan { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.pay-btn { display: flex; align-items: center; justify-content: center; min-height: 38px; padding: 0 12px; border-radius: 4px;
  border: none; cursor: pointer; font: 500 14px 'Syne', sans-serif; color: #fff;
  background: linear-gradient(90deg, #f95bad, #ff0084); }
.pay-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pay-btn-dark { background: #121212; border: 1px solid #313131; }
.pay-table-wrap { overflow-x: auto; margin-top: 12px; }
.pay-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 480px; }
.pay-table th { text-align: left; color: #969696; font-weight: 500; padding: 6px 8px; border-bottom: 1px solid #313131; }
.pay-table td { padding: 8px; border-bottom: 1px solid #252525; }
.pay-modal-bg { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.7); padding: 16px; }
.pay-modal { width: 100%; max-width: 420px; max-height: 100%; overflow-y: auto; background: #1a1a1a; border: 1px solid #313131;
  border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.pay-method { display: flex; gap: 8px; align-items: center; padding: 10px; border: 1px solid #313131; border-radius: 4px;
  font-size: 13px; cursor: pointer; }
.pay-terms { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5; color: #d0d0d0; cursor: pointer; }
`;

export default function SubscriptionBlock() {
  const { t, lang } = useT();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [catalog, setCatalog] = useState<{ products: BillingProduct[]; providers: PaymentProviderId[] } | null>(null);
  const [own, setOwn] = useState<OwnSubscription | null>(null);
  const [history, setHistory] = useState<PaymentSummary[]>([]);
  const [selected, setSelected] = useState<BillingProduct | null>(null);
  const [method, setMethod] = useState<PaymentProviderId | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<TKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageError, setPageError] = useState<TKey | null>(null);

  const formatDate = useCallback((value: string) => new Date(value).toLocaleDateString(lang), [lang]);

  const loadOwn = useCallback(async () => {
    const [subscription, list] = await Promise.all([payments.getSubscription(), payments.list()]);
    setOwn(subscription);
    setHistory(list);
  }, []);

  useEffect(() => {
    payments.getCatalog().then(setCatalog).catch(() => setCatalog({ products: [], providers: [] }));
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    loadOwn().catch(() => setPageError("pay.errorGeneric"));
  }, [authLoading, user, loadOwn]);

  // Ссылка #credits из попапа: блок появляется только после загрузки каталога.
  useEffect(() => {
    if (catalog && window.location.hash === "#credits") {
      document.getElementById("credits")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [catalog]);

  const open = (product: BillingProduct) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setSelected(product);
    setMethod(catalog?.providers.length === 1 ? catalog.providers[0] : null);
    setTermsAccepted(false);
    setCheckoutError(null);
  };

  const pay = async () => {
    if (!selected || !method || !termsAccepted) return;
    setBusy(true);
    setCheckoutError(null);
    try {
      const { redirectUrl } = await payments.checkout(selected.id, method);
      window.location.assign(redirectUrl);
    } catch (err) {
      setCheckoutError(errorKey(err));
      setBusy(false);
    }
  };

  const cancelRenewal = async () => {
    const subscription = own?.subscription;
    if (!subscription || !window.confirm(t("pay.cancelRenewalConfirm"))) return;
    try {
      await payments.cancelAutoRenew();
      setNotice(t("pay.renewalCancelled", { date: formatDate(subscription.expiresAt) }));
      await loadOwn();
    } catch (err) {
      setPageError(errorKey(err));
    }
  };

  const premiumProducts = catalog?.products.filter((p) => p.kind === "premium") ?? [];
  const creditProducts = catalog?.products.filter((p) => p.kind === "credits") ?? [];
  const purchasable = Boolean(catalog && catalog.providers.length > 0);
  const subscription = own?.subscription?.status === "active" ? own.subscription : null;
  const expiresSoon =
    subscription &&
    !subscription.autoRenew &&
    new Date(subscription.expiresAt).getTime() - Date.now() < EXPIRY_WARNING_DAYS * 24 * 60 * 60_000;
  const premiumManual = !subscription && user?.subscription === "paid";
  const blocked = own?.paymentsBlocked ?? false;
  const buyDisabled = !purchasable || blocked;
  const buyLabel = user ? t("pay.buy") : t("pay.loginRequired");

  return (
    <div className="pay-root">
      <style dangerouslySetInnerHTML={{ __html: PAYMENTS_CSS }} />

      {(subscription || premiumManual) && (
        <div className="pay-banner">
          <div>
            <div className="pay-banner-title">{t("pay.premiumActive")}</div>
            {subscription && (
              <div className={expiresSoon ? "pay-warning" : "pay-muted"}>
                {subscription.autoRenew
                  ? t("pay.renewsOn", { date: formatDate(subscription.expiresAt) })
                  : expiresSoon
                    ? t("pay.expiresSoon", { date: formatDate(subscription.expiresAt) })
                    : t("pay.premiumUntil", { date: formatDate(subscription.expiresAt) })}
              </div>
            )}
          </div>
          {subscription?.autoRenew && (
            <button className="pay-btn pay-btn-dark" onClick={cancelRenewal}>{t("pay.cancelRenewal")}</button>
          )}
        </div>
      )}
      {notice && <div className="pay-muted">{notice}</div>}
      {blocked && <div className="pay-error">{t("pay.errorBlocked")}</div>}
      {pageError && <div className="pay-error">{t(pageError)}</div>}
      {catalog && !purchasable && <div className="pay-muted">{t("pay.unavailable")}</div>}

      <div className="pp-sub">
        <div className="pp-sub-card">
          <div className="pp-sub-icon"><IcoDiamond /></div>
          <div className="pp-sub-title">{t("profile.proPlan")}</div>
          <div className="pp-sub-spacer" />
          <div className="pay-plan">
            {premiumProducts.map((product) => (
              <React.Fragment key={product.id}>
                <div className="pp-sub-price">
                  <span className="pp-sub-amount">{formatMoney(product.priceMinor, product.currency, lang)}</span>
                  <span className="pp-sub-period">{t("pay.perDays", { days: product.periodDays ?? 0 })}</span>
                </div>
                {product.credits > 0 && <div className="pay-muted">{t("pay.bonusCredits", { credits: product.credits })}</div>}
                {!subscription?.autoRenew && (
                  <button className="pay-btn" disabled={buyDisabled} onClick={() => open(product)}>
                    {buyLabel}
                  </button>
                )}
              </React.Fragment>
            ))}
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

      {creditProducts.length > 0 && (
        <section id="credits">
          <h2 className="pay-h2">{t("pay.creditsTitle")}</h2>
          <div className="pay-muted">{t("pay.creditsSubtitle")}</div>
          <div className="pay-grid">
            {creditProducts.map((product) => (
              <div className="pay-pack" key={product.id}>
                <div className="pay-pack-name">{t("pay.creditsAmount", { credits: product.credits })}</div>
                <div className="pay-pack-price">{formatMoney(product.priceMinor, product.currency, lang)}</div>
                <button className="pay-btn" disabled={buyDisabled} onClick={() => open(product)}>{buyLabel}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {user && (
        <section>
          <h2 className="pay-h2">{t("pay.historyTitle")}</h2>
          {history.length === 0 ? (
            <div className="pay-muted">{t("pay.historyEmpty")}</div>
          ) : (
            <div className="pay-table-wrap">
              <table className="pay-table">
                <tbody>
                  {history.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.createdAt)}</td>
                      <td>{payment.productTitle}</td>
                      <td>{formatMoney(payment.amountMinor, payment.currency, lang)}</td>
                      <td>{t(`pay.status.${payment.status}` as TKey)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selected && (
        <div className="pay-modal-bg" onClick={() => !busy && setSelected(null)}>
          <div className="pay-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="pay-h2">{t("pay.checkoutTitle")}</h2>
            <div>
              {selected.kind === "credits" ? t("pay.creditsAmount", { credits: selected.credits }) : selected.title}
              {" — "}
              <b>{formatMoney(selected.priceMinor, selected.currency, lang)}</b>
            </div>

            <div className="pay-muted">{t("pay.method")}</div>
            {catalog?.providers.map((provider) => (
              <label className="pay-method" key={provider}>
                <input type="radio" name="pay-method" checked={method === provider} onChange={() => setMethod(provider)} />
                {t(METHOD_LABELS[provider])}
              </label>
            ))}

            {selected.kind === "premium" && method === "upgate" && (
              <div className="pay-muted">{t("pay.renewsAuto", { days: selected.periodDays ?? 0 })}</div>
            )}
            {selected.kind === "premium" && method === "coingate" && (
              <div className="pay-muted">{t("pay.noRenewalCrypto")}</div>
            )}

            <label className="pay-terms">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              {t("pay.terms")}
            </label>

            {checkoutError && <div className="pay-error">{t(checkoutError)}</div>}

            <button className="pay-btn" disabled={busy || !method || !termsAccepted} onClick={pay}>
              {busy ? t("pay.redirecting") : t("pay.continue")}
            </button>
            <button className="pay-btn pay-btn-dark" disabled={busy} onClick={() => setSelected(null)}>
              {t("pay.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
