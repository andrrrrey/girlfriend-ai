"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type Character } from "../../../lib/api";

export default function AdminCharactersPage() {
  const { user, loading } = useAuth();
  const [chars, setChars] = useState<Character[]>([]);
  const [editing, setEditing] = useState<Partial<Character> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadChars = () => {
    admin.getCharacters().then(setChars).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") loadChars();
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
    if (!editing?.name || !editing?.systemPrompt) return;
    setSaving(true);
    setError("");
    try {
      if (editing.id) {
        await admin.updateCharacter(editing.id, editing);
      } else {
        await admin.createCharacter(editing);
      }
      setEditing(null);
      loadChars();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить этого персонажа?")) return;
    try {
      await admin.deleteCharacter(id);
      loadChars();
    } catch (err: any) {
      setError(err.message);
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
          <a href="/admin" style={styles.tab}>Настройки</a>
          <a href="/admin/characters" style={{ ...styles.tab, ...styles.tabActive }}>Персонажи</a>
        </div>

        {editing ? (
          <div style={styles.card}>
            <h2 style={styles.title}>{editing.id ? "Редактирование персонажа" : "Новый персонаж"}</h2>
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Имя</label>
              <input
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                style={styles.input}
                placeholder="Имя персонажа"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Системный промпт</label>
              <textarea
                value={editing.systemPrompt || ""}
                onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                style={{ ...styles.input, height: 150, resize: "vertical" as const }}
                placeholder="Ты..."
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Теги (через запятую)</label>
              <input
                value={(editing.tags || []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })
                }
                style={styles.input}
                placeholder="романтичный, заботливый"
              />
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>URL аватара</label>
                <input
                  value={editing.avatarUrl || ""}
                  onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                  style={styles.input}
                  placeholder="https://..."
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>ID голоса</label>
                <input
                  value={editing.voiceId || ""}
                  onChange={(e) => setEditing({ ...editing, voiceId: e.target.value })}
                  style={styles.input}
                  placeholder="nova"
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={editing.isPublic !== false}
                  onChange={(e) => setEditing({ ...editing, isPublic: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Публичный (виден всем пользователям)
              </label>
            </div>

            <div style={styles.btnRow}>
              <button onClick={handleSave} disabled={saving} style={styles.button}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button onClick={() => setEditing(null)} style={styles.btnSecondary}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.headerRow}>
              <h2 style={styles.title}>Персонажи</h2>
              <button
                onClick={() => setEditing({ name: "", systemPrompt: "", tags: [], isPublic: true })}
                style={styles.button}
              >
                + Новый персонаж
              </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            {chars.length === 0 ? (
              <p style={{ color: "#888" }}>Персонажей пока нет. Создайте первого.</p>
            ) : (
              <div>
                {chars.map((c) => (
                  <div key={c.id} style={styles.charItem}>
                    <div style={styles.charInfo}>
                      <div style={styles.charName}>{c.name}</div>
                      <div style={styles.charTags}>
                        {c.tags.map((t) => (
                          <span key={t} style={styles.tag}>{t}</span>
                        ))}
                      </div>
                      <div style={styles.charPrompt}>
                        {c.systemPrompt.slice(0, 120)}
                        {c.systemPrompt.length > 120 ? "..." : ""}
                      </div>
                    </div>
                    <div style={styles.charActions}>
                      <button onClick={() => setEditing(c)} style={styles.btnSmall}>
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ ...styles.btnSmall, color: "#ff7675" }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
  container: { maxWidth: 800, margin: "0 auto" },
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
  title: { color: "#fff", fontSize: 22, margin: "0 0 15px" },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  field: { marginBottom: 18 },
  row: { display: "flex", gap: 16, marginBottom: 18 },
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
    padding: "10px 20px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: "bold" as const,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "10px 20px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  btnRow: { display: "flex", gap: 12, marginTop: 10 },
  btnSmall: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  charItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "16px 0",
    borderBottom: "1px solid #1e1430",
  },
  charInfo: { flex: 1 },
  charName: { color: "#fff", fontSize: 16, fontWeight: "bold" as const, marginBottom: 6 },
  charTags: { display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 },
  tag: {
    background: "rgba(108,92,231,0.2)",
    color: "#a29bfe",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
  },
  charPrompt: { color: "#888", fontSize: 12, lineHeight: 1.4 },
  charActions: { display: "flex", gap: 8, marginLeft: 16 },
  error: {
    background: "rgba(255,118,117,0.15)",
    border: "1px solid #ff7675",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ff7675",
    fontSize: 13,
    marginBottom: 15,
  },
};
