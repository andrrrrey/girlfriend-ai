"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/auth";
import { admin, type AppSetting } from "../../lib/api";

const SETTING_KEYS = [
  { key: "OPENAI_API_KEY", label: "Ключ API OpenAI", type: "password" },
  { key: "OPENAI_MODEL", label: "Модель", type: "select", options: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { key: "OPENAI_TTS_MODEL", label: "Модель TTS", type: "text" },
  { key: "OPENAI_STT_MODEL", label: "Модель STT", type: "text" },
  { key: "OPENAI_TTS_VOICE", label: "Голос TTS", type: "select", options: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] },
];

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

  if (loading) return <div style={styles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <a href="/" style={styles.link}>На главную</a>
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
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.nav}>
          <a href="/" style={styles.link}>Главная</a>
          <span style={styles.navSep}>/</span>
          <span style={{ color: "#fff" }}>Админ</span>
        </div>

        <div style={styles.tabs}>
          <a href="/admin" style={{ ...styles.tab, ...styles.tabActive }}>Настройки</a>
          <a href="/admin/characters" style={styles.tab}>Персонажи</a>
        </div>

        <div style={styles.card}>
          <h1 style={styles.title}>Настройки AI</h1>
          <p style={styles.subtitle}>Параметры интеграции с OpenAI</p>

          {error && <div style={styles.error}>{error}</div>}
          {saved && <div style={styles.success}>Настройки сохранены!</div>}

          {SETTING_KEYS.map(({ key, label, type, options }) => (
            <div key={key} style={styles.field}>
              <label style={styles.label}>{label}</label>
              {type === "select" ? (
                <select
                  value={settings[key] || ""}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                  style={styles.input}
                >
                  {options!.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={type}
                  value={settings[key] || ""}
                  onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                  style={styles.input}
                  placeholder={key}
                />
              )}
            </div>
          ))}

          <button onClick={handleSave} disabled={saving} style={styles.button}>
            {saving ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0512",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: 20,
  },
  container: { maxWidth: 700, margin: "0 auto" },
  nav: { marginBottom: 20, display: "flex", alignItems: "center", gap: 8 },
  navSep: { color: "#555" },
  link: { color: "#6c5ce7", textDecoration: "none", fontSize: 14 },
  tabs: { display: "flex", gap: 0, marginBottom: 20 },
  tab: {
    padding: "10px 24px",
    color: "#aaa",
    textDecoration: "none",
    fontSize: 14,
    borderBottom: "2px solid transparent",
  },
  tabActive: { color: "#fff", borderBottom: "2px solid #6c5ce7" },
  card: {
    background: "#120a1d",
    border: "1px solid #3d2b55",
    borderRadius: 16,
    padding: "30px 30px",
  },
  title: { color: "#fff", fontSize: 22, margin: "0 0 5px" },
  subtitle: { color: "#888", fontSize: 13, margin: "0 0 25px" },
  field: { marginBottom: 18 },
  label: { display: "block", color: "#a0a0a0", fontSize: 12, marginBottom: 6 },
  input: {
    width: "100%",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid #3d2b55",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  button: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "12px 28px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: "bold" as const,
    cursor: "pointer",
    marginTop: 10,
  },
  error: {
    background: "rgba(255,118,117,0.15)",
    border: "1px solid #ff7675",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ff7675",
    fontSize: 13,
    marginBottom: 15,
  },
  success: {
    background: "rgba(0,206,201,0.15)",
    border: "1px solid #00cec9",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#00cec9",
    fontSize: 13,
    marginBottom: 15,
  },
};
