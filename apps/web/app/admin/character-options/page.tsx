"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin, streamUrlForKey, type CharacterOption } from "../../../lib/api";
import { clearOptionCache } from "../../../lib/options-cache";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";
import { GenerationSettingsTabs } from "../GenerationSettingsTabs";

const CATEGORIES = [
  { key: "STYLE", label: "Style (Graphic Style)" },
  { key: "HUMAN_RACE", label: "Human Race" },
  { key: "FANTASY_RACE", label: "Fantasy Race" },
  { key: "HAIR_STYLE", label: "Hair Style" },
  { key: "BODY_TYPE", label: "Body Type" },
  { key: "BREAST_SIZE", label: "Breast Size" },
  { key: "BUTT_SIZE", label: "Butt Size" },
];

const s: Record<string, React.CSSProperties> = {
  catTabs: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24 },
  catTab: {
    padding: "6px 16px",
    borderRadius: 6,
    border: "1px solid #313131",
    background: "transparent",
    color: "#848484",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  catTabActive: {
    background: "#f95bad",
    border: "1px solid #f95bad",
    color: "#fff",
  },
  optionList: { display: "flex", flexDirection: "column" as const, gap: 0 },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #1e1e1e",
  },
  optionImg: { width: 48, height: 48, borderRadius: 6, objectFit: "cover" as const, background: "#1e1e1e", flexShrink: 0 },
  optionImgPlaceholder: { width: 48, height: 48, borderRadius: 6, background: "#1e1e1e", flexShrink: 0 },
  optionName: { flex: 1, color: "#fff", fontSize: 14 },
  optionOrder: { color: "#848484", fontSize: 12 },
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
    flexDirection: "column" as const,
    gap: 12,
  },
  formRow: { display: "flex", gap: 10 },
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

const GENERATION_STYLES = [
  { value: "", label: "— не выбран —" },
  { value: "realism", label: "Realism" },
  { value: "mistoon", label: "Mistoon (Anime/Cartoon)" },
  { value: "wai-ill", label: "WAI-Illustrious (NSFW)" },
  { value: "furry", label: "Furry" },
];

interface FormState {
  name: string;
  prompt: string;
  imageThumbKey: string;
  imageFullKey: string;
  previewUrl: string;
  generationStyle: string;
  nsfw: boolean;
}

const emptyForm: FormState = { name: "", prompt: "", imageThumbKey: "", imageFullKey: "", previewUrl: "", generationStyle: "", nsfw: true };

