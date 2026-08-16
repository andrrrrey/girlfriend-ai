"use client";

import React, { useEffect, useMemo, useState } from "react";
import { admin, type CharacterOption } from "../../lib/api";
import { adminStyles } from "./admin-styles";

/** Конфиг одного чекпоинта Civitai (зеркало CivitaiModelConfig в apps/ai). */
export interface CivitaiModelConfig {
  air: string;
  base: "sd1" | "sdxl";
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  scheduler: string;
  clipSkip: number;
}

/**
 * Дефолтные пулы по стилям — ЗЕРКАЛО DEFAULT_CIVITAI_MODELS в apps/ai/src/index.ts.
 * Показываются, когда AppSetting `CIVITAI_MODELS` ещё не задан.
 */
const DEFAULT_CIVITAI_MODELS: Record<string, CivitaiModelConfig[]> = {
  realism: [
    { air: "urn:air:sdxl:checkpoint:civitai:133005@1759168", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:152525@293240", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:4201@245598", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:25694@143906", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:277058@2514955", base: "sdxl", width: 1024, height: 1536, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:15003@2681234", base: "sd1", width: 512, height: 768, steps: 30, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
  ],
  mistoon: [
    { air: "urn:air:sd1:checkpoint:civitai:24149@348981", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:24149@1151831", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:376130@2173013", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:1518336@2750313", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:715287@2744564", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
  ],
  "wai-ill": [
    { air: "urn:air:sdxl:checkpoint:civitai:827184@1612720", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sdxl:checkpoint:civitai:827184@1183765", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
  ],
  furry: [
    { air: "urn:air:sdxl:checkpoint:civitai:3671@1876492", base: "sdxl", width: 1024, height: 1536, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:34469@397050", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:3671@143769", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
    { air: "urn:air:sd1:checkpoint:civitai:166485@198146", base: "sd1", width: 512, height: 768, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 },
  ],
};

const AIR_RE = /^urn:air:(sd1|sdxl):checkpoint:civitai:\d+@\d+$/;

/** Определяет базу по AIR (для авто-подстановки width/height при вставке). */
function baseFromAir(air: string): "sd1" | "sdxl" {
  return air.includes(":sd1:") ? "sd1" : "sdxl";
}
function dimsForBase(base: "sd1" | "sdxl"): { width: number; height: number } {
  return base === "sd1" ? { width: 512, height: 768 } : { width: 1024, height: 1536 };
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
      if (Array.isArray(pool)) base[style] = pool;
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
  const addItem = (style: string) => {
    const next = JSON.parse(JSON.stringify(models)) as Record<string, CivitaiModelConfig[]>;
    const dims = dimsForBase("sdxl");
    next[style] = [...(next[style] || []), { air: "", base: "sdxl", ...dims, steps: 25, cfgScale: 7, scheduler: "EulerA", clipSkip: 2 }];
    commit(next);
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
        и затем пиннится к персонажу. Пустой редактор = используются дефолты.
      </p>

      {/* Инструкция «Где взять Civitai AIR» */}
      <details style={{ marginBottom: 16, background: "#141414", border: "1px solid #262626", borderRadius: 8, padding: "10px 12px" }}>
        <summary style={{ cursor: "pointer", color: "#f95bad", fontSize: 13, fontWeight: 600 }}>Где взять Civitai AIR?</summary>
        <div style={{ color: "#b8b8b8", fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
          <p style={{ margin: "0 0 6px" }}>Формат: <code style={{ color: "#fff" }}>urn:air:&#123;ecosystem&#125;:checkpoint:civitai:&#123;modelId&#125;@&#123;versionId&#125;</code></p>
          <ol style={{ margin: "0 0 6px 18px", padding: 0 }}>
            <li>Открой страницу модели-чекпоинта на civitai.com — URL вида <code style={{ color: "#fff" }}>civitai.com/models/&#123;modelId&#125;?modelVersionId=&#123;versionId&#125;</code>; оба числа в адресной строке.</li>
            <li><b>ecosystem</b>: SD 1.5 → <code>sd1</code>; SDXL / Pony / Illustrious → <code>sdxl</code> (см. «Base Model» на странице).</li>
            <li>Тип должен быть <b>Checkpoint</b> (LoRA/embedding не поддерживаются).</li>
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
                <select style={{ ...cellInput, width: 72 }} value={m.base} onChange={(e) => updateItem(style, idx, { base: e.target.value as "sd1" | "sdxl" })}>
                  <option value="sdxl">sdxl</option>
                  <option value="sd1">sd1</option>
                </select>
                <input style={{ ...cellInput, width: 60 }} type="number" title="width" value={m.width} onChange={(e) => updateItem(style, idx, { width: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 60 }} type="number" title="height" value={m.height} onChange={(e) => updateItem(style, idx, { height: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 56 }} type="number" title="steps" value={m.steps} onChange={(e) => updateItem(style, idx, { steps: parseInt(e.target.value, 10) || 0 })} />
                <input style={{ ...cellInput, width: 52 }} type="number" title="cfgScale" value={m.cfgScale} onChange={(e) => updateItem(style, idx, { cfgScale: parseFloat(e.target.value) || 0 })} />
                <input style={{ ...cellInput, width: 84 }} title="scheduler" value={m.scheduler} onChange={(e) => updateItem(style, idx, { scheduler: e.target.value })} />
                <input style={{ ...cellInput, width: 52 }} type="number" title="clipSkip" value={m.clipSkip} onChange={(e) => updateItem(style, idx, { clipSkip: parseInt(e.target.value, 10) || 0 })} />
                <button
                  onClick={() => removeItem(style, idx)}
                  style={{ background: "transparent", border: "1px solid #4a2222", color: "#e36466", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            );
          })}

          <button
            onClick={() => addItem(style)}
            style={{ marginTop: 6, background: "transparent", border: "1px solid #313131", color: "#cfcfcf", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}
          >
            + Добавить чекпоинт
          </button>
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
