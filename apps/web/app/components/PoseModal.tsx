"use client";

import React, { useState, useRef, useEffect } from "react";
import type { PoseCategory, PoseOptionsResponse } from "../../lib/api";
import { useT } from "../../context/language";
import { localizeOption } from "../../lib/optionLabel";

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
  /** Показывать только секцию Pose (Действия), без Facial Expression. Заголовок становится «Action». */
  posesOnly?: boolean;
}

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

/** В режиме «Action» из секции Pose показываем только категорию «Действия». */
const ACTION_CATEGORY_NAME = "Действия";

function SelectedOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 1 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f95bad", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </div>
  );
}

export default function PoseModal({ open, onClose, selections, onSave, options, posesOnly = false }: Props) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<PoseSelections>({
    facialExpressions: [...selections.facialExpressions],
    poses: [...selections.poses],
  });
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    setDraft({ facialExpressions: [...selections.facialExpressions], poses: [...selections.poses] });
  }, [selections]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      const sections = container.querySelectorAll<HTMLElement>("[data-section-id]");
      let closest = "";
      let closestDist = Infinity;
      sections.forEach((el) => {
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < closestDist) { closestDist = dist; closest = el.dataset.sectionId || ""; }
      });
      setActiveId(closest);
    };
    container.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => container.removeEventListener("scroll", handleScroll);
  });

  if (!open) return null;

  // В режиме «Action» оставляем только категорию «Действия» из секции Pose.
  const poseCategories = posesOnly
    ? options.POSE.filter((cat) => cat.name === ACTION_CATEGORY_NAME)
    : options.POSE;

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRandom = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const allFacial = options.FACIAL_EXPRESSION.flatMap((c) => c.options);
    const allPose = poseCategories.flatMap((c) => c.options);
    setDraft({
      facialExpressions: posesOnly
        ? draft.facialExpressions
        : (allFacial.length ? [pick(allFacial).name] : []),
      poses: allPose.length ? [pick(allPose).name] : [],
    });
  };

  type SidebarEntry = { type: "header"; label: string } | { type: "item"; id: string; label: string };
  const sidebarItems: SidebarEntry[] = [];
  if (!posesOnly && options.FACIAL_EXPRESSION.length > 0) {
    sidebarItems.push({ type: "header", label: t("gen.facialExpression") });
    options.FACIAL_EXPRESSION.forEach((cat) => sidebarItems.push({ type: "item", id: `facial-${cat.id}`, label: localizeOption(cat.name, lang) }));
  }
  if (poseCategories.length > 0) {
    sidebarItems.push({ type: "header", label: t("gen.poseHeader") });
    poseCategories.forEach((cat) => sidebarItems.push({ type: "item", id: `pose-${cat.id}`, label: localizeOption(cat.name, lang) }));
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="pose-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>{posesOnly ? t("gen.titleAction") : t("gen.titlePose")}</span>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="cm-body" style={s.body}>
          <div className="cm-sidebar" style={s.sidebar}>
            <nav style={s.sidebarNav}>
              {sidebarItems.map((entry, i) =>
                entry.type === "header" ? (
                  <div key={i} style={s.sidebarHeader}>{entry.label}</div>
                ) : (
                  <button key={entry.id} style={{ ...s.sidebarItem, ...(activeId === entry.id ? s.sidebarItemActive : {}) }} onClick={() => scrollTo(entry.id)}>
                    {entry.label}
                  </button>
                )
              )}
            </nav>
            <div style={s.sidebarDivider} />
            <button style={s.sidebarGenerate} onClick={handleRandom}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              {t("gen.generateRandom")}
            </button>
          </div>

          <div style={s.content} ref={contentRef}>
            {/* Facial Expression categories */}
            {!posesOnly && options.FACIAL_EXPRESSION.map((cat) => (
              <div key={cat.id} data-section-id={`facial-${cat.id}`} style={s.section}>
                <div style={s.sectionTitle}>{localizeOption(cat.name, lang)}</div>
                <div style={s.imageGrid}>
                  {cat.options.map((opt) => {
                    const selected = draft.facialExpressions.includes(opt.name);
                    return (
                      <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, facialExpressions: toggle(draft.facialExpressions, opt.name) })}>
                        {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                        {selected && <SelectedOverlay />}
                        <span style={s.imgCardLabel}>{localizeOption(opt.name, lang)}</span>
                      </button>
                    );
                  })}
                  {cat.options.length === 0 && <div style={s.emptyHint}>{t("gen.noOptions")}</div>}
                </div>
              </div>
            ))}
            {!posesOnly && options.FACIAL_EXPRESSION.length === 0 && (
              <div style={s.section}><div style={s.sectionTitle}>{t("gen.facialExpression")}</div><div style={s.emptyHint}>{t("gen.noFacialExpressions")}</div></div>
            )}

            {/* Pose categories */}
            {poseCategories.map((cat) => (
              <div key={cat.id} data-section-id={`pose-${cat.id}`} style={s.section}>
                <div style={s.sectionTitle}>{localizeOption(cat.name, lang)}</div>
                <div style={s.imageGrid}>
                  {cat.options.map((opt) => {
                    const selected = draft.poses.includes(opt.name);
                    return (
                      <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, poses: toggle(draft.poses, opt.name) })}>
                        {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                        {selected && <SelectedOverlay />}
                        <span style={s.imgCardLabel}>{localizeOption(opt.name, lang)}</span>
                      </button>
                    );
                  })}
                  {cat.options.length === 0 && <div style={s.emptyHint}>{t("gen.noOptions")}</div>}
                </div>
              </div>
            ))}
            {poseCategories.length === 0 && (
              <div style={s.section}><div style={s.sectionTitle}>{t("gen.poseHeader")}</div><div style={s.emptyHint}>{t("gen.noPosesAdded")}</div></div>
            )}
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft); onClose(); }}>{t("common.save")}</button>
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
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 200, flexShrink: 0, background: "#151515", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", padding: "16px 0", overflowY: "auto" },
  sidebarNav: { display: "flex", flexDirection: "column" },
  sidebarHeader: { padding: "8px 20px 4px", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" },
  sidebarItem: { display: "flex", alignItems: "center", padding: "10px 20px", background: "transparent", border: "none", borderLeft: "3px solid transparent", color: "#888", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s", fontFamily: "inherit" },
  sidebarItemActive: { color: "#f95bad", borderLeft: "3px solid #f95bad", background: "rgba(249,91,173,0.06)" },
  sidebarDivider: { height: 1, background: "#2a2a2a", margin: "12px 16px" },
  sidebarGenerate: { display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", background: "transparent", border: "none", color: "#C1F0AA", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const, fontFamily: "inherit" },
  content: { flex: 1, overflowY: "auto", padding: "24px" },
  section: { marginBottom: 36 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid #2a2a2a" },
  imageGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  imgCard: { position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#1a1a1a", padding: 0 },
  imgCardSelected: { border: "2px solid #555" },
  imgCardUnselected: { border: "2px solid #2a2a2a" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  imgCardLabel: { position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center" as const, color: "#fff", fontSize: 13, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.8)", zIndex: 2 },
  emptyHint: { color: "#555", fontSize: 13, padding: "20px 0" },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
