"use client";

import React, { useState } from "react";
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
  onSave: (selections: PromptDetailsSelections) => void;
  characterSelections: CharacterSelections;
  appearanceSelections: AppearanceSelections;
  poseSelections: PoseSelections;
  sceneSelections: SceneSelections;
  cameraSelections: CameraSelections;
}

type Tab = "prompt" | "negativePrompt";

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
}: Props) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [draft, setDraft] = useState<PromptDetailsSelections>({
    negativePromptTerms: [...selections.negativePromptTerms],
  });

  if (!open) return null;

  // Compute breakdown values
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
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={s.title}>Prompt Details</span>
            <span dangerouslySetInnerHTML={{ __html: GEM }} />
          </div>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div style={{ borderBottom: "1px solid #2a2a2a" }} />

        {/* Tabs */}
        <div style={s.tabRow}>
          {(["prompt", "negativePrompt"] as Tab[]).map((t) => (
            <button
              key={t}
              style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === "prompt" ? "Prompt" : "Negative Prompt"}
              {tab === t && <div style={s.tabUnderline} />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={s.content} className="pd-modal-scroll">

          {tab === "prompt" && (
            <>
              {/* Prompt Preview */}
              <div style={s.section}>
                <div style={s.sectionTitle}>
                  Prompt Preview
                  <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
                </div>
                <div style={s.promptBox}>
                  {prompt
                    ? <span style={{ color: "#fff" }}>{prompt}</span>
                    : <span style={{ color: "#555" }}>No prompt entered yet.</span>
                  }
                </div>
              </div>

              {/* Prompt Breakdown */}
              <div style={s.section}>
                <div style={s.sectionTitle}>
                  Prompt Breakdown
                  <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
                </div>
                <div style={s.conditionNote}>
                  *Selected conditions apply to all selected clothing in the prompt.
                </div>
                <div style={s.breakdownGrid}>
                  <div style={s.col}>
                    <div style={s.colTitle}>Character</div>
                    <BreakdownField label="Subject" value={subject} />
                    <BreakdownField label="Hair" value={hair} />
                    <BreakdownField label="Face" value={face} />
                    <BreakdownField label="Expression" value={expression} />
                  </div>
                  <div style={s.col}>
                    <div style={s.colTitle}>Appearance</div>
                    <BreakdownField label="Body" value={body} />
                    <BreakdownField label="Clothing" value={clothing} />
                    <BreakdownField label="Accessories" value={accessories} />
                    <BreakdownField label="Pose" value={pose} />
                  </div>
                  <div style={s.col}>
                    <div style={s.colTitle}>Camera</div>
                    <BreakdownField label="Quality / Style" value="" />
                    <BreakdownField label="Scene" value={scene} />
                    <BreakdownField label="Framing" value={framing} />
                    <BreakdownField label="Lighting" value={lighting} />
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "negativePrompt" && (
            <div style={s.section}>
              <div style={s.sectionTitle}>
                Negative Prompt
                <span dangerouslySetInnerHTML={{ __html: GEM }} style={{ marginLeft: 6 }} />
              </div>
              <div style={s.pillGrid}>
                {NEGATIVE_PROMPT_OPTIONS.map((opt) => {
                  const selected = draft.negativePromptTerms.includes(opt);
                  return (
                    <button
                      key={opt}
                      style={{ ...s.pill, ...(selected ? s.pillActive : {}) }}
                      onClick={() => setDraft({ ...draft, negativePromptTerms: toggle(draft.negativePromptTerms, opt) })}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
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
        .pd-modal-scroll::-webkit-scrollbar { width: 4px; }
        .pd-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .pd-modal-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
      `}</style>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    background: "#111",
    borderRadius: 16,
    width: "min(1020px, 96vw)",
    maxHeight: "92vh",
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
    flexShrink: 0,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: 700 },
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
  tabRow: {
    display: "flex",
    borderBottom: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: "14px 20px",
    background: "transparent",
    border: "none",
    color: "#848484",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    position: "relative",
    transition: "color 0.15s",
  },
  tabActive: { color: "#fff" },
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
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
  },
  conditionNote: {
    color: "#f95bad",
    fontSize: 12,
  },
  promptBox: {
    background: "#1a1a1a",
    borderRadius: 10,
    padding: "16px",
    fontSize: 13,
    lineHeight: 1.7,
    wordBreak: "break-word",
    minHeight: 80,
  },
  breakdownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 20,
  },
  col: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  colTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 2,
  },
  pillGrid: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  pill: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "#1a1a1a",
    color: "#ccc",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pillActive: {
    border: "1px solid #f95bad",
    background: "rgba(249,91,173,0.12)",
    color: "#f95bad",
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
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #2a2a2a",
    background: "transparent",
    color: "#fff",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #f95bad 0%, #e0429a 100%)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
