"use client";

import React, { useCallback, useEffect, useState } from "react";
import { admin, newClientMessageId, type LedgerEntry, type WalletSummary } from "../../../lib/api";

/** Человекочитаемые названия типов операций журнала. */
const LEDGER_TYPE_LABELS: Record<LedgerEntry["type"], string> = {
  bonus: "Бонус",
  topup: "Пополнение",
  adjust: "Корректировка",
  reserve: "Резерв",
  capture: "Списание",
  release: "Возврат резерва",
  refund: "Компенсация",
};

const s: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 },
  row: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
  stat: { color: "#ccc", fontSize: 12 },
  value: { color: "#fff", fontWeight: 700 },
  input: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "5px 10px",
    color: "#fff",
    fontSize: 12,
    outline: "none",
  },
  btn: {
    background: "#f95bad",
    border: "none",
    borderRadius: 6,
    padding: "6px 12px",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  table: { borderCollapse: "collapse", fontSize: 12, color: "#ccc" },
  cell: { padding: "3px 10px 3px 0", whiteSpace: "nowrap" },
  error: { color: "#e36466", fontSize: 12 },
};

/**
 * Кошелёк пользователя в админке: баланс, начисление/корректировка кредитов
 * с причиной и последние операции журнала.
 */
export function UserWalletPanel({ userId }: { userId: string }) {
  const [wallet, setWallet] = useState<(WalletSummary & { ledger: LedgerEntry[] }) | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    admin
      .getUserWallet(userId)
      .then(setWallet)
      .catch((err) => setError(err.message));
  }, [userId]);

  useEffect(load, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(amount, 10);
    if (!Number.isFinite(value) || value === 0 || !reason.trim()) {
      setError("Укажите ненулевую сумму и причину");
      return;
    }
    if (!confirm(`${value > 0 ? "Начислить" : "Списать"} ${Math.abs(value)} кредитов?`)) return;
    setSaving(true);
    setError("");
    try {
      await admin.creditUser(userId, value, reason.trim(), newClientMessageId());
      setAmount("");
      setReason("");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!wallet) {
    return <div style={error ? s.error : s.stat}>{error || "Загрузка кошелька..."}</div>;
  }

  return (
    <div style={s.wrap}>
      <div style={s.row}>
        <span style={s.stat}>
          Баланс: <span style={s.value}>{wallet.balance}</span>
        </span>
        <span style={s.stat}>
          В резерве: <span style={s.value}>{wallet.reserved}</span>
        </span>
        <span style={s.stat}>
          Доступно: <span style={s.value}>{wallet.available}</span>
        </span>
      </div>

      <form onSubmit={submit} style={s.row}>
        <input
          style={{ ...s.input, width: 110 }}
          type="number"
          placeholder="+100 / −50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          style={{ ...s.input, width: 260 }}
          placeholder="Причина (попадёт в журнал)"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="submit" style={s.btn} disabled={saving}>
          {saving ? "..." : "Начислить / списать"}
        </button>
        {error && <span style={s.error}>{error}</span>}
      </form>

      {wallet.ledger.length > 0 && (
        <table style={s.table}>
          <tbody>
            {wallet.ledger.slice(0, 15).map((e) => (
              <tr key={e.id}>
                <td style={s.cell}>{new Date(e.createdAt).toLocaleString("ru-RU")}</td>
                <td style={s.cell}>{LEDGER_TYPE_LABELS[e.type] ?? e.type}</td>
                <td style={{ ...s.cell, color: e.balanceDelta < 0 ? "#e36466" : e.balanceDelta > 0 ? "#c1f0aa" : "#888" }}>
                  {e.balanceDelta !== 0 ? (e.balanceDelta > 0 ? `+${e.balanceDelta}` : e.balanceDelta) : `резерв ${e.reservedDelta > 0 ? "+" : ""}${e.reservedDelta}`}
                </td>
                <td style={s.cell}>→ {e.balanceAfter}</td>
                <td style={{ ...s.cell, color: "#888" }}>{e.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
