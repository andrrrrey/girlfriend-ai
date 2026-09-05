"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../context/auth";
import { admin, type AppSetting } from "../../lib/api";
import { adminStyles } from "./admin-styles";
import { AdminTabs } from "./AdminTabs";
import { CivitaiModelsEditor } from "./CivitaiModelsEditor";
import { CivitaiLab } from "./CivitaiLab";

const SETTING_GROUPS = [
  {
    title: "OpenAI",
    subtitle: "Параметры интеграции с OpenAI",
    keys: [
      { key: "OPENAI_API_KEY", label: "Ключ API OpenAI", type: "password" },
      { key: "OPENAI_MODEL", label: "Модель чата", type: "select", options: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
      { key: "OPENAI_STT_MODEL", label: "Модель STT (Whisper)", type: "text" },
    ],
  },
  {
    title: "ElevenLabs",
    subtitle: "Параметры генерации голоса (TTS)",
    keys: [
      { key: "ELEVENLABS_API_KEY", label: "Ключ API ElevenLabs", type: "password" },
      { key: "ELEVENLABS_DEFAULT_VOICE_ID", label: "ID голоса по умолчанию", type: "text" },
      { key: "ELEVENLABS_MODEL_ID", label: "Модель ElevenLabs", type: "select", options: ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_turbo_v2", "eleven_monolingual_v1"] },
    ],
  },
  {
    title: "ModelsLab",
    subtitle: "Параметры генерации изображений, видео и чата (ModelsLab)",
    keys: [
      { key: "MODELSLAB_API_KEY", label: "Ключ API ModelsLab", type: "password" },
      { key: "MODELSLAB_CHAT_MODEL", label: "Модель чата (Uncensored Chat)", type: "select", options: ["llama-3-8b-instruct", "llama-3-70b-instruct", "mistral-7b-instruct", "mixtral-8x7b-instruct", "llama-2-70b-chat"] },
      { key: "MODELSLAB_DEFAULT_MODEL", label: "Модель изображений", type: "select", options: ["realistic-vision-v51", "sdxl", "juggernaut-xl", "flux"] },
      { key: "MODELSLAB_DEFAULT_VIDEO_MODEL", label: "Модель видео", type: "select", options: ["wan2.1", "wan2.2", "cogvideox", "hunyuan-video", "animatediff", "ltx-video"] },
    ],
  },
  {
    title: "Atlas Cloud",
    subtitle: "Параметры генерации NSFW видео (Atlas Cloud)",
    keys: [
      { key: "ATLASCLOUD_API_KEY", label: "Ключ API Atlas Cloud", type: "password" },
    ],
  },
  {
    title: "Civitai RED",
    subtitle: "Генерация изображений через Civitai Orchestration API",
    keys: [
      { key: "CIVITAI_API_TOKEN", label: "Civitai API Token", type: "password" },
      { key: "CIVITAI_IMG2IMG_DENOISE", label: "Сила изменения img2img по умолчанию (0.1–1, деф. 0.65). Ниже — ближе к аватару, выше — свободнее поза/сцена. Применяется к чату/генерации, если не задано в запросе.", type: "text" },
    ],
  },
  {
    title: "Comfy / IP-Adapter (identity с аватара)",
    subtitle: "Сохранение лица персонажа через customComfy-workflow: IP-Adapter на IPAdapterUnifiedLoader. Работает, когда COMFY_ENABLED=true и в запросе передан ipAdapterImageUrl (URL аватара). Путь customComfy устанавливает кастомные ноды из resources/nodepacks — БЕЗ этого IPAdapter/LoadImageFromUrl не загружаются (это и была причина, почему раньше не заводилось). Проверять и подбирать граф удобно в Civitai Lab → «Проба G». Требует generation-enabled чекпоинт (кнопка Create на Civitai).",
    keys: [
      { key: "COMFY_ENABLED", label: "Включить comfy-режим", type: "select", options: ["false", "true"] },
      { key: "IPADAPTER_PRESET", label: "IP-Adapter preset", type: "select", options: ["PLUS (high strength)", "STANDARD (medium strength)", "PLUS FACE (portraits)", "LIGHT - SD1.5 only (low strength)", "VIT-G (medium strength)"] },
      { key: "IPADAPTER_WEIGHT", label: "IP-Adapter weight (0..1, по умолчанию 0.7)", type: "text" },
      { key: "IPADAPTER_NODEPACKS", label: "Nodepacks (CSV bare-AIR comfy:nodepack для авто-снапшота). Пусто = дефолт: matteo/comfyui_ipadapter_plus@2.0.0, protogaia/comfyui-art-venture@1.1.7", type: "text" },
      { key: "IPADAPTER_NODEPACK_LAYERS", label: "Layer-AIR (CSV urn:air:comfy:nodepacklayer:… из Civitai Lab «Проба G1»). Задан → используется напрямую без снапшота. Пусто → снапшот делается автоматически.", type: "text" },
      { key: "IPADAPTER_MODEL_AIR", label: "IP-Adapter model AIR (split-loader). Дефолт: urn:air:sdxl:controlnet:civitai:277315@338834 (SDXL PLUS ViT-H).", type: "text" },
      { key: "CLIPVISION_MODEL_AIR", label: "CLIP-Vision model AIR (split-loader). ЗАДАЙ, чтобы IP-Adapter заработал — иначе UnifiedLoader падает 'ClipVision model not found'. Подбери через Civitai Lab «Проба G3».", type: "text" },
    ],
  },
  {
    title: "Flux Kontext (identity с референса, нативно)",
    subtitle: "Сохранение лица персонажа нативным edit-движком Civitai Flux Kontext — БЕЗ ComfyUI/IP-Adapter. Когда KONTEXT_ENABLED=true, запросы img2img (референс = аватар персонажа, приходит как initImageUrl) идут через flux1-kontext: лицо держится референсом независимо от denoise. Важно: это Flux, а не SDXL-чекпоинт персонажа — «лук» будет флуксовый. Имеет приоритет над comfy-режимом. Проверить вживую: Civitai Lab → «Проба K».",
    keys: [
      { key: "KONTEXT_ENABLED", label: "Включить Flux Kontext (приоритетнее comfy)", type: "select", options: ["false", "true"] },
      { key: "KONTEXT_MODEL", label: "Модель Kontext", type: "select", options: ["dev", "pro", "max"] },
      { key: "KONTEXT_GUIDANCE", label: "Guidance scale (деф. 3.5)", type: "text" },
      { key: "KONTEXT_ASPECT", label: "Соотношение сторон по умолчанию (21:9,16:9,4:3,3:2,1:1,2:3,3:4,9:16,9:21; деф. 3:4)", type: "text" },
    ],
  },
  {
    title: "System Prompt",
    subtitle: "Глобальный шаблон системного промпта для всех AI-персонажей",
    keys: [
      { key: "GLOBAL_SYSTEM_PROMPT_TEMPLATE", label: "Глобальный шаблон промпта (добавляется перед промптом каждого персонажа)", type: "textarea" },
      { key: "SFW_SYSTEM_PROMPT_TEMPLATE", label: "Шаблон системного промпта для SFW-режима (если пусто — используется глобальный)", type: "textarea" },
      { key: "DEFAULT_STT_LANGUAGE", label: "Язык STT по умолчанию (en, ru, etc.)", type: "text" },
    ],
  },
  {
    title: "Генерация изображений и видео",
    subtitle: "Глобальные промпт-настройки, применяются ко ВСЕМ генерациям (аватары, чат, страница генерации, видео). Пустое поле отключает блок.",
    keys: [
      { key: "NSFW_PROMPT_TAGS", label: "Глобальные NSFW / quality-теги (добавляются к позитивному промпту). По умолчанию: nsfw, explicit, masterpiece, best quality, highres", type: "textarea" },
      { key: "NEGATIVE_PROMPT", label: "Обязательный негативный промпт — защита от артефактов (лишние пальцы/руки, лишние люди, кривая анатомия и т.п.). Мерджится с пользовательским.", type: "textarea" },
      { key: "SFW_PROMPT_TAGS", label: "SFW-теги (в режиме SFW добавляются вместо NSFW). По умолчанию: sfw, safe for work, wholesome, fully clothed, ...", type: "textarea" },
      { key: "SFW_NEGATIVE_PROMPT", label: "SFW негативный промпт — исключает откровенный контент (в режиме SFW вместо обычного негатива).", type: "textarea" },
    ],
  },
];

const ALL_IMAGE_MODELS = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
  { id: "alibaba/wan-2.6/text-to-image", name: "Wan 2.6 (NSFW)", description: "Uncensored image generation" },
  { id: "civitai", name: "Civitai RED", description: "Civitai Orchestration API" },
];

const ALL_VIDEO_MODELS = [
  { id: "atlascloud/van-2.6/text-to-video", name: "Van 2.6 (NSFW)", description: "Text-to-video, uncensored" },
];

// Мастер-список гендеров (зеркало apps/api/src/common/genders.ts).
// Female — базовый, отключить нельзя.
const ALL_GENDERS = ["Female", "Male", "Non-binary", "Trans Female", "Trans Male", "Femboy"];

// Flat list for backward compat
const SETTING_KEYS = SETTING_GROUPS.flatMap((g) => g.keys);

export default function AdminSettingsPage() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user?.role === "admin") {
      admin.getSettings().then((list) => {
        const map: Record<string, string> = {};
        list.forEach((s) => (map[s.key] = s.value));
        setSettings(map);
      });
    }
  }, [loading, user]);

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

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await admin.upsertSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.container}>
        <AdminTabs active="settings" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}
        {saved && <div style={{ ...adminStyles.card, ...adminStyles.success, marginBottom: 20 }}>Настройки сохранены!</div>}

        {SETTING_GROUPS.map((group) => (
          <div key={group.title} style={{ ...adminStyles.card, marginBottom: 20 }}>
            <h2 style={adminStyles.title}>{group.title}</h2>
            <p style={adminStyles.subtitle}>{group.subtitle}</p>

            {group.keys.map(({ key, label, type, options }) => (
              <div key={key} style={adminStyles.field}>
                <label style={adminStyles.label}>{label}</label>
                {type === "select" ? (
                  <select
                    value={settings[key] || ""}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    style={adminStyles.input}
                  >
                    <option value="">-- выбрать --</option>
                    {options!.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : type === "textarea" ? (
                  <textarea
                    value={settings[key] || ""}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    style={{ ...adminStyles.input, minHeight: 200, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }}
                    placeholder={key}
                  />
                ) : (
                  <input
                    type={type}
                    value={settings[key] || ""}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    style={adminStyles.input}
                    placeholder={key}
                  />
                )}
              </div>
            ))}
          </div>
        ))}

        <CivitaiModelsEditor settings={settings} setSettings={setSettings} />

        <CivitaiLab />

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Generation Models</h2>
          <p style={adminStyles.subtitle}>Выберите нейросети, доступные на странице генерации</p>

          <h3 style={{ color: "#fff", fontSize: 14, margin: "16px 0 8px" }}>Image Models</h3>
          {ALL_IMAGE_MODELS.map((model) => {
            let enabledIds: string[];
            try {
              enabledIds = JSON.parse(settings["ENABLED_IMAGE_MODELS"] || "null") ?? ALL_IMAGE_MODELS.map((m) => m.id);
            } catch {
              enabledIds = ALL_IMAGE_MODELS.map((m) => m.id);
            }
            const checked = enabledIds.includes(model.id);
            return (
              <label key={model.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const newIds = checked
                      ? enabledIds.filter((id) => id !== model.id)
                      : [...enabledIds, model.id];
                    if (newIds.length === 0) return;
                    setSettings({ ...settings, ENABLED_IMAGE_MODELS: JSON.stringify(newIds) });
                  }}
                />
                <span style={{ color: "#fff", fontWeight: 600 }}>{model.name}</span>
                <span style={{ color: "#848484" }}>— {model.description}</span>
              </label>
            );
          })}

          <h3 style={{ color: "#fff", fontSize: 14, margin: "16px 0 8px" }}>Video Models</h3>
          {ALL_VIDEO_MODELS.map((model) => {
            let enabledIds: string[];
            try {
              enabledIds = JSON.parse(settings["ENABLED_VIDEO_MODELS"] || "null") ?? ALL_VIDEO_MODELS.map((m) => m.id);
            } catch {
              enabledIds = ALL_VIDEO_MODELS.map((m) => m.id);
            }
            const checked = enabledIds.includes(model.id);
            return (
              <label key={model.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const newIds = checked
                      ? enabledIds.filter((id) => id !== model.id)
                      : [...enabledIds, model.id];
                    if (newIds.length === 0) return;
                    setSettings({ ...settings, ENABLED_VIDEO_MODELS: JSON.stringify(newIds) });
                  }}
                />
                <span style={{ color: "#fff", fontWeight: 600 }}>{model.name}</span>
                <span style={{ color: "#848484" }}>— {model.description}</span>
              </label>
            );
          })}
        </div>

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Gender / Гендеры</h2>
          <p style={adminStyles.subtitle}>
            Какие гендеры доступны пользователям при создании персонажа, генерации изображений/видео и в авто-генерации. Female отключить нельзя.
          </p>

          {ALL_GENDERS.map((g) => {
            let enabled: string[];
            try {
              enabled = JSON.parse(settings["ENABLED_GENDERS"] || "null") ?? ALL_GENDERS;
            } catch {
              enabled = ALL_GENDERS;
            }
            const isFemale = g === "Female";
            const checked = isFemale || enabled.includes(g);
            return (
              <label key={g} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#ccc", fontSize: 13, cursor: isFemale ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isFemale}
                  onChange={() => {
                    if (isFemale) return;
                    const base = enabled.filter((x) => ALL_GENDERS.includes(x));
                    const newList = checked
                      ? base.filter((x) => x !== g)
                      : [...base, g];
                    // Female всегда присутствует
                    if (!newList.includes("Female")) newList.unshift("Female");
                    setSettings({ ...settings, ENABLED_GENDERS: JSON.stringify(newList) });
                  }}
                />
                <span style={{ color: "#fff", fontWeight: 600 }}>{g}</span>
                {isFemale && <span style={{ color: "#848484" }}>— базовый, всегда включён</span>}
              </label>
            );
          })}
        </div>

        <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </button>
      </div>
    </div>
  );
}
