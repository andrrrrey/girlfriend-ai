"use client";

import React, { useEffect, useMemo, useState } from "react";
import { admin, type CharacterOption } from "../../lib/api";
import { adminStyles } from "./admin-styles";

/**
 * База чекпоинта (зеркало CivitaiBase в apps/ai): sd1/sdxl — Stable Diffusion
 * (SDXL/Pony/Illustrious), flux1 — Flux.1 D/S/Krea, zimage — Z Image, grok — xAI Grok Imagine.
 */
export type CivitaiBase = "sd1" | "sdxl" | "flux1" | "zimage" | "grok";
const CIVITAI_BASES: CivitaiBase[] = ["sdxl", "sd1", "flux1", "zimage", "grok"];

/** Конфиг одного чекпоинта Civitai (зеркало CivitaiModelConfig в apps/ai). */
export interface CivitaiModelConfig {
  air: string;
  base: CivitaiBase;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  /** Сэмплер A1111/Civitai («Euler a», «DPM++ 2M SDE»). "" = дефолт Civitai. */
  sampler: string;
  /** Тип расписания Civitai ("" авто | karras | exponential | simple | discrete | ays). */
  scheduler: string;
  clipSkip: number;
}

/** Допустимые сэмплеры Civitai — зеркало CIVITAI_SAMPLERS в apps/ai/apps/api. */
const CIVITAI_SAMPLERS = [
  "Euler a", "Euler", "LMS", "Heun", "DPM2", "DPM2 a", "DPM++ 2S a", "DPM++ 2M",
  "DPM++ SDE", "DPM++ 2M SDE", "DPM++ 3M SDE", "DPM fast", "DPM adaptive",
  "LMS Karras", "DPM2 Karras", "DPM2 a Karras", "DPM++ 2S a Karras", "DPM++ 2M Karras",
  "DPM++ SDE Karras", "DPM++ 2M SDE Karras", "DPM++ 3M SDE Karras",
  "DPM++ 3M SDE Exponential", "DDIM", "PLMS", "UniPC", "LCM",
];
const CIVITAI_SCHEDULERS = ["", "karras", "exponential", "simple", "discrete", "ays"];

/** Приводит сэмплер к валидному значению; легаси «EulerA» → "" (дефолт Civitai). */
function normSampler(raw: string | undefined): string {
  const v = (raw || "").trim();
  if (!v || v.toLowerCase() === "eulera") return "";
  return CIVITAI_SAMPLERS.find((s) => s.toLowerCase() === v.toLowerCase()) ?? "";
}
function normScheduler(raw: string | undefined): string {
  const v = (raw || "").trim().toLowerCase();
  return CIVITAI_SCHEDULERS.includes(v) ? v : "";
}

/**
 * Мигрирует один элемент к актуальной форме. Легаси-форма хранила сэмплер-подобное
 * значение в поле `scheduler` (обычно «EulerA») и не имела `sampler`; для таких
 * элементов сэмплер/расписание считаем «не заданными» (генерация не меняется).
 */
function migrateItem(m: CivitaiModelConfig): CivitaiModelConfig {
  const isNewShape = typeof (m as { sampler?: unknown }).sampler === "string";
  return {
    ...m,
    sampler: normSampler(isNewShape ? m.sampler : m.scheduler),
    scheduler: isNewShape ? normScheduler(m.scheduler) : "",
  };
}

/**
 * Дефолтные пулы по стилям — ЗЕРКАЛО DEFAULT_CIVITAI_MODELS в apps/ai/src/index.ts.
 * Показываются, когда AppSetting `CIVITAI_MODELS` ещё не задан.
 */
