"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import {
  admin,
  type GenerationCosts,
  type GenerationCostItem,
  type GenerationCostBreakdown,
  type ModelPrice,
  type ModelPriceSource,
} from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const LIMIT = 100;

// Единица цены и способ расчёта для каждого типа операции.
// divisor > 0 → стоимость = единицы / divisor × цена; divisor 0 → цена за генерацию.
const UNIT_BY_TYPE: Record<string, { label: string; divisor: number }> = {
  tts: { label: "$ / 1000 симв.", divisor: 1000 },
  stt: { label: "$ / мин", divisor: 60 },          // units хранятся в секундах
  chat: { label: "$ / 1M токенов", divisor: 1_000_000 },
  image: { label: "$ / ген.", divisor: 0 },
  video: { label: "$ / ген.", divisor: 0 },
};

// Человекочитаемая подпись типа операции для таблицы.
const TYPE_META: Record<string, { label: string; color: string }> = {
  image: { label: "Изображение", color: "#6cb2eb" },
  video: { label: "Видео", color: "#f95bad" },
  tts: { label: "Озвучка", color: "#7ed492" },
  stt: { label: "Распознавание", color: "#f0b429" },
  chat: { label: "Чат", color: "#b39ddb" },
};

// Подписи источников цены.
const SOURCE_META: Record<ModelPriceSource, { label: string; color: string }> = {
  openrouter: { label: "OpenRouter", color: "#7ed492" },
  atlascloud: { label: "Atlas Cloud", color: "#7ed492" },
  modelslab: { label: "ModelsLab", color: "#7ed492" },
  elevenlabs: { label: "ElevenLabs", color: "#7ed492" },
  openai: { label: "OpenAI", color: "#7ed492" },
  civitai: { label: "Civitai", color: "#7ed492" },
  history: { label: "по фактическим расходам", color: "#6cb2eb" },
  manual: { label: "вручную", color: "#f0b429" },
  default: { label: "по умолчанию", color: "#848484" },
};

/** Редактируемая цена модели в форме. */
interface PriceEdit {
  price: string;
  outputPrice: string;
  locked: boolean;
}

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
    fontFamily: "var(--font-main)",
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
    fontFamily: "var(--font-main)",
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
    fontFamily: "var(--font-main)",
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
    fontFamily: "var(--font-main)",
  },
  totalsRow: { display: "flex", gap: 24, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px solid #313131" },
  totalCard: { color: "#ccc", fontSize: 13 },
  totalValue: { color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 4 },
  pagination: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 20 },
  pageBtn: { background: "transparent", border: "1px solid #313131", color: "#aaa", padding: "7px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "var(--font-main)" },
  pageInfo: { color: "#888", fontSize: 13 },
  priceCell: { display: "flex", alignItems: "center", gap: 10 },
  modelName: { color: "#fff", fontSize: 13 },
  hint: { color: "#6b6b6b", fontSize: 11 },
};

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Стоимость одного сообщения чата — доли цента ($0.0001), генерации — до 0.005.
// Для значений меньше цента показываем до 6 знаков, иначе получилось бы "$0.00".
function fmtCost(n: number): string {
  const digits = n > 0 && n < 0.01 ? 6 : 2;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

function fmtDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "";
}

function toEdit(m: ModelPrice): PriceEdit {
  return {
    price: m.price != null ? String(m.price) : "",
    outputPrice: m.outputPrice != null ? String(m.outputPrice) : "",
    locked: Boolean(m.meta.locked),
  };
}

