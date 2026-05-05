"use client";

import React, { useState, useMemo } from "react";
import type { AppearanceCategory, AppearanceOptionsResponse } from "../../lib/api";

export interface AppearanceSelections {
  outfits: string[];
  outfitDetails: string[];
  condition: string[];
}

export const DEFAULT_APPEARANCE_SELECTIONS: AppearanceSelections = {
  outfits: [],
  outfitDetails: [],
  condition: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  selections: AppearanceSelections;
  onSave: (selections: AppearanceSelections) => void;
  options: AppearanceOptionsResponse;
}

type Tab = "outfits" | "outfitDetails" | "condition";

const CONDITION_SECTIONS = [
  {
    label: "Overall Condition",
    options: ["New and clean", "Slightly worn", "Wrinkled", "Faded", "Stretched", "Tight-fitting"],
  },
  {
    label: "Damage",
    options: ["No damage", "Burnt", "Bullet-damaged"],
  },
  {
    label: "Stains",
    options: ["No stains", "Dirty", "Very dirty", "Covered in mud", "Dusty", "Grass-stained", "Food-stained", "Paint-stained", "Blood-stained"],
  },
  {
    label: "Liquids",
    options: ["Normal", "Wet", "Soaked through", "Sweaty", "Oily", "Slimy"],
  },
];

const getActiveCategoryId = (categories: AppearanceCategory[], selected: string | null) => {
  if (!categories.length) return null;
  if (selected && categories.find((c) => c.id === selected)) return selected;
  return categories[0].id;
};

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

