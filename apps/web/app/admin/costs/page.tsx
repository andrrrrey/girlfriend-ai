"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type GenerationCosts } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const LIMIT = 100;

// Цены за 1 генерацию по умолчанию (USD), найдены по тарифам провайдеров:
// ModelsLab: SD1.5 ~$0.002/img, SDXL/Flux ~$0.004/img (modelslab.com/pricing);
// Civitai: SDXL ~4–6 Buzz ≈ $0.005/img (education.civitai.com);
// Atlas Cloud: text-to-video ~$0.07/сек × ~5 сек ≈ $0.35 (atlascloud.ai);
// wan-2.6 text-to-image (Atlas) — оценка ~$0.01/img.
const DEFAULT_PRICING: Record<string, number> = {
  "realistic-vision-v51": 0.002,
  sdxl: 0.004,
  "juggernaut-xl": 0.004,
  flux: 0.004,
  "alibaba/wan-2.6/text-to-image": 0.01,
  civitai: 0.005,
  "atlascloud/van-2.6/text-to-video": 0.35,
};

const s: Record<string, React.CSSProperties> = {
  filterRow: { display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  filterBtn: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "7px 14px",
    color: "#969696",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    fontWeight: 500,
  },
  filterBtnActive: {
    background: "linear-gradient(to right, #f95bad, #ff0084)",
    border: "1px solid transparent",
    color: "#fff",
  },
  select: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "7px 10px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    fontFamily: "'Syne', sans-serif",
    minWidth: 200,
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
    width: 100,
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
  totalsRow: { display: "flex", gap: 24, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px solid #313131" },
  totalCard: { color: "#ccc", fontSize: 13 },
  totalValue: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 4 },
  pagination: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 20 },
  pageBtn: { background: "transparent", border: "1px solid #313131", color: "#aaa", padding: "7px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "'Syne', sans-serif" },
  pageInfo: { color: "#888", fontSize: 13 },
  priceCell: { display: "flex", alignItems: "center", gap: 10 },
  modelName: { color: "#fff", fontSize: 13 },
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminCostsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<GenerationCosts | null>(null);
  const [pricing, setPricing] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(
    async (type: string, model: string, f: string, t: string, off: number) => {
      setFetching(true);
      setError("");
      try {
        const res = await admin.getGenerationCosts({
          type: type || undefined,
          model: model || undefined,
          from: f || undefined,
          to: t ? `${t}T23:59:59.999Z` : undefined,
          limit: LIMIT,
          offset: off,
        });
        setData(res);
        // Префилл цен: сохранённое значение → значение по умолчанию.
        setPricing((prev) => {
          const next = { ...prev };
          const models = new Set<string>([
            ...Object.keys(DEFAULT_PRICING),
            ...Object.keys(res.pricing || {}),
            ...res.availableModels.map((m) => m.model),
            ...res.breakdown.map((b) => b.model),
          ]);
          for (const m of models) {
            if (next[m] === undefined) {
              const saved = res.pricing?.[m];
              const def = DEFAULT_PRICING[m];
              next[m] = saved != null ? String(saved) : def != null ? String(def) : "";
            }
          }
          return next;
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!loading && user?.role === "admin") loadData(typeFilter, modelFilter, from, to, offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, typeFilter, modelFilter, offset]);

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

  const priceOf = (model: string) => parseFloat(pricing[model] ?? "") || 0;

  // Итоги по всем генерациям под фильтр (из breakdown × текущие цены).
  const breakdown = data?.breakdown ?? [];
  const totalImage = breakdown.filter((b) => b.type === "image").reduce((sum, b) => sum + b.count * priceOf(b.model), 0);
  const totalVideo = breakdown.filter((b) => b.type === "video").reduce((sum, b) => sum + b.count * priceOf(b.model), 0);
  const totalAll = totalImage + totalVideo;

  // Список моделей для блока настройки цен (объединяем известные, доступные и из breakdown).
  const priceModels = Array.from(
    new Set<string>([
      ...Object.keys(DEFAULT_PRICING),
      ...(data?.availableModels.map((m) => m.model) ?? []),
      ...breakdown.map((b) => b.model),
    ]),
  ).filter((m) => m && m !== "unknown").sort();

  // Уникальные модели для выпадающего фильтра.
  const filterModels = Array.from(new Set((data?.availableModels ?? []).map((m) => m.model))).sort();

  const applyFilters = () => { setOffset(0); loadData(typeFilter, modelFilter, from, to, 0); };
  const resetFilters = () => { setTypeFilter(""); setModelFilter(""); setFrom(""); setTo(""); setOffset(0); };

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
      await loadData(typeFilter, modelFilter, from, to, offset);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const total = data?.total ?? 0;
  const fromIdx = total === 0 ? 0 : offset + 1;
  const toIdx = Math.min(offset + LIMIT, total);

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="costs" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {saved && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>Цены сохранены!</div>}

        {/* Настройка стоимости за генерацию по моделям */}
        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Стоимость генерации по моделям</h2>
          <p style={adminStyles.subtitle}>
            Цена за одну генерацию для каждой модели нейросети ($). Значения по умолчанию подставлены по тарифам провайдеров — отредактируйте при необходимости и сохраните.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {priceModels.map((model) => (
              <div key={model} style={s.priceCell}>
                <span style={s.modelName}>{model}</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={pricing[model] ?? ""}
                  placeholder="0"
                  onChange={(e) => setPricing({ ...pricing, [model]: e.target.value })}
                  style={s.priceInput}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
              {saving ? "Сохранение..." : "Сохранить цены"}
            </button>
          </div>
        </div>

        {/* Таблица созданных генераций */}
        <div style={adminStyles.card}>
          <h2 style={adminStyles.title}>Созданные генерации</h2>
          <p style={adminStyles.subtitle}>Всего под фильтр: {total}</p>

          <div style={s.filterRow}>
            {[
              { label: "Все", value: "" },
              { label: "Изображения", value: "image" },
              { label: "Видео", value: "video" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => { setTypeFilter(f.value); setOffset(0); }}
                style={typeFilter === f.value ? { ...s.filterBtn, ...s.filterBtnActive } : s.filterBtn}
              >
                {f.label}
              </button>
            ))}

            <select
              value={modelFilter}
              onChange={(e) => { setModelFilter(e.target.value); setOffset(0); }}
              style={s.select}
            >
              <option value="">Все модели</option>
              {filterModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <div>
              <label style={adminStyles.label}>С даты</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={s.dateInput} />
            </div>
            <div>
              <label style={adminStyles.label}>По дату</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={s.dateInput} />
            </div>
            <button onClick={applyFilters} style={adminStyles.button}>Применить</button>
            {(typeFilter || modelFilter || from || to) && (
              <button onClick={resetFilters} style={adminStyles.btnSecondary}>Сброс</button>
            )}
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : (data?.rows.length ?? 0) === 0 ? (
            <p style={{ color: "#888", padding: "20px 0" }}>Генерации не найдены.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={s.table as React.CSSProperties}>
                <thead>
                  <tr>
                    <th style={s.th}>Название генерации</th>
                    <th style={{ ...s.th, width: 110 }}>Тип</th>
                    <th style={{ ...s.th, width: 220 }}>Модель</th>
                    <th style={{ ...s.th, width: 150 }}>Дата</th>
                    <th style={{ ...s.th, ...s.num, width: 130 }}>Стоимость</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map((row) => {
                    const video = row.type === "video";
                    const prompt = row.prompt || "—";
                    const truncated = prompt.length > 80 ? prompt.slice(0, 80) + "..." : prompt;
                    const date = row.createdAt ? new Date(row.createdAt).toLocaleString("ru-RU") : "";
                    return (
                      <tr key={row.jobId}>
                        <td style={{ ...s.td, color: "#fff", maxWidth: 420 }} title={prompt}>{truncated}</td>
                        <td style={s.td}>
                          <span style={{ color: video ? "#f95bad" : "#6cb2eb", fontWeight: 600 }}>
                            {video ? "Видео" : "Изображение"}
                          </span>
                        </td>
                        <td style={{ ...s.td, fontSize: 12 }}>{row.model}</td>
                        <td style={{ ...s.td, color: "#848484", fontSize: 11, whiteSpace: "nowrap" }}>{date}</td>
                        <td style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 600 }}>{fmt(priceOf(row.model))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > LIMIT && (
            <div style={s.pagination}>
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={s.pageBtn}>Назад</button>
              <span style={s.pageInfo}>{fromIdx}-{toIdx} из {total}</span>
              <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)} style={s.pageBtn}>Вперёд</button>
            </div>
          )}

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
              Всего (под фильтр)
              <div style={{ ...s.totalValue, color: "#f95bad" }}>{fmt(totalAll)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
