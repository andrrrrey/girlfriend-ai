"use client";

/**
 * Админка → «Финмодель».
 *
 * Считает экономику платформы: себестоимость операций (USD, по истории генераций
 * из раздела «Расходы») → цены операций в кредитах и тарифы, при которых после
 * комиссий платёжки, возвратов и расходов на нейросети остаётся целевая маржа.
 *
 * Расчёт выполняется на бэкенде (POST /admin/finance-model/calculate) при каждом
 * изменении допущений. Применение — только по кнопке и с подтверждением:
 * цены операций сохраняются новой версией таблицы цен (как в «Биллинге»),
 * кредиты тарифа — в продукт, предлагаемая сетка — новыми неактивными продуктами.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import {
  admin,
  type FinanceAssumptions,
  type FinanceData,
  type FinanceOperationKey,
  type FinanceResult,
  type FinanceUsageMix,
} from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const s: Record<string, React.CSSProperties> = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    color: "#848484",
    fontSize: 11,
    fontWeight: 600,
    padding: "8px 10px",
    borderBottom: "1px solid #313131",
    whiteSpace: "nowrap",
  },
  td: { padding: "8px 10px", borderBottom: "1px solid #1e1e1e", color: "#ccc", verticalAlign: "middle" },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  small: { color: "#848484", fontSize: 11 },
  input: {
    width: "100%",
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 4,
    padding: "6px 8px",
    color: "#fff",
    fontSize: 12,
    outline: "none",
    fontFamily: "'Syne', sans-serif",
    boxSizing: "border-box",
  },
  cellInput: {
    width: 90,
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 4,
    padding: "5px 8px",
    color: "#fff",
    fontSize: 12,
    textAlign: "right",
    outline: "none",
    fontFamily: "'Syne', sans-serif",
  },
  stat: { color: "#ccc", fontSize: 12 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: 700, marginTop: 4 },
  warning: { color: "#f0b429", fontSize: 12, margin: "4px 0" },
  section: { ...adminStyles.card, marginBottom: 20 },
  actions: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, alignItems: "center" },
};

const USAGE_FIELDS: { key: keyof FinanceUsageMix; label: string }[] = [
  { key: "chatMessages", label: "Сообщений в чате" },
  { key: "images", label: "Изображений" },
  { key: "hiresImages", label: "Из них с hires fix" },
  { key: "videos", label: "Видео" },
  { key: "ttsChars", label: "Озвучено символов" },
  { key: "sttMessages", label: "Голосовых сообщений" },
];

function usd(n: number): string {
  const digits = n !== 0 && Math.abs(n) < 0.01 ? 6 : 2;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function pct(m: number | null): string {
  return m === null ? "—" : `${Math.round(m * 100)}%`;
}

/** Цвет маржи относительно целевой: красный — убыток, жёлтый — ниже цели. */
function marginColor(m: number | null, target: number): string {
  if (m === null) return "#848484";
  if (m < 0) return "#ff4d6d";
  if (m < target - 1e-9) return "#f0b429";
  return "#7ed492";
}

/** Поля допущений в форме — строками, чтобы можно было стирать и вводить. */
interface Form {
  targetMargin: string;
  paymentFeePct: string;
  paymentFixedUsd: string;
  refundPct: string;
  creditPriceUsd: string;
  usage: Record<keyof FinanceUsageMix, string>;
  costOverrides: Partial<Record<FinanceOperationKey, string>>;
  gridPrices: string;
  premiumPrices: string;
}

function toForm(a: FinanceAssumptions): Form {
  return {
    targetMargin: String(Math.round(a.targetMargin * 100)),
    paymentFeePct: String(Math.round(a.paymentFeePct * 1000) / 10),
    paymentFixedUsd: String(a.paymentFixedUsd),
    refundPct: String(Math.round(a.refundPct * 1000) / 10),
    creditPriceUsd: String(a.creditPriceUsd),
    usage: Object.fromEntries(USAGE_FIELDS.map((f) => [f.key, String(a.usage[f.key])])) as Form["usage"],
    costOverrides: {},
    gridPrices: (a.gridPrices ?? []).join(", "),
    premiumPrices: (a.premiumPrices ?? []).join(", "),
  };
}