const DEFAULT_CIVITAI_MODELS: Record<string, CivitaiModelConfig[]> = {
  realism: [
    { air: "urn:air:sdxl:checkpoint:civitai:133005@1759168", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:152525@293240", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:4201@245598", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:25694@143906", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:277058@2514955", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:15003@2681234", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
  ],
  mistoon: [
    { air: "urn:air:sd1:checkpoint:civitai:24149@348981", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:24149@1151831", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:376130@2173013", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:1518336@2750313", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:715287@2744564", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
  ],
  "wai-ill": [
    { air: "urn:air:sdxl:checkpoint:civitai:827184@1612720", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:827184@1183765", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
  ],
  furry: [
    { air: "urn:air:sdxl:checkpoint:civitai:3671@1876492", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:34469@397050", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:3671@143769", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:166485@198146", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, sampler: "", scheduler: "", clipSkip: 2 },
  ],
};

const AIR_RE = /^urn:air:[a-z0-9]+:(checkpoint|diffusionmodel|unet):civitai:\d+@\d+$/;

/** Определяет базу по сегменту ecosystem AIR (зеркало baseFromAir в apps/ai). */
function baseFromAir(air: string): CivitaiBase {
  const eco = (air.match(/^urn:air:([^:]+):/i)?.[1] || "").toLowerCase();
  if (eco === "sd1") return "sd1";
  if (eco === "flux1" || eco === "fluxkrea") return "flux1";
  if (eco === "zimageturbo" || eco === "zimagebase") return "zimage";
  if (eco === "grok") return "grok";
  return "sdxl";
}
/** Дефолтные размеры/шаги/cfg под базу (Grok их не использует — только аспект). */
function defaultsForBase(base: CivitaiBase): { width: number; height: number; steps: number; cfgScale: number } {
  switch (base) {
    case "sd1": return { width: 512, height: 768, steps: 25, cfgScale: 7 };
    case "flux1": return { width: 832, height: 1216, steps: 28, cfgScale: 3.5 };
    case "zimage": return { width: 832, height: 1216, steps: 9, cfgScale: 1 };
    case "grok": return { width: 1024, height: 1536, steps: 0, cfgScale: 0 };
    default: return { width: 1024, height: 1536, steps: 25, cfgScale: 7 };
  }
}

/**
 * Разбирает текущий JSON настройки в пулы, переопределяя дефолты по стилям
 * (зеркало resolveCivitaiModels в apps/ai). Возвращает также флаг, задан ли ключ.
 */
function parseModels(raw: string | undefined): Record<string, CivitaiModelConfig[]> {
  const base: Record<string, CivitaiModelConfig[]> = JSON.parse(JSON.stringify(DEFAULT_CIVITAI_MODELS));
  if (!raw || !raw.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, CivitaiModelConfig[]>;
    for (const [style, pool] of Object.entries(parsed)) {
      if (Array.isArray(pool)) base[style] = pool.map(migrateItem);
    }
  } catch {
    /* некорректный JSON — показываем дефолты */
  }
  return base;
}

const cellInput: React.CSSProperties = { background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" };

interface Props {
  settings: Record<string, string>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

/**
 * Редактор пулов чекпоинтов Civitai (AIR) по стилям. Пишет JSON в
 * settings["CIVITAI_MODELS"]; сохранение — общей кнопкой страницы настроек.
 */
export function CivitaiModelsEditor({ settings, setSettings }: Props) {
  const models = useMemo(() => parseModels(settings["CIVITAI_MODELS"]), [settings]);
  const [styleOptions, setStyleOptions] = useState<CharacterOption[]>([]);
  // Поле «вставить ссылку Civitai» и его состояние — по каждому стилю.
  const [linkBy, setLinkBy] = useState<Record<string, string>>({});
  const [busyBy, setBusyBy] = useState<Record<string, boolean>>({});
  const [errBy, setErrBy] = useState<Record<string, string>>({});
  // Состояние кнопки «подтянуть рекомендованные» по строке (ключ `${style}:${idx}`).
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  // Справка: какие STYLE-опции привязаны к каждому пулу (по generationStyle).
  useEffect(() => {
    admin.getCharacterOptions("STYLE").then(setStyleOptions).catch(() => setStyleOptions([]));
  }, []);

  const stylesByPool = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const o of styleOptions) {
      const key = o.generationStyle || "";
      if (!key) continue;
      (map[key] ||= []).push(o.name);
    }
    return map;
  }, [styleOptions]);

  const commit = (next: Record<string, CivitaiModelConfig[]>) => {
    setSettings((prev) => ({ ...prev, CIVITAI_MODELS: JSON.stringify(next) }));
  };

  const updateItem = (style: string, idx: number, patch: Partial<CivitaiModelConfig>) => {
    const next = JSON.parse(JSON.stringify(models)) as Record<string, CivitaiModelConfig[]>;
    next[style][idx] = { ...next[style][idx], ...patch };
    commit(next);
  };
  const removeItem = (style: string, idx: number) => {
    const next = JSON.parse(JSON.stringify(models)) as Record<string, CivitaiModelConfig[]>;
    next[style].splice(idx, 1);
    commit(next);
  };
  const addItem = (style: string, preset?: Partial<CivitaiModelConfig>) => {
    const next = JSON.parse(JSON.stringify(models)) as Record<string, CivitaiModelConfig[]>;
    const base = preset?.base || "sdxl";
    next[style] = [
      ...(next[style] || []),
      { air: "", base, ...defaultsForBase(base), sampler: "", scheduler: "", clipSkip: 2, ...preset },
    ];
    commit(next);
  };

  /** Резолвит вставленную ссылку Civitai через backend и добавляет чекпоинт в пул. */
  const addFromLink = async (style: string) => {
    const url = (linkBy[style] || "").trim();
    if (!url) return;
    setBusyBy((b) => ({ ...b, [style]: true }));
    setErrBy((e) => ({ ...e, [style]: "" }));
    try {
      const r = await admin.resolveCivitaiAir(url);
      addItem(style, {
        air: r.air, base: r.base, width: r.width, height: r.height,
        // Рекомендованные автором значения из примеров модели (если Civitai их отдал).
        ...(r.cfgScale != null ? { cfgScale: r.cfgScale } : {}),
        ...(r.steps != null ? { steps: r.steps } : {}),
        ...(r.sampler ? { sampler: r.sampler } : {}),
        ...(r.scheduler ? { scheduler: r.scheduler } : {}),
        ...(r.clipSkip != null ? { clipSkip: r.clipSkip } : {}),
      });
      setLinkBy((l) => ({ ...l, [style]: "" }));
    } catch (e: any) {
      setErrBy((er) => ({ ...er, [style]: e?.message || "Не удалось разобрать ссылку" }));
    } finally {
      setBusyBy((b) => ({ ...b, [style]: false }));
    }
  };

  /**
   * Перечитывает существующий AIR через backend и подставляет рекомендованные
   * автором cfg/steps/sampler/scheduler/clipSkip в конкретную строку. AIR и
   * размеры не трогаем (их админ мог настроить осознанно).
   */
  const refreshRecommended = async (style: string, idx: number) => {
    const air = (models[style]?.[idx]?.air || "").trim();
    if (!air) return;
    const key = `${style}:${idx}`;
    setRefreshing((r) => ({ ...r, [key]: true }));
    setErrBy((e) => ({ ...e, [style]: "" }));
    try {
      const r = await admin.resolveCivitaiAir(air);
      const patch: Partial<CivitaiModelConfig> = {};
      if (r.cfgScale != null) patch.cfgScale = r.cfgScale;
      if (r.steps != null) patch.steps = r.steps;
      if (r.sampler) patch.sampler = r.sampler;
      if (r.scheduler) patch.scheduler = r.scheduler;
      if (r.clipSkip != null) patch.clipSkip = r.clipSkip;
      if (Object.keys(patch).length === 0) {
        setErrBy((er) => ({ ...er, [style]: "У модели нет примеров с параметрами генерации" }));
      } else {
        updateItem(style, idx, patch);
      }
    } catch (e: any) {
      setErrBy((er) => ({ ...er, [style]: e?.message || "Не удалось подтянуть рекомендованные" }));
    } finally {
      setRefreshing((r) => ({ ...r, [key]: false }));
    }
  };
  const resetToDefaults = () => {
    setSettings((prev) => {
      const copy = { ...prev };
      delete copy["CIVITAI_MODELS"];
      // Пустая строка → бэкенд использует дефолты (resolveCivitaiModels).
      return { ...copy, CIVITAI_MODELS: "" };
    });
  };

  return (
    <div style={{ ...adminStyles.card, marginBottom: 20 }}>
      <h2 style={adminStyles.title}>Civitai AIR модели</h2>
      <p style={adminStyles.subtitle}>
        Пулы чекпоинтов (AIR) по стилям. При генерации берётся случайный чекпоинт из пула стиля персонажа
        и затем пиннится к персонажу. Пустой редактор = используются дефолты. Сэмплер/расписание пустые =
        дефолт Civitai. Кнопка «↻» подтягивает рекомендованные автором cfg/steps/sampler из примеров модели;
        добавление по ссылке подставляет их автоматически.
      </p>

      {/* Инструкция «Где взять Civitai AIR» */}
      <details style={{ marginBottom: 16, background: "#141414", border: "1px solid #262626", borderRadius: 8, padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", color: "#f95bad", fontSize: 13, fontWeight: 600 }}>Где взять Civitai AIR?</summary>
        <div style={{ color: "#b8b8b8", fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
          <p style={{ margin: "0 0 6px" }}>Проще всего — вставить в поле «Добавить по ссылке» ссылку на модель (<code style={{ color: "#fff" }}>/models/&#123;modelId&#125;?modelVersionId=…</code>) или на картинку (<code style={{ color: "#fff" }}>/images/&#123;imageId&#125;</code>, civitai.com или civitai.red) — AIR, база и параметры определятся сами. Для картинки берётся чекпоинт из её блока Resources.</p>
          <p style={{ margin: "0 0 6px" }}>Формат: <code style={{ color: "#fff" }}>urn:air:&#123;ecosystem&#125;:checkpoint:civitai:&#123;modelId&#125;@&#123;versionId&#125;</code></p>
          <ol style={{ margin: "0 0 6px 18px", padding: 0 }}>
            <li><b>ecosystem</b> по «Base Model»: SD 1.5 → <code>sd1</code>; SDXL / Pony / Illustrious → <code>sdxl</code>; Flux.1 D/S → <code>flux1</code>; Flux.1 Krea → <code>fluxkrea</code>; Z Image Turbo → <code>zimageturbo</code> (тип <code>diffusionmodel</code>); Grok → <code>grok</code>.</li>
            <li>Тип должен быть <b>Checkpoint</b> (LoRA/embedding не поддерживаются). Krea 2, OpenAI, Flux.2 и прочие API-базы пока не поддерживаются.</li>
            <li><b>Grok</b>: игнорирует negative prompt, seed, шаги и cfg; модерация xAI может отклонять откровенный контент. Версии: v1.0 = 2738377, v2.0 = 3225510 (v1.5 — только видео).</li>
          </ol>
          <p style={{ margin: 0 }}>Пример: <code style={{ color: "#fff" }}>urn:air:sdxl:checkpoint:civitai:827184@1612720</code>. Описание: developer.civitai.com/site/guide/air</p>
        </div>
      </details>

      {Object.keys(models).map((style) => (
        <div key={style} style={{ marginBottom: 20, border: "1px solid #222", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h3 style={{ color: "#fff", fontSize: 14, margin: 0 }}>{style}</h3>
            <span style={{ color: "#848484", fontSize: 12 }}>{models[style].length} чекпоинт(ов)</span>
            {stylesByPool[style]?.length ? (
              <span style={{ color: "#6f7496", fontSize: 12 }}>· STYLE-опции: {stylesByPool[style].join(", ")}</span>
            ) : null}
          </div>

          {/* Заголовки колонок */}
          {models[style].length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, color: "#6f7496", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <span style={{ flex: 1, minWidth: 320 }}>AIR (идентификатор чекпоинта)</span>
              <span style={{ width: 72 }} title="Базовая архитектура SD">база</span>
              <span style={{ width: 60 }} title="Ширина изображения, px">ширина</span>
              <span style={{ width: 60 }} title="Высота изображения, px">высота</span>
              <span style={{ width: 56 }} title="Число шагов диффузии">шаги</span>
              <span style={{ width: 52 }} title="CFG scale — сила следования промпту">cfg</span>
              <span style={{ width: 140 }} title="Сэмплер (пусто = дефолт Civitai)">сэмплер</span>
              <span style={{ width: 96 }} title="Тип расписания шумов (пусто = дефолт Civitai)">расписание</span>
              <span style={{ width: 52 }} title="Clip skip">clip</span>
              <span style={{ width: 34 }} title="Подтянуть рекомендованные автором параметры">рек.</span>
              <span style={{ width: 34 }} />
            </div>
          )}

          {models[style].map((m, idx) => {
            const invalid = !!m.air && !AIR_RE.test(m.air);
            return (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <input
                  style={{ ...cellInput, flex: 1, minWidth: 320, borderColor: invalid ? "#e36466" : "#313131" }}
                  placeholder="urn:air:sdxl:checkpoint:civitai:..."
                  value={m.air}
                  onChange={(e) => {
                    const air = e.target.value.trim();
                    const base = baseFromAir(air);
                    updateItem(style, idx, { air, base });
                  }}
                />
                <select style={{ ...cellInput, width: 72 }} value={m.base} onChange={(e) => updateItem(style, idx, { base: e.target.value as CivitaiBase })}>
                  {CIVITAI_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <input style={{ ...cellInput, width: 60 }} type="number" title="width" value={m.width} onChange={(e) => updateItem(style, idx, { width: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 60 }} type="number" title="height" value={m.height} onChange={(e) => updateItem(style, idx, { height: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 56 }} type="number" title="steps" value={m.steps} onChange={(e) => updateItem(style, idx, { steps: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 52 }} type="number" title="cfgScale" value={m.cfgScale} onChange={(e) => updateItem(style, idx, { cfgScale: parseFloat(e.target.value) || 0 })} />
                <select style={{ ...cellInput, width: 140 }} title="sampler" value={CIVITAI_SAMPLERS.includes(m.sampler) ? m.sampler : ""} onChange={(e) => updateItem(style, idx, { sampler: e.target.value })}>
                  <option value="">дефолт Civitai</option>
                  {CIVITAI_SAMPLERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select style={{ ...cellInput, width: 96 }} title="scheduler (тип расписания)" value={normScheduler(m.scheduler)} onChange={(e) => updateItem(style, idx, { scheduler: e.target.value })}>
                  <option value="">авто</option>
                  {CIVITAI_SCHEDULERS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input style={{ ...cellInput, width: 52 }} type="number" title="clipSkip" value={m.clipSkip} onChange={(e) => updateItem(style, idx, { clipSkip: parseInt(e.target.value, 10) || 0 })} />
                <button
                  onClick={() => void refreshRecommended(style, idx)}
                  disabled={!m.air || AIR_RE.test(m.air) === false || !!refreshing[`${style}:${idx}`]}
                  title="Подтянуть рекомендованные автором cfg/steps/sampler из примеров модели"
                  style={{ background: "transparent", border: "1px solid #2f3a5a", color: "#8fa3d6", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12, opacity: refreshing[`${style}:${idx}`] ? 0.5 : 1 }}
                >
                  {refreshing[`${style}:${idx}`] ? "…" : "↻"}
                </button>
                <button
                  onClick={() => removeItem(style, idx)}
                  style={{ background: "transparent", border: "1px solid #4a2222", color: "#e36466", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Быстрое добавление: вставка ссылки Civitai → авто-заполнение */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <input
              style={{ ...cellInput, flex: 1, minWidth: 320 }}
              placeholder="Ссылка Civitai на модель (/models/…) или картинку (/images/…), либо AIR"
              value={linkBy[style] || ""}
              onChange={(e) => setLinkBy((l) => ({ ...l, [style]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") void addFromLink(style); }}
            />
            <button
              onClick={() => void addFromLink(style)}
              disabled={!!busyBy[style]}
              style={{ background: "#f95bad", border: "none", color: "#fff", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: busyBy[style] ? 0.6 : 1 }}
            >
              {busyBy[style] ? "Загрузка…" : "Добавить по ссылке"}
            </button>
            <button
              onClick={() => addItem(style)}
              style={{ background: "transparent", border: "1px solid #313131", color: "#cfcfcf", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
            >
              + Пустой чекпоинт
            </button>
          </div>
          {errBy[style] && <p style={{ color: "#e36466", fontSize: 12, margin: "6px 0 0" }}>{errBy[style]}</p>}
        </div>
      ))}

      <button
        onClick={resetToDefaults}
        style={{ background: "transparent", border: "1px solid #313131", color: "#848484", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
      >
        Сбросить к дефолтам
      </button>
    </div>
  );
}
