"use client";

import React, { useState, useMemo } from "react";
import type { PoseCategory, PoseOptionsResponse } from "../../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerate: (poseName: string, posePrompt: string) => void;
  options: PoseOptionsResponse;
}

const getActiveCategoryId = (categories: PoseCategory[], selected: string | null) => {
  if (!categories.length) return null;
  if (selected && categories.find((c) => c.id === selected)) return selected;
  return categories[0].id;
};

export default function ChatPoseModal({ open, onClose, onGenerate, options }: Props) {
  const [selectedPose, setSelectedPose] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const catId = getActiveCategoryId(options.POSE, activeCategory);

  const items = useMemo(() => {
    const cat = options.POSE.find((c) => c.id === catId);
    if (!cat) return [];
    const q = search.toLowerCase();
    return q ? cat.options.filter((o) => o.name.toLowerCase().includes(q)) : cat.options;
  }, [options.POSE, catId, search]);

  const allOptions = useMemo(() => options.POSE.flatMap((c) => c.options), [options.POSE]);

  if (!open) return null;

  const selectedOption = selectedPose ? allOptions.find((o) => o.name === selectedPose) : null;

  const handleGenerate = () => {
    if (selectedOption) {
      onGenerate(selectedOption.name, selectedOption.prompt || selectedOption.name);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        <div style={s.header}>
          <span style={s.title}>Выберите позу</span>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div style={s.content} className="chat-pose-modal-scroll">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={s.searchWrap}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s.searchIcon}>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="#666" strokeWidth="1.3"/>
                <path d="M10.5 10.5L14 14" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input
                style={s.searchInput}
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {options.POSE.length === 0 ? (
              <div style={s.emptyHint}>No poses available.</div>
            ) : (
              <>
                <div style={s.catPillRow} className="chat-pose-cat-pills">
                  {options.POSE.map((cat) => (
                    <button
                      key={cat.id}
                      style={{ ...s.catPill, ...(catId === cat.id ? s.catPillActive : {}) }}
                      onClick={() => { setActiveCategory(cat.id); setSearch(""); }}
                    >
                      {cat.name}
                      {catId === cat.id && <div style={s.catPillUnderline} />}
                    </button>
                  ))}
                </div>

                <div style={s.imageGrid}>
                  {items.map((opt) => {
                    const isSelected = selectedPose === opt.name;
                    return (
                      <button
                        key={opt.id}
                        style={{ ...s.imgCard, ...(isSelected ? s.imgCardSelected : s.imgCardUnselected) }}
                        onClick={() => setSelectedPose(isSelected ? null : opt.name)}
                      >
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                        <span style={s.imgCardLabel}>{opt.name}</span>
                      </button>
                    );
                  })}
                  {items.length === 0 && (
                    <div style={s.emptyHint}>{search ? "No results" : "No options in this category."}</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>Отмена</button>
          <button
            style={{ ...s.generateBtn, ...(!selectedPose ? s.generateBtnDisabled : {}) }}
            onClick={handleGenerate}
            disabled={!selectedPose}
          >
            Сгенерировать
          </button>
        </div>
      </div>

      <style>{`
        .chat-pose-modal-scroll::-webkit-scrollbar { width: 4px; }
        .chat-pose-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-pose-modal-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
        .chat-pose-cat-pills::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    background: "#111",
    borderRadius: 16,
    width: "min(860px, 95vw)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid #2a2a2a",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 16px",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: 700 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: "1px solid #3a3a3a", background: "transparent",
    color: "#fff", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  content: { flex: 1, overflowY: "auto", padding: "20px 24px" },
  searchWrap: { position: "relative", display: "flex", alignItems: "center" },
  searchIcon: { position: "absolute", left: 12, pointerEvents: "none" },
  searchInput: {
    width: "100%", padding: "10px 12px 10px 36px",
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10,
    color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  catPillRow: {
    display: "flex", gap: 0, overflowX: "auto",
    scrollbarWidth: "none" as const, msOverflowStyle: "none" as const,
  },
  catPill: {
    position: "relative", padding: "8px 16px", background: "transparent",
    border: "none", color: "#888", fontSize: 14, cursor: "pointer",
    whiteSpace: "nowrap" as const, fontFamily: "inherit", flexShrink: 0,
  },
  catPillActive: { color: "#fff" },
  catPillUnderline: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 2, background: "#f95bad", borderRadius: "2px 2px 0 0",
  },
  imageGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  imgCard: {
    position: "relative", aspectRatio: "1 / 1", borderRadius: 12,
    overflow: "hidden", cursor: "pointer", background: "#1a1a1a", padding: 0,
  },
  imgCardSelected: { border: "2px solid #f95bad" },
  imgCardUnselected: { border: "1px dashed rgba(255,255,255,0.3)" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  imgCardLabel: {
    position: "absolute", bottom: 8, left: 0, right: 0,
    textAlign: "center" as const, color: "#fff", fontSize: 13, fontWeight: 600,
    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
  },
  emptyHint: { color: "#555", fontSize: 13, padding: "20px 0" },
  footer: {
    display: "flex", gap: 12, padding: "16px 24px",
    borderTop: "1px solid #2a2a2a", flexShrink: 0,
  },
  cancelBtn: {
    flex: 1, padding: "12px", borderRadius: 12,
    border: "1px solid #2a2a2a", background: "transparent",
    color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  },
  generateBtn: {
    flex: 1, padding: "12px", borderRadius: 12, border: "none",
    background: "linear-gradient(135deg, #f95bad 0%, #e0429a 100%)",
    color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  generateBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },
};
