"use client";

import React, { useState, useRef, useEffect } from "react";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";
import type { CharacterSelections } from "./CharacterModal";
import type { AppearanceSelections } from "./AppearanceModal";
import type { PoseSelections } from "./PoseModal";
import type { SceneSelections } from "./SceneModal";
import type { CameraSelections } from "./CameraModal";

export interface PromptDetailsSelections {
  negativePromptTerms: string[];
}

export const DEFAULT_PROMPT_DETAILS_SELECTIONS: PromptDetailsSelections = {
  negativePromptTerms: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  prompt: string;
  selections: PromptDetailsSelections;
  onSave: (selections: PromptDetailsSelections, prompt: string) => void;
  characterSelections: CharacterSelections;
  appearanceSelections: AppearanceSelections;
  poseSelections: PoseSelections;
  sceneSelections: SceneSelections;
  cameraSelections: CameraSelections;
  /** Скрыть секцию «Prompt Breakdown», оставив только Prompt Preview и Negative Prompt. */
  hideBreakdown?: boolean;
  /** Скрыть секцию «Negative Prompt». */
  hideNegativePrompt?: boolean;
}

type Section = "prompt" | "negativePrompt";
const SECTIONS: Section[] = ["prompt", "negativePrompt"];
const SECTION_KEYS: Record<Section, TKey> = {
  prompt: "prompt.prompt",
  negativePrompt: "prompt.negativePrompt",
};

const NEGATIVE_PROMPT_OPTIONS = [
  "blurry", "out of focus", "low quality", "bad quality", "worst quality",
  "jpeg artifacts", "noise", "grain", "pixelated", "overexposed", "underexposed",
  "bad anatomy", "bad hands", "extra fingers", "missing fingers",
  "extra limbs", "missing limbs", "deformed", "disfigured", "mutilated", "malformed",
  "bad face", "ugly", "asymmetric face", "cross-eyed", "distorted face",
  "watermark", "text", "logo", "signature", "username",
  "cropped", "out of frame", "cut off",
  "cartoon", "3d render", "painting", "sketch", "drawing", "illustration",
  "duplicate", "multiple views", "collage",
  "overlit", "harsh lighting", "harsh shadows", "flat lighting",
  "monochrome", "greyscale", "desaturated",
  "wrong proportions", "stretched", "distorted",
  "low resolution", "draft", "amateur",
];

const GEM = `<svg viewBox="0 0 15.86 13.51" fill="none" width="15" height="13"><path d="M12.09.5l.01-.5c.27.01.54.08.77.21.24.13.44.31.59.53l2.08 2.88c.22.31.33.68.31 1.06-.02.38-.16.74-.41 1.03L9.21 12.9c-.15.19-.34.34-.56.45-.22.11-.47.17-.72.17s-.5-.06-.72-.17c-.22-.11-.41-.26-.56-.45L.41 5.71c-.25-.29-.39-.65-.41-1.03-.02-.38.09-.75.31-1.06l2.08-2.88c.15-.22.36-.4.59-.53.24-.13.5-.2.77-.21h8.33V.5zM5.3 5.31l2.64 6.37 2.65-6.37H5.3zM1.39 5.31l5.4 6.22-2.58-6.22H1.39zm10.28 0l-2.59 6.21 5.39-6.21h-2.8zM3.7 1.01a.68.68 0 0 0-.48.3l-2.08 2.88c-.03.04-.05.07-.06.12h3.21l2.14-3.31H3.79zm1.77 3.3h4.95L8.3 1H7.6zm6.14 0h3.19c-.02-.04-.04-.08-.06-.12l-2.08-2.87a.72.72 0 0 0-.49-.3L12.08 1H9.48l2.13 3.31z" fill="url(#pdgem)"/><defs><linearGradient id="pdgem" x1="0" y1="6.76" x2="15.86" y2="6.76" gradientUnits="userSpaceOnUse"><stop stop-color="#F95BAD"/><stop offset="1" stop-color="#FF0084"/></linearGradient></defs></svg>`;

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

