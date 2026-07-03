"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type Voice } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const s: Record<string, React.CSSProperties> = {
  list: { display: "flex", flexDirection: "column", gap: 0, marginTop: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #1e1e1e",
  },
  name: { flex: 1, color: "#fff", fontSize: 14, fontWeight: 600 },
  vid: { flex: 1, color: "#848484", fontSize: 12, fontFamily: "monospace" },
  order: { color: "#848484", fontSize: 12, width: 60 },
  smallBtn: {
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid #313131",
    background: "transparent",
    color: "#ccc",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  deleteBtn: {
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid #e36466",
    background: "transparent",
    color: "#e36466",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  formBox: {
    background: "#1a1a1a",
    borderRadius: 10,
    padding: 20,
    marginTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  formRow: { display: "flex", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    background: "#0f0f0f",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "8px 12px",
    color: "#fff",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  },
  orderInput: {
    width: 80,
    background: "#0f0f0f",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "8px 12px",
    color: "#fff",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  },
  checkRow: { display: "flex", alignItems: "center", gap: 8, color: "#ccc", fontSize: 13 },
  saveBtn: {
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #313131",
    background: "transparent",
    color: "#ccc",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};

interface FormState {
  name: string;
  voiceId: string;
  order: string;
  isActive: boolean;
}

const emptyForm: FormState = { name: "", voiceId: "", order: "0", isActive: true };

const badgeStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid ${active ? "#4caf7d" : "#555"}`,
  color: active ? "#4caf7d" : "#888",
});

export default function AdminVoicesPage() {
  const { user, loading } = useAuth();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Voice | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadVoices = () => {
    admin.getVoices().then(setVoices).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") loadVoices();
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  };

  const openEdit = (v: Voice) => {
    setEditing(v);
    setForm({ name: v.name, voiceId: v.voiceId, order: String(v.order), isActive: v.isActive });
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.voiceId.trim()) {
      setError("Заполните имя и ElevenLabs voice id");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      voiceId: form.voiceId.trim(),
      order: Number(form.order) || 0,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await admin.updateVoice(editing.id, payload);
      } else {
        await admin.createVoice(payload);
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditing(null);
      loadVoices();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: Voice) => {
    if (!confirm(`Удалить голос «${v.name}»?`)) return;
    try {
      await admin.deleteVoice(v.id);
      loadVoices();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.container}>
        <AdminTabs active="voices" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <div style={adminStyles.headerRow}>
            <div>
              <h2 style={adminStyles.title}>Голоса ElevenLabs</h2>
              <p style={adminStyles.subtitle}>
                Голоса, доступные при создании персонажа (Шаг 2 «Voice») и используемые для озвучки в чате.
                Имя — то, что видит пользователь; Voice ID — идентификатор голоса из ElevenLabs.
              </p>
            </div>
            {!showForm && (
              <button onClick={openCreate} style={s.saveBtn}>+ Добавить голос</button>
            )}
          </div>

          <div style={s.list}>
            {voices.map((v) => (
              <div key={v.id} style={s.row}>
                <span style={s.name}>{v.name}</span>
                <span style={s.vid}>{v.voiceId}</span>
                <span style={s.order}>#{v.order}</span>
                <span style={badgeStyle(v.isActive)}>{v.isActive ? "активен" : "скрыт"}</span>
                <button onClick={() => openEdit(v)} style={s.smallBtn}>Изменить</button>
                <button onClick={() => handleDelete(v)} style={s.deleteBtn}>Удалить</button>
              </div>
            ))}
            {voices.length === 0 && (
              <p style={{ color: "#666", fontSize: 13, padding: "12px 0" }}>Голосов пока нет.</p>
            )}
          </div>

          {showForm && (
            <div style={s.formBox}>
              <div style={s.formRow}>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Имя (напр. София)"
                  style={s.input}
                />
                <input
                  value={form.voiceId}
                  onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                  placeholder="ElevenLabs voice id (напр. 21m00Tcm4TlvDq8ikWAM)"
                  style={s.input}
                />
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: e.target.value })}
                  placeholder="Порядок"
                  style={s.orderInput}
                />
              </div>
              <label style={s.checkRow}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Активен (показывать при создании персонажа)
              </label>
              <div style={s.formRow}>
                <button onClick={handleSave} disabled={saving} style={s.saveBtn}>
                  {saving ? "Сохранение..." : editing ? "Сохранить" : "Добавить"}
                </button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} style={s.cancelBtn}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
