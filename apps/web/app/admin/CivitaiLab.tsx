"use client";

import React, { useEffect, useRef, useState } from "react";
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

// Проба E: comfy txt2img — минимальный ComfyUI-граф (API-format). Сначала нужно
// добиться, чтобы этот граф вернул картинку (подтвердить приём AIR в ckpt_name).
const TEMPLATE_COMFY_TXT2IMG = `{
  "steps": [
    {
      "$type": "comfy",
      "input": {
        "quantity": 1,
        "comfyWorkflow": {
          "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "urn:air:sdxl:checkpoint:civitai:827184@1612720" } },
          "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1536, "batch_size": 1 } },
          "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "beautiful woman, masterpiece, best quality", "clip": ["4", 1] } },
          "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "worst quality, low quality", "clip": ["4", 1] } },
          "3": { "class_type": "KSampler", "inputs": { "seed": 12345, "steps": 25, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
          "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
          "9": { "class_type": "SaveImage", "inputs": { "images": ["8", 0] } }
        }
      }
    }
  ]
}`;

// Проба F: comfy + IP-Adapter (ПОДТВЕРЖДЕНО рабочим). IPAdapterUnifiedLoader сам
// подтягивает IP-Adapter + CLIP-Vision по пресету. Чекпоинт — generation-enabled.
// Замените "url" на публичный URL лица-референса.
const TEMPLATE_COMFY_IPADAPTER = `{
  "steps": [
    {
      "$type": "comfy",
      "input": {
        "quantity": 1,
        "comfyWorkflow": {
          "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "urn:air:sdxl:checkpoint:civitai:133005@1759168" } },
          "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1536, "batch_size": 1 } },
          "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "sitting on a chair in a cafe, full body, masterpiece, best quality", "clip": ["4", 1] } },
          "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "worst quality, low quality", "clip": ["4", 1] } },
          "10": { "class_type": "IPAdapterUnifiedLoader", "inputs": { "model": ["4", 0], "preset": "PLUS (high strength)" } },
          "12": { "class_type": "LoadImageFromUrl", "inputs": { "image": "https://image-b2.civitai.com/file/civitai-media-cache/5034e109-665d-4947-a998-5fa4804e1185/original" } },
          "13": { "class_type": "IPAdapter", "inputs": { "model": ["10", 0], "ipadapter": ["10", 1], "image": ["12", 0], "weight": 0.7, "start_at": 0, "end_at": 1, "weight_type": "standard" } },
          "3": { "class_type": "KSampler", "inputs": { "seed": 12345, "steps": 25, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["13", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
          "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
          "9": { "class_type": "SaveImage", "inputs": { "images": ["8", 0], "filename_prefix": "ipadapter" } }
        }
      }
    }
  ]
}`;

// Проба G1: snapshot node-паков — ОБЯЗАТЕЛЬНЫЙ первый шаг. Civitai требует
// объявлять в customComfy.resources НЕ bare-nodepack URN, а install-layer AIR
// (urn:air:comfy:nodepacklayer:…), который выдаёт этот шаг. Запустите, дождитесь
// succeeded и скопируйте results[].layerAir → вставьте в «Пробу G2» и/или в
// настройку IPADAPTER_NODEPACK_LAYERS. Снапшот кэшируем (делается один раз на пак).
const TEMPLATE_NODEPACK_SNAPSHOT = `{
  "steps": [
    {
      "$type": "comfyNodepackSnapshot",
      "input": {
        "nodepacks": [
          "urn:air:comfy:nodepack:comfyregistry:matteo/comfyui_ipadapter_plus@2.0.0",
          "urn:air:comfy:nodepack:comfyregistry:protogaia/comfyui-art-venture@1.1.7"
        ]
      }
    }
  ]
}`;