export default function AppearanceModal({ open, onClose, selections, onSave, options }: Props) {
  const [tab, setTab] = useState<Tab>("outfits");
  const [draft, setDraft] = useState<AppearanceSelections>({ ...selections, outfits: [...selections.outfits], outfitDetails: [...selections.outfitDetails], condition: [...selections.condition] });
  const [outfitsCategory, setOutfitsCategory] = useState<string | null>(null);
  const [detailsCategory, setDetailsCategory] = useState<string | null>(null);
  const [outfitsSearch, setOutfitsSearch] = useState("");
  const [detailsSearch, setDetailsSearch] = useState("");

  const outfitsCatId = getActiveCategoryId(options.OUTFITS, outfitsCategory);
  const detailsCatId = getActiveCategoryId(options.OUTFIT_DETAILS, detailsCategory);

  const outfitItems = useMemo(() => {
    const cat = options.OUTFITS.find((c) => c.id === outfitsCatId);
    if (!cat) return [];
    const q = outfitsSearch.toLowerCase();
    return q ? cat.options.filter((o) => o.name.toLowerCase().includes(q)) : cat.options;
  }, [options.OUTFITS, outfitsCatId, outfitsSearch]);

  const detailItems = useMemo(() => {
    const cat = options.OUTFIT_DETAILS.find((c) => c.id === detailsCatId);
    if (!cat) return [];
    const q = detailsSearch.toLowerCase();
    return q ? cat.options.filter((o) => o.name.toLowerCase().includes(q)) : cat.options;
  }, [options.OUTFIT_DETAILS, detailsCatId, detailsSearch]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "outfits", label: "Outfits" },
    { key: "outfitDetails", label: "Outfit Details" },
    { key: "condition", label: "Condition of Clothes" },
  ];

  if (!open) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>Appearance</span>
          <div style={s.headerActions}>
            <button style={s.headerBtn} onClick={() => {
              const randomOutfit = options.OUTFITS.flatMap((c) => c.options)[Math.floor(Math.random() * options.OUTFITS.flatMap((c) => c.options).length)]?.name;
              const randomDetail = options.OUTFIT_DETAILS.flatMap((c) => c.options)[Math.floor(Math.random() * options.OUTFIT_DETAILS.flatMap((c) => c.options).length)]?.name;
              const randomCondition = CONDITION_SECTIONS.flatMap((s) => s.options)[Math.floor(Math.random() * CONDITION_SECTIONS.flatMap((s) => s.options).length)];
              setDraft({
                outfits: randomOutfit ? [randomOutfit] : [],
                outfitDetails: randomDetail ? [randomDetail] : [],
                condition: randomCondition ? [randomCondition] : [],
              });
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/>
                <path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/>
              </svg>
              Generate Random
            </button>
            <button style={s.closeBtn} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {tabs.map(({ key, label }) => (
            <button key={key} style={{ ...s.tabBtn, ...(tab === key ? s.tabBtnActive : {}) }} onClick={() => setTab(key)}>
              {label}
              {tab === key && <div style={s.tabUnderline} />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.content} className="appearance-modal-scroll">

          {/* ── Outfits ── */}
          {tab === "outfits" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Search */}
              <div style={s.searchWrap}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s.searchIcon}>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="#666" strokeWidth="1.3"/>
                  <path d="M10.5 10.5L14 14" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  style={s.searchInput}
                  placeholder="Search"
                  value={outfitsSearch}
                  onChange={(e) => setOutfitsSearch(e.target.value)}
                />
              </div>

              {options.OUTFITS.length === 0 ? (
                <div style={s.emptyHint}>No outfits added yet. Add them in the admin panel.</div>
              ) : (
                <>
                  {/* Category pills */}
                  <div style={s.catPillRow}>
                    {options.OUTFITS.map((cat) => (
                      <button
                        key={cat.id}
                        style={{ ...s.catPill, ...(outfitsCatId === cat.id ? s.catPillActive : {}) }}
                        onClick={() => { setOutfitsCategory(cat.id); setOutfitsSearch(""); }}
                      >
                        {cat.name}
                        {outfitsCatId === cat.id && <div style={s.catPillUnderline} />}
                      </button>
                    ))}
                  </div>

                  {/* Image grid */}
                  <div style={s.imageGrid}>
                    {outfitItems.map((opt) => {
                      const selected = draft.outfits.includes(opt.name);
                      return (
                        <button
                          key={opt.id}
                          style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }}
                          onClick={() => setDraft({ ...draft, outfits: toggle(draft.outfits, opt.name) })}
                        >
                          {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                          <span style={s.imgCardLabel}>{opt.name}</span>
                        </button>
                      );
                    })}
                    {outfitItems.length === 0 && (
                      <div style={s.emptyHint}>{outfitsSearch ? "No results" : "No options in this category."}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Outfit Details ── */}
          {tab === "outfitDetails" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Search */}
              <div style={s.searchWrap}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s.searchIcon}>
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="#666" strokeWidth="1.3"/>
                  <path d="M10.5 10.5L14 14" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  style={s.searchInput}
                  placeholder="Search"
                  value={detailsSearch}
                  onChange={(e) => setDetailsSearch(e.target.value)}
                />
              </div>

              {options.OUTFIT_DETAILS.length === 0 ? (
                <div style={s.emptyHint}>No outfit details added yet. Add them in the admin panel.</div>
              ) : (
                <>
                  {/* Category pills */}
                  <div style={s.catPillRow}>
                    {options.OUTFIT_DETAILS.map((cat) => (
                      <button
                        key={cat.id}
                        style={{ ...s.catPill, ...(detailsCatId === cat.id ? s.catPillActive : {}) }}
                        onClick={() => { setDetailsCategory(cat.id); setDetailsSearch(""); }}
                      >
                        {cat.name}
                        {detailsCatId === cat.id && <div style={s.catPillUnderline} />}
                      </button>
                    ))}
                  </div>

                  {/* Image grid */}
                  <div style={s.imageGrid}>
                    {detailItems.map((opt) => {
                      const selected = draft.outfitDetails.includes(opt.name);
                      return (
                        <button
                          key={opt.id}
                          style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }}
                          onClick={() => setDraft({ ...draft, outfitDetails: toggle(draft.outfitDetails, opt.name) })}
                        >
                          {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                          <span style={s.imgCardLabel}>{opt.name}</span>
                        </button>
                      );
                    })}
                    {detailItems.length === 0 && (
                      <div style={s.emptyHint}>{detailsSearch ? "No results" : "No options in this category."}</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Condition of Clothes ── */}
          {tab === "condition" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <p style={s.conditionNote}>*Selected conditions apply to all selected clothing in the prompt.</p>
              {CONDITION_SECTIONS.map((section) => (
                <div key={section.label}>
                  <div style={s.sectionLabel}>{section.label}</div>
                  <div style={s.conditionPillRow}>
                    {section.options.map((opt) => {
                      const selected = draft.condition.includes(opt);
                      return (
                        <button
                          key={opt}
                          style={{ ...s.conditionPill, ...(selected ? s.conditionPillActive : {}) }}
                          onClick={() => setDraft({ ...draft, condition: toggle(draft.condition, opt) })}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>

      <style>{`
        .appearance-modal-scroll::-webkit-scrollbar { width: 4px; }
        .appearance-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .appearance-modal-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
        .appearance-cat-pills::-webkit-scrollbar { display: none; }
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
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 8,
    border: "1px solid #3a3a3a",
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid #3a3a3a",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  tabBtn: {
    position: "relative",
    flex: 1,
    padding: "14px 20px",
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "inherit",
  },
  tabBtnActive: {
    color: "#fff",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    background: "#f95bad",
    borderRadius: "2px 2px 0 0",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    padding: "10px 12px 10px 36px",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  catPillRow: {
    display: "flex",
    gap: 0,
    overflowX: "auto",
    scrollbarWidth: "none" as const,
    msOverflowStyle: "none" as const,
  },
  catPill: {
    position: "relative",
    padding: "8px 16px",
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "inherit",
    flexShrink: 0,
  },
  catPillActive: {
    color: "#fff",
  },
  catPillUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    background: "#f95bad",
    borderRadius: "2px 2px 0 0",
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 10,
  },
  imgCard: {
    position: "relative",
    aspectRatio: "1 / 1",
    borderRadius: 12,
    overflow: "hidden",
    cursor: "pointer",
    background: "#1a1a1a",
    padding: 0,
  },
  imgCardSelected: {
    border: "2px solid #f95bad",
  },
  imgCardUnselected: {
    border: "1px dashed rgba(255,255,255,0.3)",
  },
  imgCardImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  imgCardLabel: {
    position: "absolute",
    bottom: 8,
    left: 0,
    right: 0,
    textAlign: "center" as const,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
  },
  conditionNote: {
    color: "#f95bad",
    fontSize: 13,
    fontStyle: "italic",
    margin: 0,
  },
  sectionLabel: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 10,
  },
  conditionPillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  conditionPill: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "#1a1a1a",
    color: "#ccc",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  conditionPillActive: {
    border: "1px solid #f95bad",
    background: "rgba(249,91,173,0.12)",
    color: "#f95bad",
  },
  emptyHint: {
    color: "#555",
    fontSize: 13,
    fontStyle: "italic",
    padding: "8px 0",
  },
  footer: {
    display: "flex",
    gap: 12,
    padding: "16px 24px",
    borderTop: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  cancelBtn: {
    flex: 1,
    padding: "12px 0",
    borderRadius: 10,
    border: "1px solid #3a3a3a",
    background: "transparent",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBtn: {
    flex: 2,
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #f95bad, #c940a0)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
