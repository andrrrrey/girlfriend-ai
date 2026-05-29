"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import type { PoseCategory, PoseOptionsResponse } from "../../lib/api";

export interface PoseSelections {
  facialExpressions: string[];
  poses: string[];
}

export const DEFAULT_POSE_SELECTIONS: PoseSelections = {
  facialExpressions: [],
  poses: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  selections: PoseSelections;
  onSave: (selections: PoseSelections) => void;
  options: PoseOptionsResponse;
}

type Section = "facialExpression" | "pose";
const SECTIONS: Section[] = ["facialExpression", "pose"];
const SECTION_LABELS: Record<Section, string> = {
  facialExpression: "Facial expression",
  pose: "Pose",
};

const getActiveCategoryId = (categories: PoseCategory[], selected: string | null) => {
  if (!categories.length) return null;
  if (selected && categories.find((c) => c.id === selected)) return selected;
  return categories[0].id;
};

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

export default function PoseModal({ open, onClose, selections, onSave, options }: Props) {
  const [draft, setDraft] = useState<PoseSelections>({
    facialExpressions: [...selections.facialExpressions],
    poses: [...selections.poses],
  });
  const [facialCategory, setFacialCategory] = useState<string | null>(null);
  const [poseCategory, setPoseCategory] = useState<string | null>(null);
  const [facialSearch, setFacialSearch] = useState("");
  const [poseSearch, setPoseSearch] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("facialExpression");

  const sectionRefs = {
    facialExpression: useRef<HTMLDivElement>(null),
    pose: useRef<HTMLDivElement>(null),
  };
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closest: Section = "facialExpression";
      let closestDist = Infinity;
      for (const sec of SECTIONS) {
        const el = sectionRefs[sec].current;
        if (!el) continue;
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < closestDist) { closestDist = dist; closest = sec; }
      }
      setActiveSection(closest);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  });

  const facialCatId = getActiveCategoryId(options.FACIAL_EXPRESSION, facialCategory);
  const poseCatId = getActiveCategoryId(options.POSE, poseCategory);

  const facialItems = useMemo(() => {
    const cat = options.FACIAL_EXPRESSION.find((c) => c.id === facialCatId);
    if (!cat) return [];
    const q = facialSearch.toLowerCase();
    return q ? cat.options.filter((o) => o.name.toLowerCase().includes(q)) : cat.options;
  }, [options.FACIAL_EXPRESSION, facialCatId, facialSearch]);

  const poseItems = useMemo(() => {
    const cat = options.POSE.find((c) => c.id === poseCatId);
    if (!cat) return [];
    const q = poseSearch.toLowerCase();
    return q ? cat.options.filter((o) => o.name.toLowerCase().includes(q)) : cat.options;
  }, [options.POSE, poseCatId, poseSearch]);

  if (!open) return null;

  const scrollTo = (section: Section) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRandom = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const allFacial = options.FACIAL_EXPRESSION.flatMap((c) => c.options);
    const allPose = options.POSE.flatMap((c) => c.options);
    setDraft({
      facialExpressions: allFacial.length ? [pick(allFacial).name] : [],
      poses: allPose.length ? [pick(allPose).name] : [],
    });
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="pose-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>Pose</span>
          <div style={s.headerActions}>
            <button style={s.closeBtn} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={s.body}>
          {/* Sidebar */}
          <div style={s.sidebar}>
            <nav style={s.sidebarNav}>
              {SECTIONS.map((sec) => (
                <button key={sec} style={{ ...s.sidebarItem, ...(activeSection === sec ? s.sidebarItemActive : {}) }} onClick={() => scrollTo(sec)}>
                  {SECTION_LABELS[sec]}
                </button>
              ))}
            </nav>
            <div style={s.sidebarDivider} />
            <button style={s.sidebarGenerate} onClick={handleRandom}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              Generate Random
            </button>
          </div>

          {/* Content */}
          <div style={s.content} ref={contentRef}>
            {/* ── Facial Expression ── */}
            <div ref={sectionRefs.facialExpression} style={s.section}>
              <div style={s.sectionTitle}>Facial expression</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={s.searchWrap}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s.searchIcon}><circle cx="6.5" cy="6.5" r="4.5" stroke="#666" strokeWidth="1.3"/><path d="M10.5 10.5L14 14" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  <input style={s.searchInput} placeholder="Search" value={facialSearch} onChange={(e) => setFacialSearch(e.target.value)} />
                </div>
                {options.FACIAL_EXPRESSION.length === 0 ? (
                  <div style={s.emptyHint}>No facial expressions added yet. Add them in the admin panel.</div>
                ) : (
                  <>
                    <div style={s.catPillRow}>
                      {options.FACIAL_EXPRESSION.map((cat) => (
                        <button key={cat.id} style={{ ...s.catPill, ...(facialCatId === cat.id ? s.catPillActive : {}) }} onClick={() => { setFacialCategory(cat.id); setFacialSearch(""); }}>
                          {cat.name}
                          {facialCatId === cat.id && <div style={s.catPillUnderline} />}
                        </button>
                      ))}
                    </div>
                    <div style={s.imageGrid}>
                      {facialItems.map((opt) => {
                        const selected = draft.facialExpressions.includes(opt.name);
                        return (
                          <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, facialExpressions: toggle(draft.facialExpressions, opt.name) })}>
                            {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                            <span style={s.imgCardLabel}>{opt.name}</span>
                          </button>
                        );
                      })}
                      {facialItems.length === 0 && <div style={s.emptyHint}>{facialSearch ? "No results" : "No options in this category."}</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Pose ── */}
            <div ref={sectionRefs.pose} style={s.section}>
              <div style={s.sectionTitle}>Pose</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={s.searchWrap}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={s.searchIcon}><circle cx="6.5" cy="6.5" r="4.5" stroke="#666" strokeWidth="1.3"/><path d="M10.5 10.5L14 14" stroke="#666" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  <input style={s.searchInput} placeholder="Search" value={poseSearch} onChange={(e) => setPoseSearch(e.target.value)} />
                </div>
                {options.POSE.length === 0 ? (
                  <div style={s.emptyHint}>No poses added yet. Add them in the admin panel.</div>
                ) : (
                  <>
                    <div style={s.catPillRow}>
                      {options.POSE.map((cat) => (
                        <button key={cat.id} style={{ ...s.catPill, ...(poseCatId === cat.id ? s.catPillActive : {}) }} onClick={() => { setPoseCategory(cat.id); setPoseSearch(""); }}>
                          {cat.name}
                          {poseCatId === cat.id && <div style={s.catPillUnderline} />}
                        </button>
                      ))}
                    </div>
                    <div style={s.imageGrid}>
                      {poseItems.map((opt) => {
                        const selected = draft.poses.includes(opt.name);
                        return (
                          <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, poses: toggle(draft.poses, opt.name) })}>
                            {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                            <span style={s.imgCardLabel}>{opt.name}</span>
                          </button>
                        );
                      })}
                      {poseItems.length === 0 && <div style={s.emptyHint}>{poseSearch ? "No results" : "No options in this category."}</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>

      <style>{`
        .pose-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
        .pose-modal *::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .pose-modal *::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 3px; }
        .pose-modal *::-webkit-scrollbar-thumb:hover { background: #ff7cc8; }
        .pose-modal { scrollbar-color: #f95bad #1a1a1a; scrollbar-width: thin; }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#111", borderRadius: 16, width: "min(960px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #2a2a2a" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 },
  title: { color: "#fff", fontSize: 20, fontWeight: 700 },
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 200, flexShrink: 0, background: "#151515", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", padding: "16px 0" },
  sidebarNav: { display: "flex", flexDirection: "column" },
  sidebarItem: { display: "flex", alignItems: "center", padding: "12px 20px", background: "transparent", border: "none", borderLeft: "3px solid transparent", color: "#888", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s", fontFamily: "inherit" },
  sidebarItemActive: { color: "#f95bad", borderLeft: "3px solid #f95bad", background: "rgba(249,91,173,0.06)" },
  sidebarDivider: { height: 1, background: "#2a2a2a", margin: "12px 16px" },
  sidebarGenerate: { display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "transparent", border: "none", color: "#C1F0AA", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" },
  content: { flex: 1, overflowY: "auto", padding: "24px" },
  section: { marginBottom: 36 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid #2a2a2a" },
  searchWrap: { position: "relative", display: "flex", alignItems: "center" },
  searchIcon: { position: "absolute", left: 12, pointerEvents: "none" },
  searchInput: { width: "100%", padding: "10px 12px 10px 36px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const },
  catPillRow: { display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" as const, msOverflowStyle: "none" as const },
  catPill: { position: "relative", padding: "8px 16px", background: "transparent", border: "none", color: "#888", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" as const, fontFamily: "inherit", flexShrink: 0 },
  catPillActive: { color: "#fff" },
  catPillUnderline: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "#f95bad", borderRadius: "2px 2px 0 0" },
  imageGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  imgCard: { position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#1a1a1a", padding: 0 },
  imgCardSelected: { border: "2px solid #f95bad" },
  imgCardUnselected: { border: "1px dashed rgba(255,255,255,0.3)" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  imgCardLabel: { position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center" as const, color: "#fff", fontSize: 13, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.8)" },
  emptyHint: { color: "#555", fontSize: 13, padding: "20px 0" },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