function BreakdownField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
      <div style={{ color: "#848484", fontSize: 12 }}>{label}</div>
      <div style={{
        background: "#1a1a1a", borderRadius: 8, padding: "10px 12px",
        minHeight: 40, fontSize: 13, color: value ? "#fff" : "#444",
        lineHeight: 1.5, wordBreak: "break-word" as const,
      }}>
        {value || "empty"}
      </div>
    </div>
  );
}

export default function PromptDetailsModal({
  open, onClose, prompt, selections, onSave,
  characterSelections, appearanceSelections, poseSelections, sceneSelections, cameraSelections,
  hideBreakdown = false, hideNegativePrompt = false,
}: Props) {
  const { t } = useT();
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [draft, setDraft] = useState<PromptDetailsSelections>({
    negativePromptTerms: [...selections.negativePromptTerms],
  });
  const [activeSection, setActiveSection] = useState<Section>("prompt");

  const sectionRefs = {
    prompt: useRef<HTMLDivElement>(null),
    negativePrompt: useRef<HTMLDivElement>(null),
  };
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closest: Section = "prompt";
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

  if (!open) return null;

  const scrollTo = (section: Section) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const subject = [
    characterSelections.style,
    characterSelections.age ? `${characterSelections.age}-year-old` : "",
    characterSelections.gender,
    characterSelections.humanRace,
    characterSelections.fantasyRace,
  ].filter(Boolean).join(", ");

  const hair = [
    characterSelections.hairStyle,
    characterSelections.hairColor,
    characterSelections.hairLength,
  ].filter(Boolean).join(", ");

  const face = [
    characterSelections.eyeColor ? `${characterSelections.eyeColor} eyes` : "",
    ...characterSelections.eyeFeatures,
    ...characterSelections.faceFeatures,
  ].filter(Boolean).join(", ");

  const expression = poseSelections.facialExpressions.join(", ");

  const body = [
    characterSelections.bodyType,
    characterSelections.breastSize,
    characterSelections.buttSize,
    characterSelections.height,
  ].filter(Boolean).join(", ");

  const clothing = appearanceSelections.outfits.join(", ");
  const accessories = appearanceSelections.outfitDetails.join(", ");
  const pose = poseSelections.poses.join(", ");

  const scene = [
    ...sceneSelections.locations,
    ...sceneSelections.timeOfDay,
    ...sceneSelections.weather,
    ...sceneSelections.particles,
    ...sceneSelections.environmentEffects,
    sceneSelections.props,
  ].filter(Boolean).join(", ");

  const framing = [...cameraSelections.framing, ...cameraSelections.cameraAngle].join(", ");
  const lighting = [...cameraSelections.lighting, ...cameraSelections.lens].join(", ");

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="pd-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={s.title}>{t("prompt.title")}</span>
            <span dangerouslySetInnerHTML={{ __html: GEM }} />
          </div>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={s.body}>
          {/* Sidebar */}
          <div style={s.sidebar}>
            <nav style={s.sidebarNav}>
              {SECTIONS.filter((sec) => !(hideNegativePrompt && sec === "negativePrompt")).map((sec) => (
                <button key={sec} style={{ ...s.sidebarItem, ...(activeSection === sec ? s.sidebarItemActive : {}) }} onClick={() => scrollTo(sec)}>
                  {t(SECTION_KEYS[sec])}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div style={s.content} ref={contentRef}>
            {/* ── Prompt ── */}
            <div ref={sectionRefs.prompt} style={s.section}>
              <div style={s.sectionTitle}>
                {t("prompt.preview")}
                <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
              </div>
              <textarea
                style={s.promptTextarea}
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder={t("prompt.empty")}
                className="pd-prompt-textarea"
              />

              {!hideBreakdown && (
                <>
                  <div style={{ ...s.sectionTitle, marginTop: 28 }}>
                    {t("prompt.breakdown")}
                    <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
                  </div>
                  <div style={s.conditionNote}>
                    {t("prompt.conditionNote")}
                  </div>
                  <div style={s.breakdownGrid}>
                    <div style={s.col}>
                      <div style={s.colTitle}>{t("prompt.character")}</div>
                      <BreakdownField label={t("prompt.subject")} value={subject} />
                      <BreakdownField label={t("prompt.hair")} value={hair} />
                      <BreakdownField label={t("prompt.face")} value={face} />
                      <BreakdownField label={t("prompt.expression")} value={expression} />
                    </div>
                    <div style={s.col}>
                      <div style={s.colTitle}>{t("prompt.appearance")}</div>
                      <BreakdownField label={t("prompt.body")} value={body} />
                      <BreakdownField label={t("prompt.clothing")} value={clothing} />
                      <BreakdownField label={t("prompt.accessories")} value={accessories} />
                      <BreakdownField label={t("prompt.pose")} value={pose} />
                    </div>
                    <div style={s.col}>
                      <div style={s.colTitle}>{t("prompt.camera")}</div>
                      <BreakdownField label={t("prompt.qualityStyle")} value="" />
                      <BreakdownField label={t("prompt.scene")} value={scene} />
                      <BreakdownField label={t("prompt.framing")} value={framing} />
                      <BreakdownField label={t("prompt.lighting")} value={lighting} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── Negative Prompt ── */}
            {!hideNegativePrompt && (
              <div ref={sectionRefs.negativePrompt} style={s.section}>
                <div style={s.sectionTitle}>
                  {t("prompt.negativePrompt")}
                  <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
                </div>
                <div style={s.pillGrid}>
                  {NEGATIVE_PROMPT_OPTIONS.map((opt) => {
                    const selected = draft.negativePromptTerms.includes(opt);
                    return (
                      <button key={opt} style={{ ...s.pill, ...(selected ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, negativePromptTerms: toggle(draft.negativePromptTerms, opt) })}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft, draftPrompt); onClose(); }}>{t("common.save")}</button>
        </div>
      </div>

      <style>{`
        .pd-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
        .pd-modal *::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .pd-modal *::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 3px; }
        .pd-modal *::-webkit-scrollbar-thumb:hover { background: #ff7cc8; }
        .pd-modal { scrollbar-color: #f95bad #1a1a1a; scrollbar-width: thin; }
        .pd-prompt-textarea::placeholder { color: #555; }
        .pd-prompt-textarea:focus { border-color: #3a3a3a !important; }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#111", borderRadius: 16, width: "min(1020px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #2a2a2a" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 },
  title: { color: "#fff", fontSize: 20, fontWeight: 700 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 200, flexShrink: 0, background: "#151515", borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column", padding: "16px 0" },
  sidebarNav: { display: "flex", flexDirection: "column" },
  sidebarItem: { display: "flex", alignItems: "center", padding: "12px 20px", background: "transparent", border: "none", borderLeft: "3px solid transparent", color: "#888", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left" as const, transition: "all 0.15s", fontFamily: "inherit" },
  sidebarItemActive: { color: "#f95bad", borderLeft: "3px solid #f95bad", background: "rgba(249,91,173,0.06)" },
  content: { flex: 1, overflowY: "auto", padding: "24px" },
  section: { marginBottom: 36 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #2a2a2a" },
  conditionNote: { color: "#f95bad", fontSize: 12, marginBottom: 14 },
  promptTextarea: { background: "#1a1a1a", borderRadius: 10, padding: "16px", fontSize: 13, lineHeight: 1.7, minHeight: 100, width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const, border: "1px solid transparent", color: "#fff", fontFamily: "inherit", outline: "none" },
  breakdownGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 },
  col: { display: "flex", flexDirection: "column", gap: 10 },
  colTitle: { color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 2 },
  pillGrid: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  pill: { padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  pillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
