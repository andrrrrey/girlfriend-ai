"use client";

import React, { useState, useRef, useEffect } from "react";
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

type Section = "framing" | "cameraAngle" | "lens" | "lighting";
const SECTIONS: Section[] = ["framing", "cameraAngle", "lens", "lighting"];
const SECTION_LABELS: Record<Section, string> = {
  framing: "Framing",
  cameraAngle: "Camera Angle",
  lens: "Lens",
  lighting: "Lighting",
};

export const LENS_OPTIONS = [
  "Ultra-wide 14mm",
  "Wide 24mm",
  "Standard 35mm",
  "Normal 50mm",
  "Portrait 85mm",
  "Telephoto 135mm",
  "Fisheye",
];

export const LIGHTING_OPTIONS = [
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

function SelectedOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 1 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f95bad", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </div>
  );
}

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

export default function CameraModal({ open, onClose, selections, onSave, options }: Props) {
  const [draft, setDraft] = useState<CameraSelections>({
    framing: [...selections.framing],
    cameraAngle: [...selections.cameraAngle],
    lens: [...selections.lens],
    lighting: [...selections.lighting],
  });
  const [activeSection, setActiveSection] = useState<Section>("framing");

  const sectionRefs = {
    framing: useRef<HTMLDivElement>(null),
    cameraAngle: useRef<HTMLDivElement>(null),
    lens: useRef<HTMLDivElement>(null),
    lighting: useRef<HTMLDivElement>(null),
  };
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closest: Section = "framing";
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

  const handleRandom = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randomFraming = options.FRAMING.length ? pick(options.FRAMING).name : undefined;
    const randomAngle = options.CAMERA_ANGLE.length ? pick(options.CAMERA_ANGLE).name : undefined;
    setDraft({
      framing: randomFraming ? [randomFraming] : [],
      cameraAngle: randomAngle ? [randomAngle] : [],
      lens: [pick(LENS_OPTIONS)],
      lighting: [pick(LIGHTING_OPTIONS)],
    });
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="camera-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>Camera</span>
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
            {/* ── Framing ── */}
            <div ref={sectionRefs.framing} style={s.section}>
              <div style={s.sectionTitle}>Framing</div>
              {options.FRAMING.length === 0 ? (
                <div style={s.emptyHint}>No framing options added yet. Add them in the admin panel.</div>
              ) : (
                <div style={s.imageGrid}>
                  {options.FRAMING.map((opt) => {
                    const selected = draft.framing.includes(opt.name);
                    return (
                      <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, framing: toggle(draft.framing, opt.name) })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                        {selected && <SelectedOverlay />}
                        <span style={s.imgCardLabel}>{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Camera Angle ── */}
            <div ref={sectionRefs.cameraAngle} style={s.section}>
              <div style={s.sectionTitle}>Camera Angle</div>
              {options.CAMERA_ANGLE.length === 0 ? (
                <div style={s.emptyHint}>No camera angle options added yet. Add them in the admin panel.</div>
              ) : (
                <div style={s.imageGrid}>
                  {options.CAMERA_ANGLE.map((opt) => {
                    const selected = draft.cameraAngle.includes(opt.name);
                    return (
                      <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, cameraAngle: toggle(draft.cameraAngle, opt.name) })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={s.imgCardImg} />}
                        {selected && <SelectedOverlay />}
                        <span style={s.imgCardLabel}>{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Lens ── */}
            <div ref={sectionRefs.lens} style={s.section}>
              <div style={s.sectionTitle}>Lens</div>
              <div style={s.pillRow}>
                {LENS_OPTIONS.map((opt) => {
                  const selected = draft.lens.includes(opt);
                  return (
                    <button key={opt} style={{ ...s.pill, ...(selected ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, lens: toggle(draft.lens, opt) })}>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Lighting ── */}
            <div ref={sectionRefs.lighting} style={s.section}>
              <div style={s.sectionTitle}>Lighting</div>
              <div style={s.pillRow}>
                {LIGHTING_OPTIONS.map((opt) => {
                  const selected = draft.lighting.includes(opt);
                  return (
                    <button key={opt} style={{ ...s.pill, ...(selected ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, lighting: toggle(draft.lighting, opt) })}>
                      {opt}
                    </button>
                  );
                })}
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
        .camera-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
        .camera-modal *::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .camera-modal *::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 3px; }
        .camera-modal *::-webkit-scrollbar-thumb:hover { background: #ff7cc8; }
        .camera-modal { scrollbar-color: #f95bad #1a1a1a; scrollbar-width: thin; }
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
  imageGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  imgCard: { position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#1a1a1a", padding: 0 },
  imgCardSelected: { border: "2px solid #555" },
  imgCardUnselected: { border: "2px solid #2a2a2a" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  imgCardLabel: { position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center" as const, color: "#fff", fontSize: 13, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.8)" },
  pillRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  pill: { padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  pillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  emptyHint: { color: "#555", fontSize: 13 },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