// Проба G2: customComfy + IP-Adapter (ПРАВИЛЬНЫЙ путь). В отличие от пробы F
// ($type:"comfy" — кастомные ноды НЕ устанавливаются, граф принимается, но
// IPAdapter*/LoadImageFromUrl падают при загрузке), здесь $type:"customComfy".
// ВАЖНО: в resources — layer-AIR из «Пробы G1» (urn:air:comfy:nodepacklayer:…),
// а НЕ bare-nodepack URN. Замените плейсхолдеры ниже на реальные layerAir из G1:
//   ..._ipadapter_plus_LAYER → IPAdapterUnifiedLoader, IPAdapter
//   ..._art_venture_LAYER    → LoadImageFromUrl
// workflow (не comfyWorkflow) — сырой граф; trace:"logs" — стрим логов ComfyUI.
// Замените url на публичный URL лица-референса.
const TEMPLATE_CUSTOMCOMFY_IPADAPTER = `{
  "steps": [
    {
      "$type": "customComfy",
      "input": {
        "trace": "logs",
        "resources": [
          "urn:air:sdxl:checkpoint:civitai:133005@1759168",
          "PASTE_ipadapter_plus_LAYER_from_G1",
          "PASTE_art_venture_LAYER_from_G1"
        ],
        "workflow": {
          "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "urn:air:sdxl:checkpoint:civitai:133005@1759168" } },
          "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1536, "batch_size": 1 } },
          "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "sitting on a chair in a cafe, full body, masterpiece, best quality", "clip": ["4", 1] } },
          "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "worst quality, low quality", "clip": ["4", 1] } },
          "10": { "class_type": "IPAdapterUnifiedLoader", "inputs": { "model": ["4", 0], "preset": "PLUS (high strength)" } },
          "12": { "class_type": "LoadImageFromUrl", "inputs": { "image": "https://image-b2.civitai.com/file/civitai-media-cache/5034e109-665d-4947-a998-5fa4804e1185/original" } },
          "13": { "class_type": "IPAdapter", "inputs": { "model": ["10", 0], "ipadapter": ["10", 1], "image": ["12", 0], "weight": 0.7, "start_at": 0, "end_at": 1, "weight_type": "standard" } },
          "3": { "class_type": "KSampler", "inputs": { "seed": 12345, "steps": 25, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["13", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
          "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
          "9": { "class_type": "SaveImage", "inputs": { "images": ["8", 0], "filename_prefix": "ipadapter" } }
        }
      }
    }
  ]
}`;

// Проба G3: customComfy + IP-Adapter через SPLIT-LOADER. Нужна, потому что в
// песочнице Civitai IPAdapterUnifiedLoader падает "ClipVision model not found"
// (авто-докачка моделей недоступна). Здесь модели объявляем в resources как AIR
// и грузим явно: IPAdapterModelLoader (ipadapter_file) + CLIPVisionLoader
// (clip_name), затем IPAdapterAdvanced. Значения AIR передаются как имена файлов —
// так же, как AIR-чекпоинт работает в ckpt_name.
//   IP-Adapter модель (Civitai, SDXL PLUS ViT-H): urn:air:sdxl:controlnet:civitai:277315@338834
//   CLIP-Vision: подставьте AIR (пока не подтверждён; кандидат — HF h94/IP-Adapter
//   image_encoder). Если падает — смотрите trace и меняйте CLIP_VISION_AIR.
const TEMPLATE_CUSTOMCOMFY_IPADAPTER_SPLIT = `{
  "steps": [
    {
      "$type": "customComfy",
      "input": {
        "trace": "logs",
        "resources": [
          "urn:air:sdxl:checkpoint:civitai:133005@1759168",
          "urn:air:comfy:nodepacklayer:comfyregistry:matteo/comfyui_ipadapter_plus@2.0.0+75726e3a6169723a6f63693a696d6167653a676863723a636976697461692f636976697461692d7370696e652d636f6d66792d636c6f75644076322e372e35",
          "urn:air:comfy:nodepacklayer:comfyregistry:protogaia/comfyui-art-venture@1.1.7+75726e3a6169723a6f63693a696d6167653a676863723a636976697461692f636976697461692d7370696e652d636f6d66792d636c6f75644076322e372e35",
          "urn:air:sdxl:controlnet:civitai:277315@338834",
          "PASTE_CLIP_VISION_AIR"
        ],
        "workflow": {
          "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "urn:air:sdxl:checkpoint:civitai:133005@1759168" } },
          "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1536, "batch_size": 1 } },
          "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "sitting on a chair in a cafe, full body, masterpiece, best quality", "clip": ["4", 1] } },
          "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "worst quality, low quality", "clip": ["4", 1] } },
          "10": { "class_type": "IPAdapterModelLoader", "inputs": { "ipadapter_file": "urn:air:sdxl:controlnet:civitai:277315@338834" } },
          "11": { "class_type": "CLIPVisionLoader", "inputs": { "clip_name": "PASTE_CLIP_VISION_AIR" } },
          "12": { "class_type": "LoadImageFromUrl", "inputs": { "image": "https://image-b2.civitai.com/file/civitai-media-cache/5034e109-665d-4947-a998-5fa4804e1185/original" } },
          "13": { "class_type": "IPAdapterAdvanced", "inputs": { "model": ["4", 0], "ipadapter": ["10", 0], "clip_vision": ["11", 0], "image": ["12", 0], "weight": 0.7, "weight_type": "standard", "combine_embeds": "concat", "start_at": 0, "end_at": 1, "embeds_scaling": "V only" } },
          "3": { "class_type": "KSampler", "inputs": { "seed": 12345, "steps": 25, "cfg": 7, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["13", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
          "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
          "9": { "class_type": "SaveImage", "inputs": { "images": ["8", 0], "filename_prefix": "ipadapter" } }
        }
      }
    }
  ]
}`;

