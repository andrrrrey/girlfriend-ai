"use client";

import React, { useState, useRef, useEffect } from "react";
import type { CharacterOption } from "../../lib/api";

export interface CharacterSelections {
  style?: string;
  age: number;
  gender?: string;
  humanRace?: string;
  fantasyRace?: string;
  eyeColor?: string;
  eyeFeatures: string[];
  faceFeatures: string[];
  hairStyle?: string;
  hairLength?: string;
  hairColor?: string;
  bodyType?: string;
  breastSize?: string;
  buttSize?: string;
  height?: string;
}

export const DEFAULT_CHARACTER_SELECTIONS: CharacterSelections = {
  age: 25,
  eyeFeatures: [],
  faceFeatures: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  selections: CharacterSelections;
  onSave: (selections: CharacterSelections) => void;
  options: CharacterOption[];
  onRandomize?: () => void;
}

type Section = "style" | "age" | "face" | "body";
const SECTION_LABELS: Record<Section, string> = {
  style: "Graphic Style",
  age: "Age and Ethnicity",
  face: "Face and Hair",
  body: "Body type",
};
const SECTIONS: Section[] = ["style", "age", "face", "body"];

const EYE_COLORS = [
  { name: "Blue", color: "#4A90D9" },
  { name: "Brown", color: "#8B4513" },
  { name: "Green", color: "#228B22" },
  { name: "Gray", color: "#808080" },
  { name: "Violet", color: "#8B008B" },
  { name: "Red", color: "#DC143C" },
  { name: "Black", color: "#1a1a1a" },
  { name: "Turquoise", color: "#40E0D0" },
  { name: "Orange", color: "#FF8C00" },
  { name: "Pink", color: "#FF69B4" },
  { name: "Yellow", color: "#FFD700" },
  { name: "White", color: "#E8E8E8" },
  { name: "Heterochromia", color: "linear-gradient(135deg, #4A90D9 50%, #228B22 50%)" },
  { name: "Multicolor", color: "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" },
];

const EYE_FEATURES = ["Normal", "Vertical pupils", "Long eyelashes", "Heart-shaped pupils", "Glowing", "Empty", "Sparkling", "Tsurime", "Tareme", "Through hair"];
const FACE_FEATURES = ["None", "Freckles", "Moles", "Mole under the eye", "Nose piercing", "Lip piercing", "Eyebrow piercing", "Face tattoo", "Facial scar", "Glasses", "Dimples", "Beauty mark", "Face paint", "Sharp jawline", "Soft features", "High cheekbones", "Full lips", "Thin lips"];
const HAIR_LENGTHS = ["Short", "Medium", "Long", "Very Long"];
const HAIR_COLORS = [
  { name: "Black", color: "#1a1a1a" },
  { name: "Dark brown", color: "#3B1F0F" },
  { name: "Brown", color: "#6B3A2A" },
  { name: "Light brown", color: "#A0704A" },
  { name: "Blonde", color: "#F5DEB3" },
  { name: "Platinum", color: "#E5E4E2" },
  { name: "Ginger", color: "#B5451B" },
  { name: "Red", color: "#DC143C" },
  { name: "Silver", color: "#C0C0C0" },
  { name: "White", color: "#F5F5F5" },
  { name: "Pink", color: "#FF69B4" },
  { name: "Purple", color: "#8B008B" },
  { name: "Blue", color: "#4169E1" },
  { name: "Green", color: "#228B22" },
  { name: "Ombre", color: "linear-gradient(135deg, #1a1a1a 40%, #F5DEB3 100%)" },
  { name: "Multicolor", color: "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" },
];
const GENDERS = ["Female", "Male", "Femboy", "Non-binary"];
const HEIGHTS = ["Short", "Below Average", "Average", "Tall", "Very Tall"];

