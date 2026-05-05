"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type Character } from "../../../lib/api";
import { adminStyles } from "../admin-styles";

const charStyles: Record<string, React.CSSProperties> = {
  charItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "16px 0",
    borderBottom: "1px solid #313131",
  },
  charInfo: { flex: 1 },
  charName: { color: "#fff", fontSize: 14, fontWeight: "bold" as const, marginBottom: 6 },
  charTags: { display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 },
  tag: {
    background: "rgba(249,91,173,0.2)",
    color: "#f95bad",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
  },
  charPrompt: { color: "#848484", fontSize: 12, lineHeight: 1.4 },
  charActions: { display: "flex", gap: 8, marginLeft: 16 },
};

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
    <div style={adminStyles.page}>
      <div style={adminStyles.container}>
        <div style={adminStyles.tabs}>
          <a href="/admin" style={adminStyles.tab}>Настройки</a>
          <a href="/admin/characters" style={{ ...adminStyles.tab, ...adminStyles.tabActive }}>Персонажи</a>
          <a href="/admin/users" style={adminStyles.tab}>Пользователи</a>
          <a href="/admin/character-options" style={adminStyles.tab}>Опции персонажа</a>
          <a href="/admin/appearance-options" style={adminStyles.tab}>Appearance</a>
          <a href="/admin/pose-options" style={adminStyles.tab}>Pose</a>
        </div>

        {editing ? (
          <div style={adminStyles.card}>
            <h2 style={adminStyles.title}>{editing.id ? "Редактирование персонажа" : "Новый персонаж"}</h2>
            {error && <div style={adminStyles.error}>{error}</div>}

            <div style={adminStyles.field}>
              <label style={adminStyles.label}>Имя</label>
              <input
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                style={adminStyles.input}
                placeholder="Имя персонажа"
              />
            </div>

            <div style={adminStyles.field}>
              <label style={adminStyles.label}>Системный промпт</label>
              <textarea
                value={editing.systemPrompt || ""}
                onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                style={{ ...adminStyles.input, height: 150, resize: "vertical" as const }}
                placeholder="Ты..."
              />
            </div>

            <div style={adminStyles.field}>
              <label style={adminStyles.label}>Теги (через запятую)</label>
              <input
                value={(editing.tags || []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })
                }
                style={adminStyles.input}
                placeholder="романтичный, заботливый"
              />
            </div>

            <div style={adminStyles.row}>
              <div style={{ flex: 1 }}>
                <label style={adminStyles.label}>URL аватара</label>
                <input
                  value={editing.avatarUrl || ""}
                  onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                  style={adminStyles.input}
                  placeholder="https://..."
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={adminStyles.label}>ID голоса</label>
                <input
                  value={editing.voiceId || ""}
                  onChange={(e) => setEditing({ ...editing, voiceId: e.target.value })}
                  style={adminStyles.input}
                  placeholder="nova"
                />
              </div>
            </div>

            <div style={adminStyles.field}>
              <label style={adminStyles.label}>
                <input
                  type="checkbox"
                  checked={editing.isPublic !== false}
                  onChange={(e) => setEditing({ ...editing, isPublic: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Публичный (виден всем пользователям)
              </label>
            </div>

            <div style={adminStyles.btnRow}>
              <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
              <button onClick={() => setEditing(null)} style={adminStyles.btnSecondary}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div style={adminStyles.card}>
            <div style={adminStyles.headerRow}>
              <h2 style={adminStyles.title}>Персонажи</h2>
              <button
                onClick={() => setEditing({ name: "", systemPrompt: "", tags: [], isPublic: true })}
                style={adminStyles.button}
              >
                + Новый персонаж
              </button>
            </div>

            {error && <div style={adminStyles.error}>{error}</div>}

            {chars.length === 0 ? (
              <p style={{ color: "#848484" }}>Персонажей пока нет. Создайте первого.</p>
            ) : (
              <div>
                {chars.map((c) => (
                  <div key={c.id} style={charStyles.charItem}>
                    <div style={charStyles.charInfo}>
                      <div style={charStyles.charName}>{c.name}</div>
                      <div style={charStyles.charTags}>
                        {c.tags.map((t) => (
                          <span key={t} style={charStyles.tag}>{t}</span>
                        ))}
                      </div>
                      <div style={charStyles.charPrompt}>
                        {c.systemPrompt.slice(0, 120)}
                        {c.systemPrompt.length > 120 ? "..." : ""}
                      </div>
                    </div>
                    <div style={charStyles.charActions}>
                      <button onClick={() => setEditing(c)} style={adminStyles.btnSmall}>
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ ...adminStyles.btnSmall, color: "#e36466" }}
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