function fromForm(f: Form): Partial<FinanceAssumptions> {
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));
  const list = (v: string) =>
    v
      .split(/[;,\s]+/)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);
  const out: Partial<FinanceAssumptions> = {};
  if (Number.isFinite(n(f.targetMargin))) out.targetMargin = n(f.targetMargin) / 100;
  if (Number.isFinite(n(f.paymentFeePct))) out.paymentFeePct = n(f.paymentFeePct) / 100;
  if (Number.isFinite(n(f.paymentFixedUsd))) out.paymentFixedUsd = n(f.paymentFixedUsd);
  if (Number.isFinite(n(f.refundPct))) out.refundPct = n(f.refundPct) / 100;
  if (Number.isFinite(n(f.creditPriceUsd)) && n(f.creditPriceUsd) > 0) out.creditPriceUsd = n(f.creditPriceUsd);
  const usage = {} as FinanceUsageMix;
  for (const { key } of USAGE_FIELDS) usage[key] = Math.max(0, n(f.usage[key]) || 0);
  out.usage = usage;
  const overrides: Partial<Record<FinanceOperationKey, number>> = {};
  for (const [k, v] of Object.entries(f.costOverrides)) {
    if (v !== undefined && Number.isFinite(n(v)) && n(v) >= 0) overrides[k as FinanceOperationKey] = n(v);
  }
  out.costOverrides = overrides;
  out.gridPrices = list(f.gridPrices);
  out.premiumPrices = list(f.premiumPrices);
  return out;
}