export default function CharacterModal({ open, onClose, selections, onSave, options, onRandomize }: Props) {
  const [draft, setDraft] = useState<CharacterSelections>({ ...selections });
  const [raceSubTab, setRaceSubTab] = useState<"human" | "fantasy">("human");
  const [activeSection, setActiveSection] = useState<Section>("style");

  const sectionRefs = {
    style: useRef<HTMLDivElement>(null),
    age: useRef<HTMLDivElement>(null),
    face: useRef<HTMLDivElement>(null),
    body: useRef<HTMLDivElement>(null),
  };
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let closest: Section = "style";
      let closestDist = Infinity;
      for (const s of SECTIONS) {
        const el = sectionRefs[s].current;
        if (!el) continue;
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < closestDist) { closestDist = dist; closest = s; }
      }
      setActiveSection(closest);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  });

  if (!open) return null;

  const byCategory = (cat: string) => options.filter((o) => o.category === cat).sort((a, b) => a.order - b.order);

  const toggle = (arr: string[], val: string): string[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const scrollTo = (section: Section) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Character</span>
          <div style={styles.headerActions}>
            <button style={styles.closeBtn} onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Body: sidebar + content */}
        <div style={styles.body}>
          {/* Sidebar */}
          <div style={styles.sidebar}>
            <nav style={styles.sidebarNav}>
              {SECTIONS.map((s) => (
                <button key={s} style={{ ...styles.sidebarItem, ...(activeSection === s ? styles.sidebarItemActive : {}) }} onClick={() => scrollTo(s)}>
                  {SECTION_LABELS[s]}
                </button>
              ))}
            </nav>
            <div style={styles.sidebarDivider} />
            <button style={styles.sidebarGenerate} onClick={onRandomize}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              Generate Random
            </button>
          </div>

          {/* Scrollable content */}
          <div style={styles.content} ref={contentRef}>
            {/* ── Graphic Style ── */}
            <div ref={sectionRefs.style} style={styles.section}>
              <div style={styles.sectionTitle}>Graphic Style</div>
              <div style={styles.imageGrid}>
                {byCategory("STYLE").map((opt) => (
                  <button key={opt.id} style={{ ...styles.imgCard, ...(draft.style === opt.name ? styles.imgCardActive : {}) }} onClick={() => setDraft({ ...draft, style: opt.name })}>
                    {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                    <span style={styles.imgCardLabel}>{opt.name}</span>
                  </button>
                ))}
                {byCategory("STYLE").length === 0 && <div style={styles.emptyHint}>No styles added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Age and Ethnicity ── */}
            <div ref={sectionRefs.age} style={styles.section}>
              <div style={styles.sectionTitle}>Age and Ethnicity</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={styles.sectionLabel}>Age</div>
                  <div style={{ position: "relative", padding: "8px 0" }}>
                    <div style={{ ...styles.sliderTooltip, left: `${((draft.age - 18) / 82) * 100}%` }}>{draft.age}</div>
                    <input
                      type="range" min={18} max={100} value={draft.age}
                      onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) })}
                      style={styles.slider}
                    />
                    <div style={styles.sliderLabels}><span>18</span><span>100</span></div>
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Gender</div>
                  <div style={styles.pillRow}>
                    {GENDERS.map((g) => (
                      <button key={g} style={{ ...styles.pill, ...(draft.gender === g ? styles.pillActive : {}) }} onClick={() => setDraft({ ...draft, gender: draft.gender === g ? undefined : g })}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={styles.raceTabRow}>
                    <button style={{ ...styles.raceTab, ...(raceSubTab === "human" ? styles.raceTabActive : {}) }} onClick={() => setRaceSubTab("human")}>Human Race</button>
                    <button style={{ ...styles.raceTab, ...(raceSubTab === "fantasy" ? styles.raceTabActive : {}) }} onClick={() => setRaceSubTab("fantasy")}>Fantasy Race</button>
                  </div>
                  <div style={styles.imageRowScroll}>
                    {byCategory(raceSubTab === "human" ? "HUMAN_RACE" : "FANTASY_RACE").map((opt) => {
                      const selected = raceSubTab === "human" ? draft.humanRace === opt.name : draft.fantasyRace === opt.name;
                      return (
                        <button key={opt.id} style={{ ...styles.imgCardSm, ...(selected ? styles.imgCardActive : {}) }} onClick={() => {
                          if (raceSubTab === "human") setDraft({ ...draft, humanRace: draft.humanRace === opt.name ? undefined : opt.name });
                          else setDraft({ ...draft, fantasyRace: draft.fantasyRace === opt.name ? undefined : opt.name });
                        }}>
                          {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                          <span style={styles.imgCardLabel}>{opt.name}</span>
                        </button>
                      );
                    })}
                    {byCategory(raceSubTab === "human" ? "HUMAN_RACE" : "FANTASY_RACE").length === 0 && (
                      <div style={styles.emptyHint}>No options added yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Face and Hair ── */}
            <div ref={sectionRefs.face} style={styles.section}>
              <div style={styles.sectionTitle}>Face and Hair</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={styles.sectionLabel}>Eye Color</div>
                  <div style={styles.colorPillRow}>
                    {EYE_COLORS.map((ec) => (
                      <button key={ec.name} style={{ ...styles.colorPill, ...(draft.eyeColor === ec.name ? styles.colorPillActive : {}) }} onClick={() => setDraft({ ...draft, eyeColor: draft.eyeColor === ec.name ? undefined : ec.name })}>
                        <span style={{ ...styles.colorDot, background: ec.color }} />
                        {ec.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Eye Features</div>
                  <div style={styles.pillRow}>
                    {EYE_FEATURES.map((f) => (
                      <button key={f} style={{ ...styles.pill, ...(draft.eyeFeatures.includes(f) ? styles.pillActive : {}) }} onClick={() => setDraft({ ...draft, eyeFeatures: toggle(draft.eyeFeatures, f) })}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Face Features</div>
                  <div style={styles.pillRow}>
                    {FACE_FEATURES.map((f) => (
                      <button key={f} style={{ ...styles.pill, ...(draft.faceFeatures.includes(f) ? styles.pillActive : {}) }} onClick={() => setDraft({ ...draft, faceFeatures: toggle(draft.faceFeatures, f) })}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Hair Style</div>
                  <div style={styles.imageRowScroll}>
                    {byCategory("HAIR_STYLE").map((opt) => (
                      <button key={opt.id} style={{ ...styles.imgCardSm, ...(draft.hairStyle === opt.name ? styles.imgCardActive : {}) }} onClick={() => setDraft({ ...draft, hairStyle: draft.hairStyle === opt.name ? undefined : opt.name })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                        <span style={styles.imgCardLabel}>{opt.name}</span>
                      </button>
                    ))}
                    {byCategory("HAIR_STYLE").length === 0 && <div style={styles.emptyHint}>No hair styles added yet.</div>}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Hair Length</div>
                  <div style={styles.pillRow}>
                    {HAIR_LENGTHS.map((l) => (
                      <button key={l} style={{ ...styles.pill, ...(draft.hairLength === l ? styles.pillActive : {}) }} onClick={() => setDraft({ ...draft, hairLength: draft.hairLength === l ? undefined : l })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Hair Color</div>
                  <div style={styles.colorPillRow}>
                    {HAIR_COLORS.map((hc) => (
                      <button key={hc.name} style={{ ...styles.colorPill, ...(draft.hairColor === hc.name ? styles.colorPillActive : {}) }} onClick={() => setDraft({ ...draft, hairColor: draft.hairColor === hc.name ? undefined : hc.name })}>
                        <span style={{ ...styles.colorDot, background: hc.color }} />
                        {hc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body type ── */}
            <div ref={sectionRefs.body} style={styles.section}>
              <div style={styles.sectionTitle}>Body type</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={styles.sectionLabel}>Body type</div>
                  <div style={styles.imageRowScroll}>
                    {byCategory("BODY_TYPE").map((opt) => (
                      <button key={opt.id} style={{ ...styles.imgCardSm, ...(draft.bodyType === opt.name ? styles.imgCardActive : {}) }} onClick={() => setDraft({ ...draft, bodyType: draft.bodyType === opt.name ? undefined : opt.name })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                        <span style={styles.imgCardLabel}>{opt.name}</span>
                      </button>
                    ))}
                    {byCategory("BODY_TYPE").length === 0 && <div style={styles.emptyHint}>No body types added yet.</div>}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Breast size</div>
                  <div style={styles.imageRowScroll}>
                    {byCategory("BREAST_SIZE").map((opt) => (
                      <button key={opt.id} style={{ ...styles.imgCardSm, ...(draft.breastSize === opt.name ? styles.imgCardActive : {}) }} onClick={() => setDraft({ ...draft, breastSize: draft.breastSize === opt.name ? undefined : opt.name })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                        <span style={styles.imgCardLabel}>{opt.name}</span>
                      </button>
                    ))}
                    {byCategory("BREAST_SIZE").length === 0 && <div style={styles.emptyHint}>No breast sizes added yet.</div>}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Butt size</div>
                  <div style={styles.imageRowScroll}>
                    {byCategory("BUTT_SIZE").map((opt) => (
                      <button key={opt.id} style={{ ...styles.imgCardSm, ...(draft.buttSize === opt.name ? styles.imgCardActive : {}) }} onClick={() => setDraft({ ...draft, buttSize: draft.buttSize === opt.name ? undefined : opt.name })}>
                        {opt.imageUrl && <img src={opt.imageUrl} alt={opt.name} style={styles.imgCardImg} />}
                        <span style={styles.imgCardLabel}>{opt.name}</span>
                      </button>
                    ))}
                    {byCategory("BUTT_SIZE").length === 0 && <div style={styles.emptyHint}>No butt sizes added yet.</div>}
                  </div>
                </div>

                <div>
                  <div style={styles.sectionLabel}>Height</div>
                  <div style={styles.pillRow}>
                    {HEIGHTS.map((h) => (
                      <button key={h} style={{ ...styles.pill, ...(draft.height === h ? styles.pillActive : {}) }} onClick={() => setDraft({ ...draft, height: draft.height === h ? undefined : h })}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>

      <style>{`
        input[type=range] {
          -webkit-appearance: none;
          width: 100%;
          height: 4px;
          background: linear-gradient(to right, #f95bad ${((draft.age - 18) / 82) * 100}%, #3a3a3a ${((draft.age - 18) / 82) * 100}%);
          border-radius: 2px;
          outline: none;
          cursor: pointer;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #f95bad;
          cursor: pointer;
        }
        .char-modal-scroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    width: "min(960px, 95vw)",
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
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    background: "#151515",
    borderRight: "1px solid #2a2a2a",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
  },
  sidebarNav: {
    display: "flex",
    flexDirection: "column",
  },
  sidebarItem: {
    display: "flex",
    alignItems: "center",
    padding: "12px 20px",
    background: "transparent",
    border: "none",
    borderLeft: "3px solid transparent",
    color: "#888",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.15s",
  },
  sidebarItemActive: {
    color: "#f95bad",
    borderLeft: "3px solid #f95bad",
    background: "rgba(249,91,173,0.06)",
  },
  sidebarDivider: {
    height: 1,
    background: "#2a2a2a",
    margin: "12px 16px",
  },
  sidebarGenerate: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 20px",
    background: "transparent",
    border: "none",
    color: "#C1F0AA",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "left" as const,
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: "1px solid #2a2a2a",
  },
  sectionLabel: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  imageGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  imageRowScroll: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 4,
    scrollbarWidth: "none" as const,
    msOverflowStyle: "none" as const,
  },
  imgCard: {
    position: "relative",
    aspectRatio: "3/4",
    borderRadius: 10,
    overflow: "hidden",
    border: "2px solid #2a2a2a",
    cursor: "pointer",
    background: "#1a1a1a",
    padding: 0,
  },
  imgCardSm: {
    position: "relative",
    width: 130,
    minWidth: 130,
    height: 170,
    borderRadius: 10,
    overflow: "hidden",
    border: "2px solid #2a2a2a",
    cursor: "pointer",
    background: "#1a1a1a",
    padding: 0,
    flexShrink: 0,
  },
  imgCardActive: {
    border: "2px solid #f95bad",
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
  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  pill: {
    padding: "6px 14px",
    borderRadius: 8,
    border: "1px solid #3a3a3a",
    background: "#1a1a1a",
    color: "#ccc",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  pillActive: {
    border: "1px solid #f95bad",
    background: "rgba(249,91,173,0.12)",
    color: "#f95bad",
  },
  colorPillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
  },
  colorPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #3a3a3a",
    background: "#1a1a1a",
    color: "#ccc",
    fontSize: 13,
    cursor: "pointer",
  },
  colorPillActive: {
    border: "1px solid #f95bad",
    background: "rgba(249,91,173,0.12)",
    color: "#f95bad",
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.15)",
  },
  sliderTooltip: {
    position: "absolute",
    top: -8,
    transform: "translateX(-50%)",
    background: "#f95bad",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 6,
    pointerEvents: "none" as const,
    zIndex: 1,
  },
  slider: {
    width: "100%",
    marginTop: 12,
  },
  sliderLabels: {
    display: "flex",
    justifyContent: "space-between",
    color: "#666",
    fontSize: 12,
    marginTop: 4,
  },
  raceTabRow: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #2a2a2a",
    marginBottom: 14,
  },
  raceTab: {
    padding: "8px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#888",
    fontSize: 13,
    cursor: "pointer",
  },
  raceTabActive: {
    color: "#fff",
    borderBottom: "2px solid #f95bad",
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
  },
};
