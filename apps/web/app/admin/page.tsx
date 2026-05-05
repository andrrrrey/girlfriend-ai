"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/auth";
import { admin, type AppSetting } from "../../lib/api";
import { adminStyles } from "./admin-styles";

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
      { key: "ELEVENLABS_MODEL_ID", label: "Модель ElevenLabs", type: "select", options: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_turbo_v2", "eleven_monolingual_v1"] },
    ],
  },
  {
    title: "ModelsLab",
    subtitle: "Параметры генерации изображений, видео и чата (ModelsLab)",
    keys: [
      { key: "MODELSLAB_API_KEY", label: "Ключ API ModelsLab", type: "password" },
      { key: "MODELSLAB_CHAT_MODEL", label: "Модель чата (Uncensored Chat)", type: "select", options: ["llama-3-8b-instruct", "mistral-7b-instruct", "mixtral-8x7b-instruct", "llama-2-70b-chat"] },
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
];

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
          <a href="/" style={adminStyles.link}>На главную</a>
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
        <div style={adminStyles.tabs}>
          <a href="/admin" style={{ ...adminStyles.tab, ...adminStyles.tabActive }}>Настройки</a>
          <a href="/admin/characters" style={adminStyles.tab}>Персонажи</a>
          <a href="/admin/users" style={adminStyles.tab}>Пользователи</a>
          <a href="/admin/character-options" style={adminStyles.tab}>Опции персонажа</a>
          <a href="/admin/appearance-options" style={adminStyles.tab}>Appearance</a>
          <a href="/admin/pose-options" style={adminStyles.tab}>Pose</a>
          <a href="/admin/scene-options" style={adminStyles.tab}>Scene</a>
          <a href="/admin/camera-options" style={adminStyles.tab}>Camera</a>
        </div>

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

        <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
          {saving ? "Сохранение..." : "Сохранить настройки"}
        </button>
      </div>
    </div>
  );
}