export default function AdminCharacterOptionsPage() {
  const { user, loading } = useAuth();
  const [activeCategory, setActiveCategory] = useState("STYLE");
  const [options, setOptions] = useState<CharacterOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CharacterOption | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = () => {
    admin.getCharacterOptions(activeCategory).then(setOptions).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") loadOptions();
  }, [loading, user, activeCategory]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Access denied</h1>
        </div>
      </div>
    );
  }

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  };

  const openEdit = (opt: CharacterOption) => {
    setEditing(opt);
    setForm({
      name: opt.name,
      prompt: opt.prompt ?? "",
      imageThumbKey: opt.imageThumbKey ?? "",
      imageFullKey: opt.imageFullKey ?? "",
      previewUrl: streamUrlForKey(opt.imageThumbKey) ?? opt.imageUrl ?? "",
      generationStyle: opt.generationStyle ?? "",
      nsfw: opt.nsfw ?? true,
    });
    setShowForm(true);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const data = {
        category: activeCategory,
        name: form.name.trim(),
        prompt: form.prompt.trim() || undefined,
        imageThumbKey: form.imageThumbKey || undefined,
        imageFullKey: form.imageFullKey || undefined,
        generationStyle: activeCategory === "STYLE" ? (form.generationStyle || undefined) : undefined,
        nsfw: form.nsfw,
      };
      if (editing) {
        await admin.updateCharacterOption(editing.id, data);
      } else {
        await admin.createCharacterOption(data);
      }
      setShowForm(false);
      setEditing(null);
      clearOptionCache();
      loadOptions();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this option?")) return;
    try {
      await admin.deleteCharacterOption(id);
      clearOptionCache();
      loadOptions();
    } catch {
      alert("Failed to delete");
    }
  };

  const catLabel = CATEGORIES.find((c) => c.key === activeCategory)?.label ?? activeCategory;

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="gen-settings" />
      <div style={adminStyles.card}>
        <GenerationSettingsTabs active="character" />
        <h1 style={{ ...adminStyles.title, marginBottom: 20 }}>Character Options</h1>

        {/* Category tabs */}
        <div style={s.catTabs}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              style={{ ...s.catTab, ...(activeCategory === cat.key ? s.catTabActive : {}) }}
              onClick={() => { setActiveCategory(cat.key); setShowForm(false); setEditing(null); }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ color: "#848484", fontSize: 13, margin: 0 }}>
            {options.length} option{options.length !== 1 ? "s" : ""} in <strong style={{ color: "#fff" }}>{catLabel}</strong>
          </p>
          <button style={s.saveBtn} onClick={openAdd}>+ Add New</button>
        </div>

        {/* Add / Edit form */}
        {showForm && (
          <div style={s.formBox}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0 }}>
              {editing ? "Edit option" : `Add new option to ${catLabel}`}
            </p>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder="Name (e.g. Realistic)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <textarea
              style={{ ...s.input, minHeight: 60, resize: "vertical" as const }}
              placeholder="Prompt (e.g. european caucasian ethnicity...)"
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.nsfw}
                onChange={(e) => setForm({ ...form, nsfw: e.target.checked })}
              />
              NSFW (скрывать в SFW-режиме)
            </label>
            {activeCategory === "STYLE" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#848484", fontSize: 13, whiteSpace: "nowrap" }}>Стиль генерации:</span>
                <select
                  style={{ ...s.input, flex: "unset", minWidth: 200 }}
                  value={form.generationStyle}
                  onChange={(e) => setForm({ ...form, generationStyle: e.target.value })}
                >
                  {GENERATION_STYLES.map((gs) => (
                    <option key={gs.value} value={gs.value}>{gs.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="file"
                accept="image/*"
                id="char-opt-img"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const localPreview = URL.createObjectURL(file);
                  setForm((f) => ({ ...f, previewUrl: localPreview }));
                  try {
                    const { thumbKey, fullKey } = await admin.uploadOptionImage(file);
                    setForm((f) => ({ ...f, imageThumbKey: thumbKey, imageFullKey: fullKey }));
                  } catch {
                    setError("Image upload failed");
                    setForm((f) => ({ ...f, previewUrl: "" }));
                  }
                }}
              />
              <label htmlFor="char-opt-img" style={{ ...s.cancelBtn, cursor: "pointer" }}>
                {form.previewUrl ? "Change image" : "Upload image"}
              </label>
              {form.previewUrl && (
                <img src={form.previewUrl} alt="preview" style={{ height: 60, borderRadius: 6, objectFit: "cover" }} />
              )}
              {form.previewUrl && (
                <button style={{ ...s.deleteBtn, padding: "4px 10px" }} onClick={() => setForm((f) => ({ ...f, imageThumbKey: "", imageFullKey: "", previewUrl: "" }))}>✕</button>
              )}
            </div>
            {error && <p style={{ color: "#e36466", fontSize: 12, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={s.saveBtn} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
              <button style={s.cancelBtn} onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Options list */}
        <div style={s.optionList}>
          {options.length === 0 && (
            <p style={{ color: "#848484", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No options yet. Click "+ Add New" to add the first one.
            </p>
          )}
          {options.map((opt) => {
            const imgSrc = streamUrlForKey(opt.imageThumbKey) ?? opt.imageUrl;
            return (
            <div key={opt.id} style={s.optionRow}>
              {imgSrc
                ? <img src={imgSrc} alt={opt.name} style={s.optionImg} loading="lazy" decoding="async" />
                : <div style={s.optionImgPlaceholder} />
              }
              <span style={s.optionName}>{opt.name}</span>
              {activeCategory === "STYLE" && opt.generationStyle && (
                <span style={{ background: "#2a2a2a", color: "#f95bad", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
                  {opt.generationStyle}
                </span>
              )}
              <span style={s.optionOrder}>order: {opt.order}</span>
              <button style={s.smallBtn} onClick={() => openEdit(opt)}>Edit</button>
              <button style={s.deleteBtn} onClick={() => handleDelete(opt.id)}>Delete</button>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