const codeBox: React.CSSProperties = {
  width: "100%", minHeight: 260, background: "#0b0b0b", border: "1px solid #262626", borderRadius: 8,
  color: "#d8d8d8", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, padding: 12, outline: "none", resize: "vertical",
};

const TERMINAL = new Set(["succeeded", "completed", "failed", "cancelled", "expired"]);

export function CivitaiLab() {
  const [payload, setPayload] = useState(TEMPLATE_BASE);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<{ httpStatus: number; ok: boolean; body: unknown } | null>(null);
  const [err, setErr] = useState("");
  const [polling, setPolling] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Бесплатная проверка AIR (подбор моделей без трат buzz). Пакетно: по строке на AIR.
  const [airToCheck, setAirToCheck] = useState("");
  const [airChecks, setAirChecks] = useState<{ air: string; httpStatus: number; ok: boolean; canGenerate?: boolean; note?: string }[]>([]);
  const [airBusy, setAirBusy] = useState(false);
  const checkAir = async () => {
    const airs = airToCheck.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!airs.length) return;
    setAirBusy(true); setAirChecks([]);
    const out: { air: string; httpStatus: number; ok: boolean; canGenerate?: boolean; note?: string }[] = [];
    for (const air of airs) {
      try {
        const r = await admin.civitaiResourceInfo(air);
        const b = r.body as any;
        const msgs = b?.errors ? Object.values(b.errors).flat().join("; ") : "";
        out.push({ air, httpStatus: r.httpStatus, ok: r.ok, canGenerate: b?.canGenerate, note: msgs || b?.availability?.status || b?.error || b?.title });
      } catch (e: any) {
        out.push({ air, httpStatus: 0, ok: false, note: e?.message || "ошибка" });
      }
      setAirChecks([...out]);
    }
    setAirBusy(false);
  };

  // Инспектор object_info: показать доступные файлы моделей в образе Civitai.
  const [objUrl, setObjUrl] = useState("");
  const [objInfo, setObjInfo] = useState<{ ok: boolean; body: unknown } | null>(null);
  const [objBusy, setObjBusy] = useState(false);
  const inspectObjInfo = async () => {
    if (!objUrl.trim()) return;
    setObjBusy(true); setObjInfo(null);
    try { setObjInfo(await admin.civitaiObjectInfo(objUrl.trim())); }
    catch (e: any) { setObjInfo({ ok: false, body: { error: e?.message || "ошибка" } }); }
    finally { setObjBusy(false); }
  };

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  };
  useEffect(() => () => stopPoll(), []);

  const pollOnce = async (id: string) => {
    try {
      const r = await admin.civitaiWorkflowStatus(id);
      setResp(r);
      const status = (r.body as any)?.status;
      if (status && TERMINAL.has(status)) stopPoll();
    } catch (e: any) {
      setErr(e?.message || "Опрос статуса не удался");
      stopPoll();
    }
  };

  const send = async () => {
    setErr(""); setResp(null); stopPoll(); setWorkflowId(null);
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch (e: any) { setErr("Некорректный JSON: " + (e?.message || "")); return; }
    setBusy(true);
    try {
      const r = await admin.civitaiRawTest(parsed);
      setResp(r);
      const body = r.body as any;
      const id = body?.id;
      const status = body?.status;
      // Submit прошёл (есть id) и генерация ещё не завершена → авто-опрос статуса.
      if (id && (!status || !TERMINAL.has(status))) {
        setWorkflowId(id);
        setPolling(true);
        let ticks = 0;
        pollRef.current = setInterval(() => {
          ticks += 1;
          if (ticks > 40) { stopPoll(); return; } // ~2 мин
          void pollOnce(id);
        }, 3000);
      }
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
        <button style={btn} onClick={() => setPayload(TEMPLATE_COMFY_TXT2IMG)}>Проба E: comfy txt2img</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_COMFY_IPADAPTER)}>Проба F: comfy + IP-Adapter</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_NODEPACK_SNAPSHOT)}>Проба G1: snapshot node-паков</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_CUSTOMCOMFY_IPADAPTER)}>Проба G2: customComfy + IP-Adapter (auto)</button>
        <button style={btn} onClick={() => setPayload(TEMPLATE_CUSTOMCOMFY_IPADAPTER_SPLIT)}>Проба G3: split-loader (clip_vision из resources) ✓</button>
      </div>

      {/* Бесплатная проверка AIR (не тратит buzz) — подбор моделей (напр. clip_vision). */}
      <div style={{ margin: "0 0 10px", padding: 10, background: "#101010", border: "1px solid #262626", borderRadius: 8 }}>
        <div style={{ color: "#cfcfcf", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Проверить AIR (бесплатно, без генерации) — по одному AIR в строке</div>
        <textarea
          style={{ width: "100%", minHeight: 70, background: "#0b0b0b", border: "1px solid #313131", borderRadius: 6, padding: "7px 10px", color: "#fff", fontFamily: "monospace", fontSize: 12, outline: "none", resize: "vertical" }}
          placeholder={"urn:air:sdxl:controlnet:huggingface:h94/IP-Adapter@sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors\nurn:air:sdxl:other:huggingface:h94/IP-Adapter@models/image_encoder/model.safetensors"}
          value={airToCheck}
          onChange={(e) => setAirToCheck(e.target.value)}
        />
        <div style={{ marginTop: 6 }}>
          <button style={btn} onClick={checkAir} disabled={airBusy}>{airBusy ? "Проверка…" : "Проверить все"}</button>
          <span style={{ color: "#6f7496", fontSize: 11, marginLeft: 8 }}>ищем строки с canGenerate: true</span>
        </div>
        {airChecks.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, fontFamily: "monospace" }}>
            {airChecks.map((r) => (
              <div key={r.air} style={{ padding: "3px 0", borderTop: "1px solid #1b1b1b", wordBreak: "break-all" }}>
                <span style={{ color: r.ok && r.canGenerate ? "#4ade80" : r.ok ? "#e0a83b" : "#e36466" }}>
                  {r.ok && r.canGenerate ? "✓ canGenerate" : r.ok ? "△ ok, canGenerate:false" : "✗ HTTP " + r.httpStatus}
                </span>
                {r.note ? <span style={{ color: "#6f7496" }}> · {r.note}</span> : null}
                <br /><span style={{ color: "#9aa0b5" }}>{r.air}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Инспектор object_info: какие файлы моделей уже есть в образе Civitai. */}
      <div style={{ margin: "0 0 10px", padding: 10, background: "#101010", border: "1px solid #262626", borderRadius: 8 }}>
        <div style={{ color: "#cfcfcf", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Инспектор object_info (доступные модели в образе) — вставь objectInfo URL из «Пробы G1»</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ flex: 1, minWidth: 320, background: "#0b0b0b", border: "1px solid #313131", borderRadius: 6, padding: "7px 10px", color: "#fff", fontFamily: "monospace", fontSize: 11, outline: "none" }}
            placeholder="https://orchestration-new.civitai.com/v2/consumer/blobs/..._object_info.v2.json?sig=..."
            value={objUrl}
            onChange={(e) => setObjUrl(e.target.value)}
          />
          <button style={btn} onClick={inspectObjInfo} disabled={objBusy}>{objBusy ? "…" : "Показать модели"}</button>
        </div>
        {objInfo && (() => {
          const nodes = (objInfo.body as any)?.nodes as Record<string, Record<string, string[]>> | undefined;
          if (!objInfo.ok || !nodes) return <pre style={{ ...codeBox, minHeight: 60, marginTop: 6, whiteSpace: "pre-wrap" }}>{JSON.stringify(objInfo.body, null, 2).slice(0, 800)}</pre>;
          return (
            <div style={{ marginTop: 8, fontSize: 11, fontFamily: "monospace" }}>
              {Object.entries(nodes).map(([cls, fields]) => (
                <div key={cls} style={{ padding: "4px 0", borderTop: "1px solid #1b1b1b" }}>
                  <div style={{ color: "#4ade80", fontWeight: 700 }}>{cls}</div>
                  {Object.entries(fields).map(([f, opts]) => (
                    <div key={f} style={{ color: "#cfcfcf", wordBreak: "break-all" }}>{f}: <span style={{ color: opts.length ? "#e0e0e0" : "#e36466" }}>{opts.length ? opts.join(", ") : "(пусто — нет файлов)"}</span></div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}
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
            {(() => {
              const status = (resp.body as any)?.status;
              return status ? <span style={{ color: "#cfcfcf", marginLeft: 8 }}>· workflow: {status}</span> : null;
            })()}
          </div>
          {(polling || workflowId) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              {polling && <span style={{ color: "#6f7496", fontSize: 12 }}>опрос статуса каждые 3с…</span>}
              {workflowId && (
                <button style={btn} onClick={() => void pollOnce(workflowId)}>Обновить статус</button>
              )}
              {polling && <button style={btn} onClick={stopPoll}>Стоп</button>}
            </div>
          )}

          {/* Анализ: какие поля движок реально принял (эхо input в ответе). */}
          {(() => {
            const step0 = (resp.body as any)?.steps?.[0];
            const echo = step0?.input;
            if (!echo || typeof echo !== "object") return null;
            // Снапшот node-паков: показываем layerAir для копирования в G2 / настройку.
            if (step0?.$type === "comfyNodepackSnapshot") {
              const results = (step0?.output?.results || []) as Array<{ nodepack?: string; layerAir?: string }>;
              return (
                <div style={{ marginBottom: 8, padding: 10, background: "#101010", border: "1px solid #262626", borderRadius: 8 }}>
                  <div style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>snapshot принят ✓ {results.length ? "· готово" : "· дождитесь succeeded и «Обновить статус»"}</div>
                  {results.map((r) => (
                    <div key={r.nodepack} style={{ fontSize: 11, color: "#cfcfcf", marginTop: 4, wordBreak: "break-all" }}>
                      <span style={{ color: "#6f7496" }}>{r.nodepack}</span><br />→ layerAir: <b style={{ color: "#4ade80" }}>{r.layerAir}</b>
                    </div>
                  ))}
                  <div style={{ color: "#6f7496", fontSize: 11, marginTop: 6 }}>Скопируйте layerAir в «Пробу G2» (resources) и/или в настройку IPADAPTER_NODEPACK_LAYERS.</div>
                </div>
              );
            }
            // comfy/customComfy-шаг: анализ полей imageGen неприменим — граф принят, если статус не failed.
            const graph = (echo.comfyWorkflow || echo.workflow) as Record<string, { class_type?: string }> | undefined;
            if (step0?.$type === "comfy" || step0?.$type === "customComfy" || graph) {
              const nodes = graph ? Object.values(graph).map((n) => n.class_type).filter(Boolean) : [];
              const resources = Array.isArray(echo.resources) ? (echo.resources as string[]) : [];
              return (
                <div style={{ marginBottom: 8, padding: 10, background: "#101010", border: "1px solid #262626", borderRadius: 8 }}>
                  <div style={{ color: "#4ade80", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{step0?.$type}-граф принят Civitai ✓</div>
                  {nodes.length > 0 && <div style={{ color: "#cfcfcf", fontSize: 11 }}>ноды: {nodes.join(", ")}</div>}
                  {resources.length > 0 && <div style={{ color: "#cfcfcf", fontSize: 11, marginTop: 2 }}>resources: {resources.join(", ")}</div>}
                  <div style={{ color: "#6f7496", fontSize: 11, marginTop: 4 }}>Дождитесь workflow: succeeded — картинка в output.images/blobs. При failed смотрите trace-логи (какая нода/модель не нашлась).</div>
                </div>
              );
            }
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