export default function AdminCostsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<GenerationCosts | null>(null);
  const [models, setModels] = useState<ModelPrice[]>([]);
  const [edits, setEdits] = useState<Record<string, PriceEdit>>({});
  const [typeFilter, setTypeFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const applyModels = useCallback((list: ModelPrice[]) => {
    setModels(list);
    setEdits(Object.fromEntries(list.map((m) => [m.model, toEdit(m)])));
  }, []);

  const loadPricing = useCallback(async () => {
    try {
      const res = await admin.getModelPricing();
      applyModels(res.models);
    } catch (err: any) {
      setError(err.message);
    }
  }, [applyModels]);

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
      } catch (err: any) {
        setError(err.message);
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!loading && user?.role === "admin") loadPricing();
  }, [loading, user, loadPricing]);

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

  const num = (v: string | undefined): number | null => {
    const n = parseFloat(v ?? "");
    return isNaN(n) || n < 0 ? null : n;
  };

  // Цена модели из формы (то, что видит админ — пересчёт сразу, до сохранения).
  // Civitai-чекпоинты по URN (urn:air:...:civitai:...) без своей цены берут
  // базовую цену "civitai" — иначе такие генерации показывали бы $0.
  const priceOf = (model: string): number => {
    const direct = num(edits[model]?.price);
    if (direct !== null) return direct;
    if (/^urn:air:.*:civitai:/i.test(model)) return num(edits["civitai"]?.price) ?? 0;
    return 0;
  };
  // Цена выходных токенов чата; если не задана — как у входных.
  const outputPriceOf = (model: string): number => num(edits[model]?.outputPrice) ?? priceOf(model);

  // Оценка стоимости по ценам моделей (для записей без фактической стоимости).
  const estimate = (
    type: string,
    model: string,
    count: number,
    units: number,
    promptTokens = 0,
    completionTokens = 0,
  ): number => {
    if (type === "chat") {
      // Раздельные токены — по своим ценам; старые записи (только сумма токенов)
      // считаются по цене входных токенов: в чате их подавляющее большинство (контекст).
      return (
        (promptTokens / 1_000_000) * priceOf(model) +
        (completionTokens / 1_000_000) * outputPriceOf(model) +
        (units / 1_000_000) * priceOf(model)
      );
    }
    const unit = UNIT_BY_TYPE[type];
    if (unit && unit.divisor > 0) return (units / unit.divisor) * priceOf(model);
    return count * priceOf(model);
  };

  // Стоимость строки: фактическая у провайдера, если известна, иначе оценка.
  const rowCost = (row: GenerationCostItem): number => {
    if (row.providerCostUsd != null) return row.providerCostUsd;
    if (row.type === "chat" && row.promptTokens != null) {
      return estimate("chat", row.model, 1, 0, row.promptTokens, row.completionTokens ?? 0);
    }
    return estimate(row.type, row.model, 1, row.units ?? 0);
  };

  // Стоимость группы (тип, модель): фактическая часть + оценка остальных.
  const groupCost = (b: GenerationCostBreakdown): number => {
    // Ответ старого бэкенда без разбивки — считаем всё оценкой.
    if (b.estCount === undefined) return estimate(b.type, b.model, b.count, b.units ?? 0);
    return (
      (b.providerCost ?? 0) +
      estimate(b.type, b.model, b.estCount, b.estUnits ?? 0, b.estPromptTokens ?? 0, b.estCompletionTokens ?? 0)
    );
  };

  const breakdown = data?.breakdown ?? [];

  // Итоги по всем генерациям под фильтр.
  const totalOf = (t: string) => breakdown.filter((b) => b.type === t).reduce((sum, b) => sum + groupCost(b), 0);
  const totalImage = totalOf("image");
  const totalVideo = totalOf("video");
  const totalTTS = totalOf("tts");
  const totalSTT = totalOf("stt");
  const totalChat = totalOf("chat");
  const totalAll = totalImage + totalVideo + totalTTS + totalSTT + totalChat;

  // Уникальные модели для выпадающего фильтра.
  const filterModels = Array.from(new Set((data?.availableModels ?? []).map((m) => m.model))).sort();

  const applyFilters = () => { setOffset(0); loadData(typeFilter, modelFilter, from, to, 0); };
  const resetFilters = () => { setTypeFilter(""); setModelFilter(""); setFrom(""); setTo(""); setOffset(0); };

  // Ручная правка цены сразу фиксирует её, чтобы автообновление не перезаписало.
  const editPrice = (model: string, patch: Partial<PriceEdit>) => {
    setEdits((prev) => {
      const cur = prev[model] ?? { price: "", outputPrice: "", locked: false };
      const touchesValue = patch.price !== undefined || patch.outputPrice !== undefined;
      return { ...prev, [model]: { ...cur, ...patch, ...(touchesValue ? { locked: true } : {}) } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const payload: Record<string, { price: number | null; outputPrice?: number | null; locked?: boolean }> = {};
      for (const m of models) {
        const e = edits[m.model];
        if (!e) continue;
        const original = toEdit(m);
        // Отправляем только изменённые модели — остальные сохраняют источник и дату.
        if (e.price === original.price && e.outputPrice === original.outputPrice && e.locked === original.locked) continue;
        payload[m.model] = {
          price: num(e.price),
          outputPrice: m.type === "chat" ? num(e.outputPrice) : undefined,
          locked: e.locked,
        };
      }
      const res = await admin.saveModelPricing(payload);
      applyModels(res.models);
      setNotice("Цены сохранены.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setNotice("");
    setError("");
    try {
      const res = await admin.refreshModelPricing();
      applyModels(res.models);
      const { updated, unchanged, locked, notFound } = res.summary;
      setNotice(
        `Цены загружены от провайдеров: обновлено ${updated}, без изменений ${unchanged}, ` +
          `зафиксировано вручную ${locked}, не найдено у провайдеров ${notFound}.` +
          (res.errors.length ? ` Ошибки: ${res.errors.join("; ")}` : ""),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRefreshing(false);
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
        {notice && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>{notice}</div>}

        {/* Себестоимость по моделям */}
        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Стоимость по моделям</h2>
          <p style={adminStyles.subtitle}>
            Цены ($) загружаются автоматически раз в сутки и по кнопке «Обновить цены от провайдеров»:
            OpenRouter и Atlas Cloud — из каталогов моделей (видео — цена за секунду × 5 сек); ModelsLab, ElevenLabs
            и OpenAI — со страниц тарифов (ModelsLab — цена вызова на тарифе Standard); Civitai — оценка стоимости
            генерации на каждом чекпоинте (Buzz → $, 1000 Buzz = $1, без апскейла). Если модели чата уже нет в
            каталогах, цена считается по фактической стоимости её ответов за 30 дней. Изменённая вручную цена
            фиксируется и не перезаписывается автообновлением. Для ответов чата, где провайдер вернул фактическую
            стоимость (OpenRouter), в расходах используется она.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={s.table as React.CSSProperties}>
              <thead>
                <tr>
                  <th style={s.th}>Модель</th>
                  <th style={{ ...s.th, width: 110 }}>Тип</th>
                  <th style={{ ...s.th, width: 260 }}>Цена</th>
                  <th style={{ ...s.th, width: 120 }}>Зафиксировать</th>
                  <th style={s.th}>Источник</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const e = edits[m.model] ?? toEdit(m);
                  const unit = UNIT_BY_TYPE[m.type];
                  const typeMeta = TYPE_META[m.type] ?? { label: m.type, color: "#848484" };
                  const src = SOURCE_META[m.meta.source] ?? SOURCE_META.manual;
                  return (
                    <tr key={m.model}>
                      <td style={{ ...s.td, ...s.modelName }}>{m.model}</td>
                      <td style={s.td}><span style={{ color: typeMeta.color, fontWeight: 600 }}>{typeMeta.label}</span></td>
                      <td style={s.td}>
                        <div style={s.priceCell}>
                          {m.type === "chat" && <span style={s.hint}>вход</span>}
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={e.price}
                            placeholder="0"
                            onChange={(ev) => editPrice(m.model, { price: ev.target.value })}
                            style={s.priceInput}
                          />
                          {m.type === "chat" && (
                            <>
                              <span style={s.hint}>выход</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={e.outputPrice}
                                placeholder={e.price || "0"}
                                onChange={(ev) => editPrice(m.model, { outputPrice: ev.target.value })}
                                style={s.priceInput}
                              />
                            </>
                          )}
                          <span style={{ ...s.hint, whiteSpace: "nowrap" }}>{unit?.label ?? "$ / ген."}</span>
                        </div>
                      </td>
                      <td style={s.td}>
                        <input
                          type="checkbox"
                          checked={e.locked}
                          onChange={(ev) => editPrice(m.model, { locked: ev.target.checked })}
                          title="Не обновлять цену автоматически"
                        />
                      </td>
                      <td style={{ ...s.td, fontSize: 11 }}>
                        <span style={{ color: src.color, fontWeight: 600 }}>{src.label}</span>
                        {m.meta.updatedAt && <span style={{ color: "#848484" }}> · {fmtDate(m.meta.updatedAt)}</span>}
                        {m.meta.note && <div style={{ color: "#848484" }}>{m.meta.note}</div>}
                        {m.meta.lastError && !m.meta.locked && (
                          <div style={{ color: "#f0b429" }} title={m.meta.checkedAt ? `Проверено ${fmtDate(m.meta.checkedAt)}` : undefined}>
                            {m.meta.lastError}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={handleSave} disabled={saving || refreshing} style={adminStyles.button}>
              {saving ? "Сохранение..." : "Сохранить цены"}
            </button>
            <button onClick={handleRefresh} disabled={saving || refreshing} style={adminStyles.btnSecondary}>
              {refreshing ? "Загрузка цен..." : "Обновить цены от провайдеров"}
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
              { label: "Озвучка", value: "tts" },
              { label: "Распознавание", value: "stt" },
              { label: "Чат", value: "chat" },
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
                    const meta = TYPE_META[row.type] ?? { label: row.type, color: "#6cb2eb" };
                    const units = row.units ?? 0;
                    // Для голоса вместо промпта показываем объём: символы (tts) или минуты (stt).
                    let name = row.prompt || "";
                    if (!name) {
                      if (row.type === "tts") name = `Озвучка · ${units} симв.`;
                      else if (row.type === "stt") name = `Распознавание · ${(units / 60).toFixed(1)} мин`;
                      else if (row.type === "chat") {
                        name =
                          row.promptTokens != null
                            ? `Чат · ${row.promptTokens} вх. + ${row.completionTokens ?? 0} вых. токенов`
                            : `Чат · ${units} токенов`;
                      }
                      else name = "—";
                    }
                    const truncated = name.length > 80 ? name.slice(0, 80) + "..." : name;
                    const date = row.createdAt ? new Date(row.createdAt).toLocaleString("ru-RU") : "";
                    return (
                      <tr key={row.jobId}>
                        <td style={{ ...s.td, color: "#fff", maxWidth: 420 }} title={name}>{truncated}</td>
                        <td style={s.td}>
                          <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                        </td>
                        <td style={{ ...s.td, fontSize: 12 }}>{row.model}</td>
                        <td style={{ ...s.td, color: "#848484", fontSize: 11, whiteSpace: "nowrap" }}>{date}</td>
                        <td
                          style={{ ...s.td, ...s.num, color: "#fff", fontWeight: 600 }}
                          title={row.providerCostUsd != null ? "Фактическая стоимость от провайдера" : "Оценка по цене модели"}
                        >
                          {fmtCost(rowCost(row))}
                        </td>
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
              Озвучка
              <div style={s.totalValue}>{fmt(totalTTS)}</div>
            </div>
            <div style={s.totalCard}>
              Распознавание
              <div style={s.totalValue}>{fmt(totalSTT)}</div>
            </div>
            <div style={s.totalCard}>
              Чат
              <div style={s.totalValue}>{fmtCost(totalChat)}</div>
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
