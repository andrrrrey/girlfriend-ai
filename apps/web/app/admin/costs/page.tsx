"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type GenerationCosts } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

// Известные модели — чтобы можно было задать цену даже без генераций.
const KNOWN_IMAGE_MODELS = [
  "realistic-vision-v51",
  "sdxl",
  "juggernaut-xl",
  "flux",
  "alibaba/wan-2.6/text-to-image",
  "civitai",
];
const KNOWN_VIDEO_MODELS = ["atlascloud/van-2.6/text-to-video"];

const s: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
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
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  priceInput: {
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
  dateInput: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "7px 10px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    fontFamily: "'Syne', sans-serif",
    colorScheme: "dark",
  },
  typeBadge: { fontWeight: 600 },
  totalsRow: {
    display: "flex",
    gap: 24,
    flexWrap: "wrap",
    marginTop: 20,
    paddingTop: 16,
    borderTop: "1px solid #313131",
  },
  totalCard: { color: "#ccc", fontSize: 13 },
  totalValue: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 4 },
};

interface DisplayRow {
  type: string;
  model: string;
  count: number;
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminCostsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<GenerationCosts | null>(null);
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async (f: string, t: string) => {
    setFetching(true);
    setError("");
    try {
      const res = await admin.getGenerationCosts({
        from: f || undefined,
        to: t ? `${t}T23:59:59.999Z` : undefined,
      });
      setData(res);
      // Локальное состояние цен (строки для инпутов) из сохранённого pricing.
      setPricing((prev) => {
        const next: Record<string, string> = { ...prev };
        for (const [model, price] of Object.entries(res.pricing || {})) {
          if (next[model] === undefined) next[model] = String(price);
        }
        return next;
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "admin") loadData(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <a href="/" style={adminStyles.link}>На главную</a>
        </div>
      </div>
    );
  }

  // Объединяем модели из агрегата с известными, чтобы цену можно было задать заранее.
  const rows: DisplayRow[] = [];
  const seen = new Set<string>();
  for (const r of data?.rows ?? []) {
    rows.push({ type: r.type, model: r.model, count: r.count });
    seen.add(`${r.type}|${r.model}`);
  }
  for (const m of KNOWN_IMAGE_MODELS) if (!seen.has(`image|${m}`)) rows.push({ type: "image", model: m, count: 0 });
  for (const m of KNOWN_VIDEO_MODELS) if (!seen.has(`video|${m}`)) rows.push({ type: "video", model: m, count: 0 });

  const priceOf = (model: string) => parseFloat(pricing[model] ?? "") || 0;
  const totalOf = (row: DisplayRow) => row.count * priceOf(row.model);

  const totalImage = rows.filter((r) => r.type === "image").reduce((sum, r) => sum + totalOf(r), 0);
  const totalVideo = rows.filter((r) => r.type === "video").reduce((sum, r) => sum + totalOf(r), 0);
  const totalAll = totalImage + totalVideo;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const map: Record<string, number> = {};
      for (const [model, val] of Object.entries(pricing)) {
        const n = parseFloat(val);
        if (!isNaN(n)) map[model] = n;
      }
      await admin.upsertSettings({ MODEL_PRICING: JSON.stringify(map) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadData(from, to);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="costs" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {saved && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>Цены сохранены!</div>}

        <div style={adminStyles.card}>
          <div style={adminStyles.headerRow}>
            <div>
              <h2 style={adminStyles.title}>Расходы на генерацию</h2>
              <p style={adminStyles.subtitle}>
                Стоимость генераций изображений и видео по каждой модели нейросети. Цена за 1 генерацию редактируется ниже и сохраняется в настройках.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div>
                <label style={adminStyles.label}>С даты</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
              </div>
              <div>
                <label style={adminStyles.label}>По дату</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
              </div>
              <button onClick={() => loadData(from, to)} style={adminStyles.button}>Применить</button>
              {(from || to) && (
                <button
                  onClick={() => { setFrom(""); setTo(""); loadData("", ""); }}
                  style={adminStyles.btnSecondary}
                >
                  Сброс
                </button>
              )}
            </div>
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={s.table as React.CSSProperties}>
                  <thead>
                    <tr>
                      <th style={s.th}>Модель</th>
                      <th style={{ ...s.th, width: 90 }}>Тип</th>
                      <th style={{ ...s.th, ...s.num, width: 120 }}>Кол-во</th>
                      <th style={{ ...s.th, ...s.num, width: 150 }}>Цена за шт. ($)</th>
                      <th style={{ ...s.th, ...s.num, width: 140 }}>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const video = row.type === "video";
                      return (
                        <tr key={`${row.type}|${row.model}`}>
                          <td style={{ ...s.td, color: "#fff" }}>{row.model}</td>
                          <td style={s.td}>
                            <span style={{ ...s.typeBadge, color: video ? "#f95bad" : "#6cb2eb" }}>
                              {video ? "Video" : "Image"}
                            </span>
                          </td>
                          <td style={{ ...s.td, ...s.num }}>{row.count.toLocaleString("ru-RU")}</td>
                          <td style={{ ...s.td, ...s.num }}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={pricing[row.model] ?? ""}
                              placeholder="0"
                              onChange={(e) => setPricing({ ...pricing, [row.model]: e.target.value })}
                              style={s.priceInput}
                            />
                          </td>
                          <td style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 600 }}>{fmt(totalOf(row))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={s.totalsRow}>
                <div style={s.totalCard}>
                  Изображения
                  <div style={s.totalValue}>{fmt(totalImage)}</div>
                </div>
                <div style={s.totalCard}>
                  Видео
                  <div style={s.totalValue}>{fmt(totalVideo)}</div>
                </div>
                <div style={s.totalCard}>
                  Всего
                  <div style={{ ...s.totalValue, color: "#f95bad" }}>{fmt(totalAll)}</div>
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
                  {saving ? "Сохранение..." : "Сохранить цены"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
