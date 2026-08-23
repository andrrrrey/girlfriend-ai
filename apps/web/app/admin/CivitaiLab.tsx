"use client";

import React, { useState } from "react";
import { admin } from "../../lib/api";
import { adminStyles } from "./admin-styles";

/**
 * СПАЙК-инструмент: отправляет произвольный payload на Civitai Orchestration
 * (через backend с сохранённым токеном) и показывает сырой ответ. Нужен, чтобы
 * до внедрения IP-Adapter/ControlNet эмпирически проверить, какой engine и какие
 * поля (controlNets/additionalNetworks) реально принимает API. Временный.
 */

const TEMPLATE_BASE = `{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "sdxl",
        "operation": "createImage",
        "model": "urn:air:sdxl:checkpoint:civitai:827184@1612720",
        "prompt": "beautiful woman, standing in a bedroom, masterpiece, best quality",
        "negativePrompt": "worst quality, low quality, deformed",
        "width": 1024,
        "height": 1536,
        "cfgScale": 7,
        "steps": 25,
        "clipSkip": 2,
        "quantity": 1
      }
    }
  ]
}`;

// Проба LoRA на sdcpp: движок вернул поле "loras" в эхо — проверяем, что AIR
// LoRA принимается. Замените AIR на реальный SDXL-LoRA с civitai.com.
const TEMPLATE_LORA = `{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "sdxl",
        "operation": "createImage",
        "model": "urn:air:sdxl:checkpoint:civitai:827184@1612720",
        "prompt": "beautiful woman, masterpiece, best quality",
        "negativePrompt": "worst quality, low quality",
        "width": 1024,
        "height": 1536,
        "cfgScale": 7,
        "steps": 25,
        "clipSkip": 2,
        "quantity": 1,
        "loras": { "urn:air:sdxl:lora:civitai:REPLACE@REPLACE": 0.8 }
      }
    }
  ]
}`;

// Проба ControlNet на sdcpp: смотрим, попадёт ли controlNets в эхо input
// (в базовом прогоне его не было → движок, вероятно, игнорирует поле).
// imageUrl замените на реальный URL картинки-позы.
const TEMPLATE_CONTROLNET = `{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "engine": "sdcpp",
        "ecosystem": "sdxl",
        "operation": "createImage",
        "model": "urn:air:sdxl:checkpoint:civitai:827184@1612720",
        "prompt": "beautiful woman, sitting on a chair, masterpiece, best quality",
        "negativePrompt": "worst quality, low quality, deformed",
        "width": 1024,
        "height": 1536,
        "cfgScale": 7,
        "steps": 25,
        "clipSkip": 2,
        "quantity": 1,
        "controlNets": [
          {
            "preprocessor": "OpenPose",
            "imageUrl": "https://REPLACE-with-pose-image.png",
            "weight": 0.7,
            "startStep": 0,
            "endStep": 20
          }
        ]
      }
    }
  ]
}`;

// Проба «движок по умолчанию»: engine убран — Civitai подставит движок сам.
// Смотрим, какой engine вернётся в эхо и появятся ли controlNets (т.е. есть ли
// вообще движок с поддержкой ControlNet через простой imageGen).
const TEMPLATE_DEFAULT_ENGINE = `{
  "steps": [
    {
      "$type": "imageGen",
      "input": {
        "ecosystem": "sdxl",
        "operation": "createImage",
        "model": "urn:air:sdxl:checkpoint:civitai:827184@1612720",
        "prompt": "beautiful woman, masterpiece, best quality",
        "negativePrompt": "worst quality, low quality",
        "width": 1024,
        "height": 1536,
        "cfgScale": 7,
        "steps": 25,
        "clipSkip": 2,
        "quantity": 1,
        "controlNets": [
          { "preprocessor": "OpenPose", "imageUrl": "https://REPLACE-with-pose-image.png", "weight": 0.7 }
        ]
      }
    }
  ]
}`;

// Проба доступности comfy-workflow: минимальный шаг $type:"comfy". Ждём 400
// с описанием требуемых полей (значит comfy доступен и покажет схему) ЛИБО
// ошибку «неизвестный тип шага» (значит путь недоступен на нашем плане).
const TEMPLATE_COMFY = `{
  "steps": [
    {
      "$type": "comfy",
      "input": {}
    }
  ]
}`;

const codeBox: React.CSSProperties = {
  width: "100%", minHeight: 260, background: "#0b0b0b", border: "1px solid #262626", borderRadius: 8,
  color: "#d8d8d8", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, padding: 12, outline: "none", resize: "vertical",
};

