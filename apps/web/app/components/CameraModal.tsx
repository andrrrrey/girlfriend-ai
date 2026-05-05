"use client";

import React, { useState } from "react";
import type { CameraOptionsResponse } from "../../lib/api";

export interface CameraSelections {
  framing: string[];
  cameraAngle: string[];
  lens: string[];
  lighting: string[];
}

export const DEFAULT_CAMERA_SELECTIONS: CameraSelections = {
  framing: [],
  cameraAngle: [],
  lens: [],
  lighting: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  selections: CameraSelections;
  onSave: (selections: CameraSelections) => void;
  options: CameraOptionsResponse;
}

const LENS_OPTIONS = [
  "Ultra-wide 14mm",
  "Wide 24mm",
  "Standard 35mm",
  "Normal 50mm",
  "Portrait 85mm",
  "Telephoto 135mm",
  "Fisheye",
];

const LIGHTING_OPTIONS = [
  "Natural Light",
  "Golden Hour",
  "Soft Diffused",
  "Hard Directional",
  "Studio Softbox",
  "Backlight",
  "High Key",
  "Neon",
  "Candlelight",
  "Moonlight",
  "Spotlight",
  "Window Light",
  "Ultraviolet",
];

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

export default function CameraModal({ open, onClose, selections, onSave, options }: Props) {
  const [draft, setDraft] = useState<CameraSelections>({
    framing: [...selections.framing],
    cameraAngle: [...selections.cameraAngle],
    lens: [...selections.lens],
    lighting: [...selections.lighting],
  });

  if (!open) return null;

  const handleRandom = () => {
    const allFraming = options.FRAMING;
    const allAngles = options.CAMERA_ANGLE;
    const randomFraming = allFraming[Math.floor(Math.random() * allFraming.length)]?.name;
    const randomAngle = allAngles[Math.floor(Math.random() * allAngles.length)]?.name;
    const randomLens = LENS_OPTIONS[Math.floor(Math.random() * LENS_OPTIONS.length)];
    const randomLighting = LIGHTING_OPTIONS[Math.floor(Math.random() * LIGHTING_OPTIONS.length)];
    setDraft({
      framing: randomFraming ? [randomFraming] : [],
      cameraAngle: randomAngle ? [randomAngle] : [],
      lens: [randomLens],
      lighting: [randomLighting],
    });
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>Camera</span>
          <div style={s.headerActions}>
            <button style={s.headerBtn} onClick={handleRandom}>
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

        {/* Content */}
        <div style={s.content} className="camera-modal-scroll">

          {/* ── Framing ── */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Framing</div>
            {options.FRAMING.length === 0 ? (
              <div style={s.emptyHint}>No framing options added yet. Add them in the admin panel.</div>
            ) : (
              <div style={s.imageGrid}>
                {options.FRAMING.map((opt) => {
                  const selected = draft.framing.includes(opt.name);
                  return (
                    <button
                      key={opt.id}
                      style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }}
                      onClick={() => setDraft({ ...draft, framing: toggle(draft.framing, opt.name) })}
                    >
                      {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Camera Angle ── */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Camera Angle</div>
            {options.CAMERA_ANGLE.length === 0 ? (
              <div style={s.emptyHint}>No camera angle options added yet. Add them in the admin panel.</div>
            ) : (
              <div style={s.imageGrid}>
                {options.CAMERA_ANGLE.map((opt) => {
                  const selected = draft.cameraAngle.includes(opt.name);
                  return (
                    <button
                      key={opt.id}
                      style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }}
                      onClick={() => setDraft({ ...draft, cameraAngle: toggle(draft.cameraAngle, opt.name) })}
                    >
                      {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Lens ── */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Lens</div>
            <div style={s.pillRow}>
              {LENS_OPTIONS.map((opt) => {
                const selected = draft.lens.includes(opt);
                return (
                  <button
                    key={opt}
                    style={{ ...s.pill, ...(selected ? s.pillActive : {}) }}
                    onClick={() => setDraft({ ...draft, lens: toggle(draft.lens, opt) })}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Lighting ── */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Lighting</div>
            <div style={s.pillRow}>
              {LIGHTING_OPTIONS.map((opt) => {
                const selected = draft.lighting.includes(opt);
                return (
                  <button
                    key={opt}
                    style={{ ...s.pill, ...(selected ? s.pillActive : {}) }}
                    onClick={() => setDraft({ ...draft, lighting: toggle(draft.lighting, opt) })}
                  >
                    {opt}
                  </button>
                );
              })}
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
        .camera-modal-scroll::-webkit-scrollbar { width: 4px; }
        .camera-modal-scroll::-webkit-scrollbar-track { background: transparent; }
        .camera-modal-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
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
  headerActions: { display: "flex", alignItems: "center", gap: 8 },
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
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sectionLabel: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: 600,
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
  imgCardSelected: { border: "2px solid #f95bad" },
  imgCardUnselected: { border: "1px dashed rgba(255,255,255,0.3)" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
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
  pillRow: {
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
  emptyHint: { color: "#555", fontSize: 13 },
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
