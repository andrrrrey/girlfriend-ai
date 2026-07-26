"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin, streamUrlForKey, type SceneCategory, type SceneOption } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";
import { GenerationSettingsTabs } from "../GenerationSettingsTabs";

const TABS = [
  { key: "LOCATION", label: "Location" },
];

const s: Record<string, React.CSSProperties> = {
  tabRow: { display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: 24 },
  tab: {
    padding: "6px 16px",
    borderRadius: 6,
    border: "1px solid #313131",
    background: "transparent",
    color: "#848484",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabActive: {
    background: "#f95bad",
    border: "1px solid #f95bad",
    color: "#fff",
  },
  catRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    background: "#151515",
    borderRadius: 8,
    marginBottom: 2,
    cursor: "pointer",
  },
  catRowActive: {
    background: "#1e1e1e",
    borderLeft: "3px solid #f95bad",
  },
  catName: { color: "#fff", fontSize: 14, fontWeight: 600 },
  catOrder: { color: "#848484", fontSize: 12 },
  catActions: { display: "flex", gap: 6 },
  optionList: { padding: "8px 14px 14px", background: "#1a1a1a", borderRadius: "0 0 8px 8px", marginBottom: 8 },
  optionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid #252525",
  },
  optionImg: { width: 44, height: 44, borderRadius: 6, objectFit: "cover" as const, background: "#252525", flexShrink: 0 },
  optionImgPlaceholder: { width: 44, height: 44, borderRadius: 6, background: "#252525", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
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
  formBox: {
    background: "#1a1a1a",
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
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
  errorText: { color: "#e36466", fontSize: 13 },
};

interface CatForm { name: string }
interface OptForm {
  name: string;
  prompt: string;
  imageThumbKey: string;
  imageFullKey: string;
  previewUrl: string;
  nsfw: boolean;
}
const emptyCatForm: CatForm = { name: "" };
const emptyOptForm: OptForm = { name: "", prompt: "", imageThumbKey: "", imageFullKey: "", previewUrl: "", nsfw: true };

export default function AdminSceneOptionsPage() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("LOCATION");
  const [categories, setCategories] = useState<SceneCategory[]>([]);
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [optionsByCat, setOptionsByCat] = useState<Record<string, SceneOption[]>>({});

  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<SceneCategory | null>(null);
  const [catForm, setCatForm] = useState<CatForm>(emptyCatForm);
  const [catError, setCatError] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const [showOptForm, setShowOptForm] = useState<string | null>(null);
  const [editingOpt, setEditingOpt] = useState<SceneOption | null>(null);
  const [optForm, setOptForm] = useState<OptForm>(emptyOptForm);
  const [optError, setOptError] = useState("");
  const [savingOpt, setSavingOpt] = useState(false);

  const loadCategories = () => {
    admin.getSceneCategories(activeTab).then((cats) => {
      setCategories(cats);
      setExpandedCatId(null);
    }).catch(() => {});
  };

  const loadOptions = (categoryId: string) => {
    admin.getSceneOptions(categoryId).then((opts) => {
      setOptionsByCat((prev) => ({ ...prev, [categoryId]: opts }));
    }).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") loadCategories();
  }, [loading, user, activeTab]);

  useEffect(() => {
    if (expandedCatId) loadOptions(expandedCatId);
  }, [expandedCatId]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}><h1 style={adminStyles.title}>Access denied</h1></div>
      </div>
    );
  }

  const openAddCat = () => {
    setEditingCat(null);
    setCatForm(emptyCatForm);
    setShowCatForm(true);
    setCatError("");
  };

  const openEditCat = (cat: SceneCategory, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCat(cat);
    setCatForm({ name: cat.name });
    setShowCatForm(true);
    setCatError("");
  };

  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { setCatError("Name is required"); return; }
    setSavingCat(true);
    setCatError("");
    try {
      const data = { tab: activeTab, name: catForm.name.trim() };
      if (editingCat) {
        await admin.updateSceneCategory(editingCat.id, data);
      } else {
        await admin.createSceneCategory(data);
      }
      setShowCatForm(false);
      setEditingCat(null);
      loadCategories();
    } catch {
      setCatError("Failed to save");
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this category and all its options?")) return;
    try {
      await admin.deleteSceneCategory(id);
      setOptionsByCat((prev) => { const next = { ...prev }; delete next[id]; return next; });
      loadCategories();
    } catch {
      alert("Failed to delete");
    }
  };

  const openAddOpt = (categoryId: string) => {
    setEditingOpt(null);
    setOptForm(emptyOptForm);
    setShowOptForm(categoryId);
    setOptError("");
  };

  const openEditOpt = (opt: SceneOption, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingOpt(opt);
    setOptForm({
      name: opt.name,
      prompt: opt.prompt ?? "",
      imageThumbKey: opt.imageThumbKey ?? "",
      imageFullKey: opt.imageFullKey ?? "",
      previewUrl: streamUrlForKey(opt.imageThumbKey) ?? opt.imageUrl ?? "",
      nsfw: opt.nsfw ?? true,
    });
    setShowOptForm(opt.categoryId);
    setOptError("");
  };

  const handleSaveOpt = async () => {
    if (!optForm.name.trim()) { setOptError("Name is required"); return; }
    if (!showOptForm) return;
    setSavingOpt(true);
    setOptError("");
    try {
      const data = {
        categoryId: showOptForm,
        name: optForm.name.trim(),
        prompt: optForm.prompt.trim() || undefined,
        imageThumbKey: optForm.imageThumbKey || undefined,
        imageFullKey: optForm.imageFullKey || undefined,
        nsfw: optForm.nsfw,
      };
      if (editingOpt) {
        await admin.updateSceneOption(editingOpt.id, data);
      } else {
        await admin.createSceneOption(data);
      }
      setShowOptForm(null);
      setEditingOpt(null);
      loadOptions(showOptForm);
    } catch {
      setOptError("Failed to save");
    } finally {
      setSavingOpt(false);
    }
  };

  const handleDeleteOpt = async (opt: SceneOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this option?")) return;
    try {
      await admin.deleteSceneOption(opt.id);
      loadOptions(opt.categoryId);
    } catch {
      alert("Failed to delete");
    }
  };

  const toggleExpand = (catId: string) => {
    setExpandedCatId((prev) => (prev === catId ? null : catId));
    setShowOptForm(null);
  };

  const currentTabLabel = TABS.find((t) => t.key === activeTab)?.label ?? activeTab;

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="gen-settings" />
      <div style={adminStyles.card}>
        <GenerationSettingsTabs active="scene" />
        <h1 style={{ ...adminStyles.title, marginBottom: 20 }}>Scene Options</h1>

        {/* Tab selector */}
        <div style={s.tabRow}>
          {TABS.map((t) => (
            <button
              key={t.key}
              style={{ ...s.tab, ...(activeTab === t.key ? s.tabActive : {}) }}
              onClick={() => { setActiveTab(t.key); setShowCatForm(false); setEditingCat(null); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <p style={{ color: "#848484", fontSize: 13, margin: 0 }}>
            {categories.length} categor{categories.length !== 1 ? "ies" : "y"} in <strong style={{ color: "#fff" }}>{currentTabLabel}</strong>
          </p>
          <button style={s.saveBtn} onClick={openAddCat}>+ Add Category</button>
        </div>

        {/* Add/Edit Category form */}
        {showCatForm && (
          <div style={s.formBox}>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0 }}>
              {editingCat ? "Edit category" : `Add new category to ${currentTabLabel}`}
            </p>
            <div style={s.formRow}>
              <input
                style={s.input}
                placeholder="Category name (e.g. Residential)"
                value={catForm.name}
                onChange={(e) => setCatForm({ name: e.target.value })}
              />
            </div>
            {catError && <p style={s.errorText}>{catError}</p>}
            <div style={s.formRow}>
              <button style={s.cancelBtn} onClick={() => { setShowCatForm(false); setEditingCat(null); }}>Cancel</button>
              <button style={s.saveBtn} onClick={handleSaveCat} disabled={savingCat}>
                {savingCat ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Categories list */}
        <div style={{ marginTop: 8 }}>
          {categories.length === 0 && (
            <p style={{ color: "#555", fontSize: 13, fontStyle: "italic" }}>No categories yet. Click "+ Add Category" to create one.</p>
          )}
          {categories.map((cat) => {
            const isExpanded = expandedCatId === cat.id;
            const opts = optionsByCat[cat.id] ?? [];
            return (
              <div key={cat.id} style={{ marginBottom: 4 }}>
                <div
                  style={{ ...s.catRow, ...(isExpanded ? s.catRowActive : {}) }}
                  onClick={() => toggleExpand(cat.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: isExpanded ? "#f95bad" : "#666", fontSize: 12 }}>{isExpanded ? "▼" : "▶"}</span>
                    <span style={s.catName}>{cat.name}</span>
                    <span style={s.catOrder}>order: {cat.order}</span>
                  </div>
                  <div style={s.catActions} onClick={(e) => e.stopPropagation()}>
                    <button style={s.smallBtn} onClick={(e) => openEditCat(cat, e)}>Edit</button>
                    <button style={s.deleteBtn} onClick={(e) => handleDeleteCat(cat.id, e)}>Delete</button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={s.optionList}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ color: "#848484", fontSize: 12 }}>{opts.length} option{opts.length !== 1 ? "s" : ""}</span>
                      <button style={s.saveBtn} onClick={() => openAddOpt(cat.id)}>+ Add Option</button>
                    </div>

                    {/* Add/Edit Option form */}
                    {showOptForm === cat.id && (
                      <div style={{ ...s.formBox, background: "#111", marginTop: 0, marginBottom: 12 }}>
                        <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, margin: 0 }}>
                          {editingOpt ? "Edit option" : `Add option to "${cat.name}"`}
                        </p>
                        <div style={s.formRow}>
                          <input
                            style={s.input}
                            placeholder="Name (e.g. Living Room)"
                            value={optForm.name}
                            onChange={(e) => setOptForm({ ...optForm, name: e.target.value })}
                          />
                        </div>
                        <textarea
                          style={{ ...s.input, minHeight: 60, resize: "vertical" as const }}
                          placeholder="Prompt (e.g. cozy bedroom with warm lighting...)"
                          value={optForm.prompt}
                          onChange={(e) => setOptForm({ ...optForm, prompt: e.target.value })}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                          <input type="checkbox" checked={optForm.nsfw} onChange={(e) => setOptForm({ ...optForm, nsfw: e.target.checked })} />
                          NSFW (скрывать в SFW-режиме)
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <input
                            type="file"
                            accept="image/*"
                            id="scene-opt-img"
                            style={{ display: "none" }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const localPreview = URL.createObjectURL(file);
                              setOptForm((f) => ({ ...f, previewUrl: localPreview }));
                              try {
                                const { thumbKey, fullKey } = await admin.uploadOptionImage(file);
                                setOptForm((f) => ({ ...f, imageThumbKey: thumbKey, imageFullKey: fullKey }));
                              } catch {
                                setOptError("Image upload failed");
                                setOptForm((f) => ({ ...f, previewUrl: "" }));
                              }
                            }}
                          />
                          <label htmlFor="scene-opt-img" style={{ ...s.cancelBtn, cursor: "pointer" }}>
                            {optForm.previewUrl ? "Change image" : "Upload image"}
                          </label>
                          {optForm.previewUrl && (
                            <img src={optForm.previewUrl} alt="preview" style={{ height: 60, borderRadius: 6, objectFit: "cover" }} />
                          )}
                          {optForm.previewUrl && (
                            <button style={{ ...s.deleteBtn, padding: "4px 10px" }} onClick={() => setOptForm((f) => ({ ...f, imageThumbKey: "", imageFullKey: "", previewUrl: "" }))}>✕</button>
                          )}
                        </div>
                        {optError && <p style={s.errorText}>{optError}</p>}
                        <div style={s.formRow}>
                          <button style={s.cancelBtn} onClick={() => { setShowOptForm(null); setEditingOpt(null); }}>Cancel</button>
                          <button style={s.saveBtn} onClick={handleSaveOpt} disabled={savingOpt}>
                            {savingOpt ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Options list */}
                    {opts.map((opt) => {
                      const imgSrc = streamUrlForKey(opt.imageThumbKey) ?? opt.imageUrl;
                      return (
                      <div key={opt.id} style={s.optionRow}>
                        {imgSrc ? (
                          <img src={imgSrc} alt={opt.name} style={s.optionImg} loading="lazy" decoding="async" />
                        ) : (
                          <div style={s.optionImgPlaceholder}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <rect x="1" y="3" width="14" height="10" rx="2" stroke="#444" strokeWidth="1.2"/>
                              <circle cx="5.5" cy="7" r="1.5" fill="#444"/>
                              <path d="M2 12l3.5-3.5 3 3L11 9l3 3" stroke="#444" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                        <span style={s.optionName}>{opt.name}</span>
                        <span style={s.optionOrder}>#{opt.order}</span>
                        <button style={s.smallBtn} onClick={(e) => openEditOpt(opt, e)}>Edit</button>
                        <button style={s.deleteBtn} onClick={(e) => handleDeleteOpt(opt, e)}>Delete</button>
                      </div>
                      );
                    })}
                    {opts.length === 0 && !showOptForm && (
                      <p style={{ color: "#555", fontSize: 12, fontStyle: "italic", margin: 0 }}>No options yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
