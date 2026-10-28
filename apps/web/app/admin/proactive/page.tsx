"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type ProactivePolicy, type ProactiveStats } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const PERIODS = [7, 30, 90];

/** Форма политики: числа и списки — строками, чтобы их можно было редактировать. */
interface PolicyForm {
  enabled: boolean;
  delaysHours: string;
  maxUnanswered: string;
  quietStart: string;
  quietEnd: string;
  dailyBudgetCredits: string;
  variants: { name: string; delayFactor: string; prompt: string }[];
}

function toForm(p: ProactivePolicy): PolicyForm {
  return {
    enabled: p.enabled,
    delaysHours: p.delaysHours.join(", "),
    maxUnanswered: String(p.maxUnanswered),
    quietStart: String(p.quietStart),
    quietEnd: String(p.quietEnd),
    dailyBudgetCredits: String(p.dailyBudgetCredits),
    variants: p.variants.map((v) => ({ name: v.name, delayFactor: String(v.delayFactor), prompt: v.prompt })),
  };
}

function fromForm(f: PolicyForm): ProactivePolicy {
  return {
    enabled: f.enabled,
    delaysHours: f.delaysHours
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0),
    maxUnanswered: Math.floor(Number(f.maxUnanswered)),
    quietStart: Math.floor(Number(f.quietStart)),
    quietEnd: Math.floor(Number(f.quietEnd)),
    dailyBudgetCredits: Math.floor(Number(f.dailyBudgetCredits) || 0),
    variants: f.variants
      .filter((v) => v.name.trim() && v.prompt.trim())
      .map((v) => ({ name: v.name.trim(), delayFactor: Number(v.delayFactor) || 1, prompt: v.prompt.trim() })),
  };
}

/**
 * Админка инициативных сообщений: политика (задержки, лимит без ответа, тихие
 * часы, дневной бюджет, варианты A/B) и статистика ответов по вариантам.
 */
export default function AdminProactivePage() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState(30);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [stats, setStats] = useState<ProactiveStats | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await admin.getProactive(days);
      setForm((prev) => prev ?? toForm(res.policy));
      setStats(res.stats);
      setError(res.statsError ? `Статистика недоступна: ${res.statsError}` : "");
    } catch (err: any) {
      setError(err.message);
    }
  }, [days]);

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
  }, [loading, user, load]);

  const save = async () => {
    if (!form) return;
    setSaved(false);
    try {
      const policy = await admin.setProactive(fromForm(form));
      setForm(toForm(policy));
      setSaved(true);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };

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

  const set = (patch: Partial<PolicyForm>) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };
  const setVariant = (i: number, patch: Partial<PolicyForm["variants"][number]>) =>
    set({ variants: form!.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="proactive" />
        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Персонаж пишет первым</h2>
          <p style={adminStyles.subtitle}>
            Если пользователь молчит, персонаж пишет первым — на сайте (бейдж непрочитанных) и в Telegram. Считается
            только после реплики пользователя; после заданного числа сообщений без ответа — пауза до его следующей
            реплики. Тихие часы — по часовому поясу пользователя. Владелец бота для клиентов может переопределить
            настройки для своего бота.
          </p>
          {form && (
            <>
              <div style={adminStyles.field}>
                <label style={{ color: "#fff", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                  Включено
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                <Field label="Задержки, часы (1-е, 2-е, …)" value={form.delaysHours} onChange={(v) => set({ delaysHours: v })} />
                <Field label="Максимум подряд без ответа" value={form.maxUnanswered} onChange={(v) => set({ maxUnanswered: v })} />
                <Field label="Тихие часы: с (0–23)" value={form.quietStart} onChange={(v) => set({ quietStart: v })} />
                <Field label="Тихие часы: до (0–23)" value={form.quietEnd} onChange={(v) => set({ quietEnd: v })} />
                <Field label="Дневной бюджет кредитов (0 — без лимита)" value={form.dailyBudgetCredits} onChange={(v) => set({ dailyBudgetCredits: v })} />
              </div>

              <h3 style={{ color: "#fff", fontSize: 14, margin: "20px 0 8px" }}>Варианты A/B</h3>
              <p style={adminStyles.subtitle}>
                Вариант выбирается по чату и не меняется. Множитель умножает задержки; подсказка — служебная реплика для модели.
              </p>
              {form.variants.map((v, i) => (
                <div key={i} style={{ border: "1px solid #333", borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ width: 120 }}>
                      <Field label="Название" value={v.name} onChange={(x) => setVariant(i, { name: x })} />
                    </div>
                    <div style={{ width: 160 }}>
                      <Field label="Множитель задержек" value={v.delayFactor} onChange={(x) => setVariant(i, { delayFactor: x })} />
                    </div>
                    <button
                      style={{ ...adminStyles.btnSmall, alignSelf: "center" }}
                      disabled={form.variants.length <= 1}
                      onClick={() => set({ variants: form.variants.filter((_, j) => j !== i) })}
                    >
                      Удалить
                    </button>
                  </div>
                  <label style={adminStyles.label}>Подсказка модели</label>
                  <textarea
                    style={{ ...adminStyles.input, minHeight: 70, fontFamily: "inherit" }}
                    value={v.prompt}
                    onChange={(e) => setVariant(i, { prompt: e.target.value })}
                  />
                </div>
              ))}
              <div style={adminStyles.btnRow}>
                {form.variants.length < 5 && (
                  <button
                    style={adminStyles.btnSecondary}
                    onClick={() =>
                      set({
                        variants: [
                          ...form.variants,
                          { name: String.fromCharCode(65 + form.variants.length), delayFactor: "1", prompt: form.variants[0]?.prompt ?? "" },
                        ],
                      })
                    }
                  >
                    Добавить вариант
                  </button>
                )}
                <button style={adminStyles.button} onClick={save}>Сохранить</button>
                {saved && <span style={{ color: "#c1f0aa", fontSize: 12, alignSelf: "center" }}>Сохранено</span>}
              </div>
            </>
          )}
        </div>

        <div style={adminStyles.card}>
          <h2 style={adminStyles.title}>Статистика</h2>
          <div style={{ ...adminStyles.btnRow, marginBottom: 16 }}>
            {PERIODS.map((d) => (
              <button
                key={d}
                style={d === days ? adminStyles.btnSmall : { ...adminStyles.btnSmall, opacity: 0.5 }}
                onClick={() => setDays(d)}
              >
                {d} дн.
              </button>
            ))}
          </div>
          {stats && (
            <>
              <p style={{ color: "#aaa", fontSize: 12 }}>Запланировано сейчас: {stats.scheduled}</p>
              {stats.variants.length === 0 ? (
                <p style={{ color: "#888", fontSize: 12 }}>Пока ничего не отправлено.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#ddd" }}>
                  <thead>
                    <tr style={{ color: "#969696", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Вариант</th>
                      <th style={{ padding: "6px 8px" }}>Отправлено</th>
                      <th style={{ padding: "6px 8px" }}>Ответили за 24 ч</th>
                      <th style={{ padding: "6px 8px" }}>Доля ответов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.variants.map((v) => (
                      <tr key={v.variant} style={{ borderTop: "1px solid #333" }}>
                        <td style={{ padding: "6px 8px" }}>{v.variant}</td>
                        <td style={{ padding: "6px 8px" }}>{v.sent}</td>
                        <td style={{ padding: "6px 8px" }}>{v.replied}</td>
                        <td style={{ padding: "6px 8px" }}>{Math.round(v.replyRate * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={adminStyles.field}>
      <label style={adminStyles.label}>{label}</label>
      <input style={adminStyles.input} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
