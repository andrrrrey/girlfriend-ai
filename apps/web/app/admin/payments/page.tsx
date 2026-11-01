"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import {
  adminPayments,
  type AdminPayment,
  type AdminPaymentProvider,
  type AdminProduct,
  type AdminProductInput,
} from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const PROVIDER_TITLES: Record<string, string> = { coingate: "CoinGate", upgate: "UpGate" };
const SECRET_LABELS: Record<string, string> = {
  COINGATE_API_TOKEN: "API-токен",
  UPGATE_API_KEY: "API-ключ",
  UPGATE_WEBHOOK_SECRETS: "Секрет подписи постбэков (при ротации — старый и новый через запятую)",
};
const PROVIDER_NOTES: Record<string, string> = {
  coingate: "В API App выберите формат callback JSON. Возвраты выполняются в кабинете CoinGate.",
  upgate: "В кабинете укажите Webhook URL и включите постбэки SUBSCRIPTION: без них автопродление работать не будет.",
};
const STATUSES = ["created", "pending", "paid", "refunded", "partially_refunded", "charged_back", "failed", "expired", "canceled"];
const CURRENCIES = ["USD", "EUR", "GBP"];
const EMPTY_PRODUCT: AdminProductInput = {
  kind: "credits",
  title: "",
  priceMinor: 100,
  currency: "USD",
  credits: 100,
  periodDays: null,
  active: false,
  sortOrder: 0,
};

const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;
const dateTime = (value: string) => new Date(value).toLocaleString("ru");
const cell: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #252525", fontSize: 12, color: "#ddd", verticalAlign: "top" };
const head: React.CSSProperties = { ...cell, color: "#969696", textAlign: "left", fontWeight: 500 };