export default function AdminFinancePage() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [data, setData] = useState<FinanceData | null>(null);
  const [result, setResult] = useState<FinanceResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await admin.getFinanceModel();
      setData(res.data);
      setResult(res.result);
      setForm(toForm(res.result.assumptions));
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
  }, [loading, user, load]);

  // Пересчёт при изменении допущений (с задержкой, чтобы не слать запрос на каждую цифру).
  const recalc = useCallback((next: Form) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++requestId.current;
      setCalculating(true);
      try {
        const res = await admin.calculateFinanceModel(fromForm(next));
        if (id !== requestId.current) return; // пришёл ответ на устаревший запрос
        setData(res.data);
        setResult(res.result);
        setError("");
      } catch (err: any) {
        if (id === requestId.current) setError(err.message);
      } finally {
        if (id === requestId.current) setCalculating(false);
      }
    }, 400);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <Link href="/" style={adminStyles.link}>На главную</Link>
        </div>
      </div>
    );
  }

  const update = (patch: Partial<Form>) => {
    if (!form) return;
    const next = { ...form, ...patch };
    setForm(next);
    recalc(next);
  };
  const setUsage = (key: keyof FinanceUsageMix, value: string) => form && update({ usage: { ...form.usage, [key]: value } });
  const fillUsage = (mix: FinanceUsageMix) =>
    update({ usage: Object.fromEntries(USAGE_FIELDS.map((f) => [f.key, String(mix[f.key])])) as Form["usage"] });

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 5000);
  };

  // ── Применение рекомендаций

  const applyPrices = async () => {
    if (!result || !data) return;
    const changed = result.operations.filter((o) => o.currentCredits !== o.recommendedCredits);
    const changedModels = result.models.filter((m) => m.currentCredits !== m.recommendedCredits);
    const lines = [
      ...changed.map((o) => `• ${o.label}: ${o.currentCredits} → ${o.recommendedCredits}`),
      ...changedModels.map((m) => `• ${m.model}: ${m.currentCredits} → ${m.recommendedCredits}`),
    ];
    if (!lines.length) {
      flash("Текущие цены уже совпадают с рекомендованными.");
      return;
    }
    if (!confirm(`Сохранить новую версию цен (действует сразу для всех пользователей)?\n\n${lines.join("\n")}`)) return;
    setBusy(true);
    try {
      const saved = await admin.setBillingPrices(result.recommendedPrices);
      flash(`Цены сохранены: версия ${saved.version}.`);
      if (form) recalc(form);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const applyProductCredits = async (productId: string, credits: number) => {
    setBusy(true);
    try {
      const products = await admin.getProducts();
      const p = products.find((x) => x.id === productId);
      if (!p) throw new Error("Продукт не найден");
      if (!confirm(`Тариф «${p.title}»: ${p.credits} → ${credits} кредитов. Новые покупки получат новое количество. Продолжить?`)) return;
      await admin.updateProduct(productId, {
        kind: p.kind,
        title: p.title,
        priceMinor: p.priceMinor,
        currency: p.currency,
        credits,
        periodDays: p.periodDays,
        active: p.active,
        sortOrder: p.sortOrder,
      });
      flash(`Тариф «${p.title}»: теперь ${credits} кредитов.`);
      if (form) recalc(form);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createGridProducts = async () => {
    if (!result?.grid.length) return;
    const lines = result.grid.map((g) => `• ${g.title} — $${g.priceUsd}`);
    if (!confirm(`Создать ${result.grid.length} продуктов? Они будут выключены — включите нужные в разделе «Платежи».\n\n${lines.join("\n")}`)) {
      return;
    }
    setBusy(true);
    try {
      const existing = await admin.getProducts();
      const maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0);
      for (const [i, g] of result.grid.entries()) {
        await admin.createProduct({
          kind: g.kind,
          title: g.title,
          priceMinor: Math.round(g.priceUsd * 100),
          currency: "USD",
          credits: g.credits,
          periodDays: g.periodDays,
          active: false,
          sortOrder: maxOrder + i + 1,
        });
      }
      flash(`Создано продуктов: ${result.grid.length} (выключены). Включите их в разделе «Платежи».`);
      if (form) recalc(form);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const target = result?.assumptions.targetMargin ?? 0.7;
  const creditPrice = result?.assumptions.creditPriceUsd ?? 0.01;

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="finance" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {notice && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>{notice}</div>}

        {/* Сводка */}
        <div style={s.section}>
          <h2 style={adminStyles.title}>Финансовая модель {calculating && <span style={s.small}>· пересчёт…</span>}</h2>
          <p style={adminStyles.subtitle}>
            Себестоимость операций берётся из истории генераций за {data?.windowDays ?? 30} дней и цен моделей
            (раздел «Расходы»). Цена операции в кредитах = себестоимость ÷ (чистая стоимость кредита × (1 − маржа)).
            Чистая стоимость кредита — цена кредита за вычетом комиссии платёжки и возвратов. Маржа тарифов
            считается при полном расходовании кредитов по профилю потребления.
          </p>
          {result && data && (
            <div style={s.grid}>
              <div style={s.stat}>Активных пользователей<div style={s.statValue}>{data.usage.activeUsers}</div></div>
              <div style={s.stat}>Платящих<div style={s.statValue}>{data.usage.payingUsers}</div></div>
              <div style={s.stat}>Цена кредита<div style={s.statValue}>{usd(creditPrice)}</div><span style={s.small}>100 кредитов = {usd(creditPrice * 100)}</span></div>
              <div style={s.stat}>Чистыми с кредита<div style={s.statValue}>{usd(result.netCreditValueUsd)}</div><span style={s.small}>{pct(result.netShare)} после комиссий</span></div>
              <div style={s.stat}>Себестоимость кредита<div style={s.statValue}>{usd(result.mix.recommended.costPerCredit)}</div><span style={s.small}>при рекомендованных ценах</span></div>
              <div style={s.stat}>Стартовый бонус<div style={s.statValue}>{usd(result.welcomeBonus.costUsd)}</div><span style={s.small}>{result.welcomeBonus.credits} кредитов на нового пользователя</span></div>
            </div>
          )}
          {result?.warnings.length ? (
            <div style={{ marginTop: 16 }}>
              {result.warnings.map((w) => <p key={w} style={s.warning}>⚠ {w}</p>)}
            </div>
          ) : null}
        </div>

        {/* Допущения */}
        {form && data && (
          <div style={s.section}>
            <h2 style={adminStyles.title}>Допущения</h2>
            <p style={adminStyles.subtitle}>
              Цена кредита по умолчанию — самый дешёвый за кредит активный пакет: маржа должна сходиться и на нём.
              Комиссии high-risk-эквайринга обычно 8–15% + $0.3 за платёж, криптоплатежей — около 1%.
            </p>
            <div style={s.grid}>
              <div>
                <label style={adminStyles.label}>Целевая маржа, %</label>
                <input style={s.input} value={form.targetMargin} onChange={(e) => update({ targetMargin: e.target.value })} />
              </div>
              <div>
                <label style={adminStyles.label}>Комиссия платёжки, %</label>
                <input style={s.input} value={form.paymentFeePct} onChange={(e) => update({ paymentFeePct: e.target.value })} />
              </div>
              <div>
                <label style={adminStyles.label}>Фикс. комиссия за платёж, $</label>
                <input style={s.input} value={form.paymentFixedUsd} onChange={(e) => update({ paymentFixedUsd: e.target.value })} />
              </div>
              <div>
                <label style={adminStyles.label}>Возвраты и чарджбэки, %</label>
                <input style={s.input} value={form.refundPct} onChange={(e) => update({ refundPct: e.target.value })} />
              </div>
              <div>
                <label style={adminStyles.label}>Цена 1 кредита, $</label>
                <input style={s.input} value={form.creditPriceUsd} onChange={(e) => update({ creditPriceUsd: e.target.value })} />
              </div>
            </div>

            <h3 style={{ color: "#fff", fontSize: 14, margin: "20px 0 6px" }}>Профиль потребления платящего пользователя за месяц</h3>
            <div style={{ ...s.small, marginBottom: 10 }}>
              Подставить из данных:{" "}
              <button style={adminStyles.btnSecondary} onClick={() => fillUsage(data.usage.perPayingUser)}>
                платящий ({data.usage.payingUsers})
              </button>{" "}
              <button style={adminStyles.btnSecondary} onClick={() => fillUsage(data.usage.perActiveUser)}>
                активный ({data.usage.activeUsers})
              </button>
            </div>
            <div style={s.grid}>
              {USAGE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label style={adminStyles.label}>{f.label}</label>
                  <input style={s.input} value={form.usage[f.key]} onChange={(e) => setUsage(f.key, e.target.value)} />
                </div>
              ))}
            </div>

            <h3 style={{ color: "#fff", fontSize: 14, margin: "20px 0 6px" }}>Цены для предлагаемой сетки тарифов, $</h3>
            <div style={s.grid}>
              <div>
                <label style={adminStyles.label}>Пакеты кредитов (через запятую)</label>
                <input style={s.input} value={form.gridPrices} onChange={(e) => update({ gridPrices: e.target.value })} />
              </div>
              <div>
                <label style={adminStyles.label}>Premium на 30 дней (через запятую)</label>
                <input style={s.input} value={form.premiumPrices} onChange={(e) => update({ premiumPrices: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {/* Цены операций */}
        {result && form && (
          <div style={s.section}>
            <h2 style={adminStyles.title}>Цены операций в кредитах</h2>
            <p style={adminStyles.subtitle}>
              Себестоимость можно переопределить вручную (пустое поле — по данным). Цвет маржи: зелёный — не ниже целевой,
              жёлтый — ниже целевой, красный — убыток.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={s.table as React.CSSProperties}>
                <thead>
                  <tr>
                    <th style={s.th}>Операция</th>
                    <th style={{ ...s.th, ...s.num }}>Себестоимость, $</th>
                    <th style={s.th}>Как посчитано</th>
                    <th style={{ ...s.th, ...s.num }}>Сейчас</th>
                    <th style={{ ...s.th, ...s.num }}>Маржа</th>
                    <th style={{ ...s.th, ...s.num }}>Рекомендуем</th>
                    <th style={{ ...s.th, ...s.num }}>Маржа</th>
                  </tr>
                </thead>
                <tbody>
                  {result.operations.map((o) => (
                    <tr key={o.key}>
                      <td style={{ ...s.td, color: "#fff" }}>
                        {o.label}
                        <div style={s.small}>{o.unit}</div>
                        {o.note && <div style={s.small}>{o.note}</div>}
                      </td>
                      <td style={{ ...s.td, ...s.num }}>
                        <input
                          style={s.cellInput}
                          value={form.costOverrides[o.key] ?? ""}
                          placeholder={String(o.basis === "задано вручную" ? "" : o.costUsd)}
                          onChange={(e) => update({ costOverrides: { ...form.costOverrides, [o.key]: e.target.value } })}
                        />
                      </td>
                      <td style={{ ...s.td, ...s.small, maxWidth: 320 }}>{o.basis}</td>
                      <td style={{ ...s.td, ...s.num }}>{o.currentCredits}</td>
                      <td style={{ ...s.td, ...s.num, color: marginColor(o.currentMargin, target) }}>{pct(o.currentMargin)}</td>
                      <td style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 700 }}>{o.recommendedCredits}</td>
                      <td style={{ ...s.td, ...s.num, color: marginColor(o.recommendedMargin, target) }}>{pct(o.recommendedMargin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.models.length > 0 && (
              <>
                <h3 style={{ color: "#fff", fontSize: 14, margin: "20px 0 6px" }}>Цены по моделям (изображения и видео)</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table as React.CSSProperties}>
                    <thead>
                      <tr>
                        <th style={s.th}>Модель</th>
                        <th style={s.th}>Тип</th>
                        <th style={{ ...s.th, ...s.num }}>Генераций</th>
                        <th style={{ ...s.th, ...s.num }}>Себестоимость</th>
                        <th style={{ ...s.th, ...s.num }}>Сейчас</th>
                        <th style={{ ...s.th, ...s.num }}>Маржа</th>
                        <th style={{ ...s.th, ...s.num }}>Рекомендуем</th>
                        <th style={{ ...s.th, ...s.num }}>Маржа</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.models.map((m) => (
                        <tr key={`${m.type}|${m.model}`}>
                          <td style={{ ...s.td, color: "#fff", wordBreak: "break-all" }}>{m.model}</td>
                          <td style={s.td}>{m.type === "image" ? "Изображение" : "Видео"}</td>
                          <td style={{ ...s.td, ...s.num }}>{m.samples}</td>
                          <td style={{ ...s.td, ...s.num }}>{usd(m.costUsd)}</td>
                          <td style={{ ...s.td, ...s.num }}>{m.currentCredits}</td>
                          <td style={{ ...s.td, ...s.num, color: marginColor(m.currentMargin, target) }}>{pct(m.currentMargin)}</td>
                          <td style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 700 }}>{m.recommendedCredits}</td>
                          <td style={{ ...s.td, ...s.num, color: marginColor(m.recommendedMargin, target) }}>{pct(m.recommendedMargin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div style={s.actions}>
              <button style={adminStyles.button} disabled={busy} onClick={applyPrices}>
                Применить рекомендованные цены
              </button>
              <span style={s.small}>
                Сохранит новую версию таблицы цен (сейчас действует версия {data?.priceVersion ?? 0}) — как в разделе «Биллинг».
              </span>
            </div>
          </div>
        )}

        {/* Профиль потребления */}
        {result && (
          <div style={s.section}>
            <h2 style={adminStyles.title}>Пользователь с таким профилем за месяц</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={s.table as React.CSSProperties}>
                <thead>
                  <tr>
                    <th style={s.th}>Цены</th>
                    <th style={{ ...s.th, ...s.num }}>Тратит кредитов</th>
                    <th style={{ ...s.th, ...s.num }}>Платит</th>
                    <th style={{ ...s.th, ...s.num }}>Расходы на нейросети</th>
                    <th style={{ ...s.th, ...s.num }}>Себестоимость кредита</th>
                    <th style={{ ...s.th, ...s.num }}>Маржа</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Текущие", result.mix.current],
                      ["Рекомендованные", result.mix.recommended],
                    ] as const
                  ).map(([label, m]) => (
                    <tr key={label}>
                      <td style={{ ...s.td, color: "#fff" }}>{label}</td>
                      <td style={{ ...s.td, ...s.num }}>{m.credits.toLocaleString("ru-RU")}</td>
                      <td style={{ ...s.td, ...s.num }}>{usd(m.spendUsd)}</td>
                      <td style={{ ...s.td, ...s.num }}>{usd(m.costUsd)}</td>
                      <td style={{ ...s.td, ...s.num }}>{usd(m.costPerCredit)}</td>
                      <td style={{ ...s.td, ...s.num, color: marginColor(m.margin, target) }}>{pct(m.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Текущие тарифы */}
        {result && (
          <div style={s.section}>
            <h2 style={adminStyles.title}>Текущие тарифы</h2>
            <p style={adminStyles.subtitle}>
              Маржа — если покупатель потратит все кредиты по профилю потребления. «Максимум кредитов» — сколько можно
              давать за эту цену при рекомендованных ценах операций, сохранив целевую маржу.
            </p>
            {result.products.length === 0 ? (
              <p style={s.small}>Продуктов пока нет — создайте их из предлагаемой сетки ниже или в разделе «Платежи».</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={s.table as React.CSSProperties}>
                  <thead>
                    <tr>
                      <th style={s.th}>Тариф</th>
                      <th style={{ ...s.th, ...s.num }}>Цена</th>
                      <th style={{ ...s.th, ...s.num }}>Кредитов</th>
                      <th style={{ ...s.th, ...s.num }}>$ за кредит</th>
                      <th style={{ ...s.th, ...s.num }}>Чистыми</th>
                      <th style={{ ...s.th, ...s.num }}>Расходы</th>
                      <th style={{ ...s.th, ...s.num }}>Маржа сейчас</th>
                      <th style={{ ...s.th, ...s.num }}>При рек. ценах</th>
                      <th style={{ ...s.th, ...s.num }}>Максимум кредитов</th>
                      <th style={s.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {result.products.map((p) => (
                      <tr key={p.id}>
                        <td style={{ ...s.td, color: "#fff" }}>
                          {p.title}
                          <div style={s.small}>
                            {p.kind === "premium" ? `Premium, ${p.periodDays ?? "?"} дн.` : "Пакет кредитов"}
                            {p.active ? "" : " · выключен"}
                          </div>
                        </td>
                        <td style={{ ...s.td, ...s.num }}>{usd(p.priceUsd)}</td>
                        <td style={{ ...s.td, ...s.num }}>{p.credits}</td>
                        <td style={{ ...s.td, ...s.num }}>{p.usdPerCredit === null ? "—" : usd(p.usdPerCredit)}</td>
                        <td style={{ ...s.td, ...s.num }}>{usd(p.netUsd)}</td>
                        <td style={{ ...s.td, ...s.num }}>{usd(p.aiCostUsd)}</td>
                        <td style={{ ...s.td, ...s.num, color: marginColor(p.margin, target) }}>{pct(p.margin)}</td>
                        <td style={{ ...s.td, ...s.num, color: marginColor(p.marginRecommended, target) }}>{pct(p.marginRecommended)}</td>
                        <td style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 700 }}>{p.maxCreditsAtTarget}</td>
                        <td style={s.td}>
                          {p.maxCreditsAtTarget > 0 && p.maxCreditsAtTarget !== p.credits && (
                            <button
                              style={adminStyles.btnSecondary}
                              disabled={busy}
                              onClick={() => applyProductCredits(p.id, p.maxCreditsAtTarget)}
                            >
                              Установить {p.maxCreditsAtTarget}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Предлагаемая сетка */}
        {result && (
          <div style={s.section}>
            <h2 style={adminStyles.title}>Предлагаемая сетка тарифов</h2>
            <p style={adminStyles.subtitle}>
              Базовая цена — {usd(creditPrice)} за кредит, крупным пакетам — бонус кредитов (до +25%), но не больше,
              чем позволяет целевая маржа. Premium снимает ограничения демо-режима и даёт кредиты по базовой цене.
              Маржа — при рекомендованных ценах операций.
            </p>
            {result.grid.length === 0 ? (
              <p style={s.small}>Нет вариантов — проверьте цену кредита и цены в допущениях.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={s.table as React.CSSProperties}>
                  <thead>
                    <tr>
                      <th style={s.th}>Тариф</th>
                      <th style={{ ...s.th, ...s.num }}>Цена</th>
                      <th style={{ ...s.th, ...s.num }}>Кредитов</th>
                      <th style={{ ...s.th, ...s.num }}>Бонус</th>
                      <th style={{ ...s.th, ...s.num }}>$ за кредит</th>
                      <th style={{ ...s.th, ...s.num }}>Маржа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.grid.map((g) => (
                      <tr key={`${g.kind}|${g.priceUsd}`}>
                        <td style={{ ...s.td, color: "#fff" }}>{g.title}</td>
                        <td style={{ ...s.td, ...s.num }}>{usd(g.priceUsd)}</td>
                        <td style={{ ...s.td, ...s.num }}>{g.credits.toLocaleString("ru-RU")}</td>
                        <td style={{ ...s.td, ...s.num }}>{g.bonusPct > 0 ? `+${g.bonusPct}%` : "—"}</td>
                        <td style={{ ...s.td, ...s.num }}>{usd(g.usdPerCredit)}</td>
                        <td style={{ ...s.td, ...s.num, color: marginColor(g.margin, target) }}>{pct(g.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={s.actions}>
              <button style={adminStyles.button} disabled={busy || !result.grid.length} onClick={createGridProducts}>
                Создать эти тарифы (выключенными)
              </button>
              <span style={s.small}>Продукты появятся в разделе «Платежи» выключенными — включите нужные вручную.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