export function CivitaiLab() {
  const [payload, setPayload] = useState(TEMPLATE_BASE);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<{ httpStatus: number; ok: boolean; body: unknown } | null>(null);
  const [err, setErr] = useState("");

  const send = async () => {
    setErr(""); setResp(null);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch (e: any) { setErr("Некорректный JSON: " + (e?.message || "")); return; }
    setBusy(true);
    try {
      const r = await admin.civitaiRawTest(parsed);
      setResp(r);
    } catch (e: any) {
      setErr(e?.message || "Запрос не удался");
    } finally {
      setBusy(false);
    }
  };

  const btn: React.CSSProperties = { background: "transparent", border: "1px solid #313131", color: "#cfcfcf", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, marginRight: 8 };

  return (
    <details style={{ ...adminStyles.card, marginBottom: 20 }}>
      <summary style={{ cursor: "pointer", color: "#f95bad", fontSize: 16, fontWeight: 700 }}>
        Civitai Lab — спайк ControlNet / IP-Adapter (временный)
      </summary>
      <p style={adminStyles.subtitle}>
        Отправляет сырой payload на Civitai Orchestration с вашим токеном. Задача спайка: подтвердить, какой
        <code> engine </code> и какие поля (<code>controlNets</code>, <code>additionalNetworks</code>) принимаются.
        Смотрите на HTTP-статус и тело ответа (ошибки валидации подскажут допустимые поля).
      </p>

      <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        <button style={btn} onClick={() => setPayload(TEMPLATE_BASE)}>Проба: база (sdcpp)</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_LORA)}>Проба A: LoRA</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_CONTROLNET)}>Проба B: ControlNet (sdcpp)</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_DEFAULT_ENGINE)}>Проба C: движок по умолчанию</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_COMFY)}>Проба D: comfy (доступность)</button>
      </div>

      <textarea style={codeBox} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={send}
          disabled={busy}
          style={{ background: "#f95bad", border: "none", color: "#fff", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Отправка…" : "Отправить в Civitai"}
        </button>
        {err && <span style={{ color: "#e36466", fontSize: 13 }}>{err}</span>}
      </div>

      {resp && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6, color: resp.ok ? "#4ade80" : "#e36466" }}>
            HTTP {resp.httpStatus} {resp.ok ? "OK" : "— ошибка (см. тело)"}
          </div>

          {/* Анализ: какие поля движок реально принял (эхо input в ответе). */}
          {(() => {
            const echo = (resp.body as any)?.steps?.[0]?.input;
            if (!echo || typeof echo !== "object") return null;
            const has = (k: string) => Object.prototype.hasOwnProperty.call(echo, k);
            const rows: { label: string; ok: boolean; note?: string }[] = [
              { label: `engine = ${echo.engine ?? "?"}`, ok: true },
              { label: "loras (LoRA)", ok: has("loras") },
              { label: "embeddings", ok: has("embeddings") },
              { label: "controlNets (ControlNet)", ok: has("controlNets") },
              { label: "ipAdapters / ipAdapter (IP-Adapter)", ok: has("ipAdapters") || has("ipAdapter") },
            ];
            return (
              <div style={{ marginBottom: 8, padding: 10, background: "#101010", border: "1px solid #262626", borderRadius: 8 }}>
                <div style={{ color: "#cfcfcf", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Принятые поля (эхо input):</div>
                {rows.map((r) => (
                  <div key={r.label} style={{ fontSize: 12, color: r.ok ? "#4ade80" : "#e36466" }}>
                    {r.ok ? "✓" : "✗"} {r.label}
                  </div>
                ))}
                <div style={{ color: "#6f7496", fontSize: 11, marginTop: 6 }}>
                  ✗ = поле выброшено движком (не поддерживается на этом engine).
                </div>
              </div>
            );
          })()}

          <pre style={{ ...codeBox, minHeight: 120, whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {typeof resp.body === "string" ? resp.body : JSON.stringify(resp.body, null, 2)}
          </pre>
        </div>
      )}

      <p style={{ ...adminStyles.subtitle, marginTop: 10 }}>
        Подсказки для проб: если <code>sdcpp</code> отклоняет controlNets — попробуйте убрать <code>engine</code>
        (дефолтный движок) или другой движок из доков Civitai. ControlNet/IP-Adapter модели зависят от базы
        (отдельные AIR для sd1 и sdxl). Для IP-Adapter ищите модель на civitai.com (напр. IP-Adapter SDXL) и
        пробуйте её AIR в <code>additionalNetworks</code> с разными <code>type</code>.
      </p>
    </details>
  );
}