/** Настройки одного провайдера. Сохранённые ключи не показываются: поля только для ввода новых. */
function ProviderCard({
  provider,
  onSaved,
  onError,
}: {
  provider: AdminPaymentProvider;
  onSaved: (next: AdminPaymentProvider, message: string) => void;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(provider.enabled);
  const [mode, setMode] = useState(provider.mode);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [receiveCurrency, setReceiveCurrency] = useState(String(provider.settings.COINGATE_RECEIVE_CURRENCY ?? ""));
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const save = async () => {
    if (mode === "live" && provider.mode !== "live" && !window.confirm(`Переключить ${PROVIDER_TITLES[provider.provider]} в боевой режим? Покупатели начнут платить реальными деньгами.`)) {
      return;
    }
    setBusy(true);
    try {
      const next = await adminPayments.updateProvider(provider.provider, {
        enabled,
        mode,
        secrets,
        settings: provider.provider === "coingate" ? { COINGATE_RECEIVE_CURRENCY: receiveCurrency.trim() } : {},
      });
      setSecrets({});
      onSaved(next, `${PROVIDER_TITLES[provider.provider]}: настройки сохранены`);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setTestResult("Проверка...");
    try {
      const result = await adminPayments.testProvider(provider.provider);
      setTestResult(result.ok ? "Соединение работает, ключ принят" : `Ошибка: ${result.error}`);
    } catch (err: any) {
      setTestResult(`Ошибка: ${err.message}`);
    }
  };

  return (
    <div style={{ ...adminStyles.card, marginBottom: 20 }}>
      <h2 style={adminStyles.title}>{PROVIDER_TITLES[provider.provider]}</h2>
      <p style={{ ...adminStyles.subtitle, color: provider.available ? "#c1f0aa" : "#f0b429" }}>
        {provider.available ? `Принимает оплату (${provider.mode === "live" ? "боевой режим" : "sandbox"})` : "Оплата не принимается: провайдер выключен или не хватает ключей"}
      </p>
      {provider.secretsUnreadable && (
        <div style={{ ...adminStyles.error, marginBottom: 12 }}>
          Сохранённые ключи не расшифровываются: вероятно, сменился SECRETS_ENC_KEY. Введите все ключи заново.
        </div>
      )}
      <p style={{ color: "#aaa", fontSize: 12, margin: "0 0 16px" }}>{PROVIDER_NOTES[provider.provider]}</p>

      <div style={adminStyles.field}>
        <label style={adminStyles.label}>Webhook URL</label>
        <input style={adminStyles.input} readOnly value={provider.webhookUrl} onFocus={(e) => e.target.select()} />
      </div>

      <div style={{ ...adminStyles.row, flexWrap: "wrap" }}>
        <label style={{ color: "#ddd", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Включён
        </label>
        <select style={{ ...adminStyles.input, width: 160 }} value={mode} onChange={(e) => setMode(e.target.value as "sandbox" | "live")}>
          <option value="sandbox">sandbox</option>
          <option value="live">live (реальные деньги)</option>
        </select>
      </div>

      {provider.requiredSecrets.map((name) => {
        const saved = provider.secrets[name];
        return (
          <div key={name} style={adminStyles.field}>
            <label style={adminStyles.label}>
              {SECRET_LABELS[name] ?? name}: {saved ? `задан (${saved.hint})` : "не задан"}
            </label>
            <input
              style={adminStyles.input}
              type="password"
              autoComplete="new-password"
              placeholder={saved ? "Оставьте пустым, чтобы не менять" : "Введите значение"}
              value={secrets[name] ?? ""}
              onChange={(e) => setSecrets({ ...secrets, [name]: e.target.value })}
            />
          </div>
        );
      })}

      {provider.provider === "coingate" && (
        <div style={adminStyles.field}>
          <label style={adminStyles.label}>Валюта зачисления (необязательно): например USDT или DO_NOT_CONVERT</label>
          <input style={{ ...adminStyles.input, width: 220 }} value={receiveCurrency} onChange={(e) => setReceiveCurrency(e.target.value)} />
        </div>
      )}

      <div style={adminStyles.btnRow}>
        <button style={adminStyles.button} disabled={busy} onClick={save}>{busy ? "Сохранение..." : "Сохранить"}</button>
        <button style={adminStyles.btnSecondary} onClick={test}>Проверить сохранённый ключ</button>
        {testResult && <span style={{ color: "#ccc", fontSize: 12, alignSelf: "center" }}>{testResult}</span>}
      </div>
    </div>
  );
}

/** Форма продукта: новый или существующий. */
function ProductForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: AdminProductInput;
  onSubmit: (data: AdminProductInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [price, setPrice] = useState((initial.priceMinor / 100).toFixed(2));
  const set = (patch: Partial<AdminProductInput>) => setForm({ ...form, ...patch });

  const submit = () => {
    const priceMinor = Math.round(parseFloat(price) * 100);
    onSubmit({
      ...form,
      priceMinor,
      periodDays: form.kind === "premium" ? form.periodDays : null,
    });
  };

  const field = (label: string, node: React.ReactNode) => (
    <div style={adminStyles.field}>
      <label style={adminStyles.label}>{label}</label>
      {node}
    </div>
  );

  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #313131", borderRadius: 4, padding: 16, marginTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {field("Тип", (
          <select style={adminStyles.input} value={form.kind} onChange={(e) => set({ kind: e.target.value as "credits" | "premium", periodDays: e.target.value === "premium" ? form.periodDays ?? 30 : null })}>
            <option value="credits">Пакет кредитов</option>
            <option value="premium">Premium</option>
          </select>
        ))}
        {field("Название", <input style={adminStyles.input} value={form.title} onChange={(e) => set({ title: e.target.value })} />)}
        {field("Цена", <input style={adminStyles.input} type="number" min={0.01} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} />)}
        {field("Валюта", (
          <select style={adminStyles.input} value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        ))}
        {field(form.kind === "premium" ? "Кредиты за каждый период" : "Кредиты", (
          <input style={adminStyles.input} type="number" min={0} value={form.credits} onChange={(e) => set({ credits: parseInt(e.target.value, 10) || 0 })} />
        ))}
        {form.kind === "premium" && field("Период, дней", (
          <input style={adminStyles.input} type="number" min={1} value={form.periodDays ?? ""} onChange={(e) => set({ periodDays: parseInt(e.target.value, 10) || null })} />
        ))}
        {field("Порядок", <input style={adminStyles.input} type="number" value={form.sortOrder} onChange={(e) => set({ sortOrder: parseInt(e.target.value, 10) || 0 })} />)}
      </div>
      <label style={{ color: "#ddd", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
        Продаётся
      </label>
      <div style={adminStyles.btnRow}>
        <button style={adminStyles.button} onClick={submit}>Сохранить</button>
        <button style={adminStyles.btnSecondary} onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}

/**
 * Раздел «Платежи»: ключи провайдеров, каталог, выручка, платежи и очередь проверки.
 * Цены операций в кредитах и сверка кошельков — в разделе «Биллинг».
 */
export default function AdminPaymentsPage() {
  const { user, loading } = useAuth();
  const [providers, setProviders] = useState<AdminPaymentProvider[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminPayments.getStats>>>([]);
  const [items, setItems] = useState<AdminPayment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: "", provider: "", needsReview: false });
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);
  const [detail, setDetail] = useState<AdminPayment | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const flash = (text: string) => {
    setError("");
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const loadPayments = useCallback(async () => {
    try {
      const page = await adminPayments.list(filters);
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (err: any) {
      setError(err.message);
    }
  }, [filters]);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (loading || !isAdmin) return;
    Promise.all([adminPayments.getProviders(), adminPayments.getProducts(), adminPayments.getStats()])
      .then(([nextProviders, nextProducts, nextStats]) => {
        setProviders(nextProviders);
        setProducts(nextProducts);
        setStats(nextStats);
      })
      .catch((err) => setError(err.message));
  }, [loading, isAdmin]);

  useEffect(() => {
    if (!loading && isAdmin) loadPayments();
  }, [loading, isAdmin, loadPayments]);

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      const page = await adminPayments.list({ ...filters, cursor: nextCursor });
      setItems([...items, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveProduct = async (data: AdminProductInput) => {
    if (!Number.isInteger(data.priceMinor) || data.priceMinor < 1) {
      setError("Цена должна быть больше нуля");
      return;
    }
    // Только поля формы: в редактируемой записи есть id и даты, а API отклоняет лишние поля.
    const { kind, title, priceMinor, currency, credits, periodDays, active, sortOrder } = data;
    const body = { kind, title, priceMinor, currency, credits, periodDays, active, sortOrder };
    try {
      if (editing === "new") await adminPayments.createProduct(body);
      else if (editing) await adminPayments.updateProduct(editing.id, body);
      setProducts(await adminPayments.getProducts());
      setEditing(null);
      flash("Продукт сохранён");
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Действие над платежом с обновлением карточки и списка. */
  const act = async (paymentId: string, action: () => Promise<void>, done: string) => {
    try {
      await action();
      setDetail(await adminPayments.get(paymentId));
      await loadPayments();
      flash(done);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const refund = (payment: AdminPayment, transactionId: string, maxMinor: number) => {
    const rawAmount = window.prompt(`Сумма возврата в ${payment.currency}. Пусто — полный возврат (${(maxMinor / 100).toFixed(2)}).`, "");
    if (rawAmount === null) return;
    const amountMinor = rawAmount.trim() === "" ? undefined : Math.round(parseFloat(rawAmount) * 100);
    if (amountMinor !== undefined && !(amountMinor >= 1 && amountMinor <= maxMinor)) {
      setError("Неверная сумма возврата");
      return;
    }
    const reason = window.prompt("Причина возврата:", "");
    if (!reason?.trim()) return;
    act(payment.id, () => adminPayments.refund(payment.id, { transactionId, amountMinor, reason: reason.trim() }),
      "Возврат запрошен. Кредиты и статус изменятся, когда придёт постбэк.");
  };

  const block = (payment: AdminPayment) => {
    if (!payment.userId) return;
    const userId = payment.userId;
    const reason = window.prompt("Причина блокировки покупок:", "");
    if (!reason?.trim()) return;
    act(payment.id, () => adminPayments.blockUser(userId, reason.trim()), "Покупки заблокированы");
  };

  const unblock = (payment: AdminPayment) => {
    if (!payment.userId || !window.confirm("Снять блокировку покупок?")) return;
    const userId = payment.userId;
    act(payment.id, () => adminPayments.unblockUser(userId), "Блокировка снята");
  };

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!isAdmin) {
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

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="payments" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {message && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>{message}</div>}

        {providers.map((provider) => (
          <ProviderCard
            key={provider.provider}
            provider={provider}
            onSaved={(next, text) => {
              setProviders(providers.map((row) => (row.provider === next.provider ? next : row)));
              flash(text);
            }}
            onError={setError}
          />
        ))}

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Каталог</h2>
          <p style={adminStyles.subtitle}>
            Изменение цены не затрагивает уже начатые оплаты. У действующих подписок UpGate сумма продления остаётся прежней.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>{["Название", "Тип", "Цена", "Кредиты", "Период", "Продаётся", ""].map((title) => <th key={title} style={head}>{title}</th>)}</tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td style={cell}>{product.title}</td>
                    <td style={cell}>{product.kind === "premium" ? "Premium" : "Кредиты"}</td>
                    <td style={cell}>{money(product.priceMinor, product.currency)}</td>
                    <td style={cell}>{product.credits}</td>
                    <td style={cell}>{product.periodDays ?? "—"}</td>
                    <td style={cell}>{product.active ? "да" : "нет"}</td>
                    <td style={cell}><button style={adminStyles.btnSecondary} onClick={() => setEditing(product)}>Изменить</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing ? (
            <ProductForm
              key={editing === "new" ? "new" : editing.id}
              initial={editing === "new" ? EMPTY_PRODUCT : editing}
              onSubmit={saveProduct}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div style={adminStyles.btnRow}>
              <button style={adminStyles.button} onClick={() => setEditing("new")}>Добавить продукт</button>
            </div>
          )}
        </div>

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Движение денег за 30 дней</h2>
          <p style={adminStyles.subtitle}>Суммы в валюте цены, без комиссий провайдеров.</p>
          {stats.length === 0 ? (
            <p style={{ color: "#aaa", fontSize: 12 }}>Транзакций нет.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead>
                  <tr>{["Провайдер", "Тип", "Сумма", "Количество"].map((title) => <th key={title} style={head}>{title}</th>)}</tr>
                </thead>
                <tbody>
                  {stats.map((row) => (
                    <tr key={`${row.provider}-${row.type}-${row.currency}`}>
                      <td style={cell}>{PROVIDER_TITLES[row.provider] ?? row.provider}</td>
                      <td style={cell}>{row.type}</td>
                      <td style={cell}>{money(row.amountMinor, row.currency)}</td>
                      <td style={cell}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={adminStyles.card}>
          <h2 style={adminStyles.title}>Платежи</h2>
          <div style={{ ...adminStyles.row, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
            <select style={{ ...adminStyles.input, width: 180 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Все статусы</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select style={{ ...adminStyles.input, width: 160 }} value={filters.provider} onChange={(e) => setFilters({ ...filters, provider: e.target.value })}>
              <option value="">Все провайдеры</option>
              {Object.entries(PROVIDER_TITLES).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
            <label style={{ color: "#ddd", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={filters.needsReview} onChange={(e) => setFilters({ ...filters, needsReview: e.target.checked })} />
              Только требующие проверки
            </label>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>{["Дата", "Пользователь", "Продукт", "Сумма", "Провайдер", "Статус", ""].map((title) => <th key={title} style={head}>{title}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((payment) => (
                  <tr key={payment.id}>
                    <td style={cell}>{dateTime(payment.createdAt)}</td>
                    <td style={cell}>{payment.user?.email ?? "удалён"}</td>
                    <td style={cell}>{payment.productTitle}</td>
                    <td style={cell}>{money(payment.amountMinor, payment.currency)}</td>
                    <td style={cell}>{PROVIDER_TITLES[payment.provider] ?? payment.provider}</td>
                    <td style={cell}>
                      {payment.status}
                      {payment.needsReview && <div style={{ color: "#f0b429" }}>требует проверки</div>}
                    </td>
                    <td style={cell}>
                      <button
                        style={adminStyles.btnSecondary}
                        onClick={() => adminPayments.get(payment.id).then(setDetail).catch((err) => setError(err.message))}
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length === 0 && <p style={{ color: "#aaa", fontSize: 12 }}>Платежей нет.</p>}
          {nextCursor && (
            <div style={adminStyles.btnRow}>
              <button style={adminStyles.btnSecondary} onClick={loadMore}>Показать ещё</button>
            </div>
          )}

          {detail && (
            <div style={{ background: "#1a1a1a", border: "1px solid #313131", borderRadius: 4, padding: 16, marginTop: 16 }}>
              <h3 style={{ color: "#fff", fontSize: 14, margin: "0 0 8px" }}>
                {detail.productTitle}: {money(detail.amountMinor, detail.currency)}, {detail.status}
              </h3>
              <div style={{ color: "#aaa", fontSize: 12, lineHeight: 1.7 }}>
                <div>ID: {detail.id}</div>
                <div>Внешний ID: {detail.externalId ?? "—"}</div>
                <div>Возвращено: {money(detail.refundedMinor, detail.currency)}</div>
                <div>Пользователь: {detail.user?.email ?? "удалён"}</div>
                {detail.user?.paymentsBlockedAt && (
                  <div style={{ color: "#e36466" }}>Покупки заблокированы: {detail.user.paymentsBlockReason}</div>
                )}
                {detail.needsReview && <div style={{ color: "#f0b429" }}>Нужна проверка: {detail.reviewReason}</div>}
              </div>

              {(detail.transactions?.length ?? 0) > 0 && (
                <div style={{ overflowX: "auto", marginTop: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                    <thead>
                      <tr>{["Дата", "Тип", "Сумма", "Кредиты", "Внешний ID", ""].map((title) => <th key={title} style={head}>{title}</th>)}</tr>
                    </thead>
                    <tbody>
                      {detail.transactions?.map((transaction) => (
                        <tr key={transaction.id}>
                          <td style={cell}>{dateTime(transaction.createdAt)}</td>
                          <td style={cell}>{transaction.type}</td>
                          <td style={cell}>{money(transaction.amountMinor, transaction.currency)}</td>
                          <td style={cell}>{transaction.creditsDelta}</td>
                          <td style={cell}>{transaction.externalTransactionId}</td>
                          <td style={cell}>
                            {detail.provider === "upgate" && ["sale", "rebill"].includes(transaction.type) && (
                              <button style={adminStyles.btnSecondary} onClick={() => refund(detail, transaction.id, transaction.amountMinor)}>
                                Вернуть
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ ...adminStyles.btnRow, flexWrap: "wrap" }}>
                {detail.needsReview && (
                  <button style={adminStyles.button} onClick={() => act(detail.id, () => adminPayments.resolveReview(detail.id), "Отметка снята")}>
                    Проверено
                  </button>
                )}
                {detail.userId && !detail.user?.paymentsBlockedAt && (
                  <button style={adminStyles.btnSecondary} onClick={() => block(detail)}>Заблокировать покупки</button>
                )}
                {detail.userId && detail.user?.paymentsBlockedAt && (
                  <button style={adminStyles.btnSecondary} onClick={() => unblock(detail)}>Снять блокировку</button>
                )}
                <button style={adminStyles.btnSecondary} onClick={() => setDetail(null)}>Закрыть</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
