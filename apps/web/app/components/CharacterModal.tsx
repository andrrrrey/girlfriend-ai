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

export const EYE_COLORS = [
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

export const EYE_FEATURES = ["Normal", "Vertical pupils", "Long eyelashes", "Heart-shaped pupils", "Glowing", "Empty", "Sparkling", "Tsurime", "Tareme", "Through hair"];
export const FACE_FEATURES = ["None", "Freckles", "Moles", "Mole under the eye", "Nose piercing", "Lip piercing", "Eyebrow piercing", "Face tattoo", "Facial scar", "Glasses", "Dimples", "Beauty mark", "Face paint", "Sharp jawline", "Soft features", "High cheekbones", "Full lips", "Thin lips"];
export const HAIR_LENGTHS = ["Short", "Medium", "Long", "Very Long"];
export const HAIR_COLORS = [
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
export const GENDERS = ["Female", "Male", "Femboy", "Non-binary"];
export const HEIGHTS = ["Short", "Below Average", "Average", "Tall", "Very Tall"];

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

export default function CharacterModal({ open, onClose, selections, onSave, options, onRandomize }: Props) {
  const [draft, setDraft] = useState<CharacterSelections>({ ...selections });
  const [activeId, setActiveId] = useState<string>("style");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft({ ...selections });
  }, [selections]);

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

  const byCategory = (cat: string) => options.filter((o) => o.category === cat).sort((a, b) => a.order - b.order);

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  type SidebarEntry = { type: "header"; label: string } | { type: "item"; id: string; label: string };
  const sidebarItems: SidebarEntry[] = [
    { type: "item", id: "style", label: "Graphic Style" },
    { type: "header", label: "Character" },
    { type: "item", id: "age-gender", label: "Age & Gender" },
    { type: "item", id: "human-race", label: "Human Race" },
    { type: "item", id: "fantasy-race", label: "Fantasy Race" },
    { type: "header", label: "Face & Hair" },
    { type: "item", id: "eyes-face", label: "Eyes & Face" },
    { type: "item", id: "hair-style", label: "Hair Style" },
    { type: "item", id: "hair-details", label: "Hair Details" },
    { type: "header", label: "Body" },
    { type: "item", id: "body-type", label: "Body Type" },
    { type: "item", id: "breast-size", label: "Breast Size" },
    { type: "item", id: "butt-size", label: "Butt Size" },
  ];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="char-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Character</span>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={s.body}>
          <div style={s.sidebar}>
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
            <button style={s.sidebarGenerate} onClick={onRandomize}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              Generate Random
            </button>
          </div>

          <div style={s.content} ref={contentRef}>
            {/* ── Graphic Style ── */}
            <div data-section-id="style" style={s.section}>
              <div style={s.sectionTitle}>Graphic Style</div>
              <div style={s.imageGrid}>
                {byCategory("STYLE").map((opt) => {
                  const selected = draft.style === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, style: opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("STYLE").length === 0 && <div style={s.emptyHint}>No styles added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Age & Gender ── */}
            <div data-section-id="age-gender" style={s.section}>
              <div style={s.sectionTitle}>Age & Gender</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div style={s.sectionLabel}>Age</div>
                  <div style={{ position: "relative", padding: "8px 0" }}>
                    <div style={{ ...s.sliderTooltip, left: `${((draft.age - 18) / 82) * 100}%` }}>{draft.age}</div>
                    <input
                      type="range" min={18} max={100} value={draft.age}
                      onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) })}
                      style={s.slider}
                    />
                    <div style={s.sliderLabels}><span>18</span><span>100</span></div>
                  </div>
                </div>

                <div>
                  <div style={s.sectionLabel}>Gender</div>
                  <div style={s.pillRow}>
                    {GENDERS.map((g) => (
                      <button key={g} style={{ ...s.pill, ...(draft.gender === g ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, gender: draft.gender === g ? undefined : g })}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={s.sectionLabel}>Height</div>
                  <div style={s.pillRow}>
                    {HEIGHTS.map((h) => (
                      <button key={h} style={{ ...s.pill, ...(draft.height === h ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, height: draft.height === h ? undefined : h })}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Human Race ── */}
            <div data-section-id="human-race" style={s.section}>
              <div style={s.sectionTitle}>Human Race</div>
              <div style={s.imageGrid}>
                {byCategory("HUMAN_RACE").map((opt) => {
                  const selected = draft.humanRace === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, humanRace: draft.humanRace === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("HUMAN_RACE").length === 0 && <div style={s.emptyHint}>No human races added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Fantasy Race ── */}
            <div data-section-id="fantasy-race" style={s.section}>
              <div style={s.sectionTitle}>Fantasy Race</div>
              <div style={s.imageGrid}>
                {byCategory("FANTASY_RACE").map((opt) => {
                  const selected = draft.fantasyRace === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, fantasyRace: draft.fantasyRace === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("FANTASY_RACE").length === 0 && <div style={s.emptyHint}>No fantasy races added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Eyes & Face ── */}
            <div data-section-id="eyes-face" style={s.section}>
              <div style={s.sectionTitle}>Eyes & Face</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={s.sectionLabel}>Eye Color</div>
                  <div style={s.colorPillRow}>
                    {EYE_COLORS.map((ec) => (
                      <button key={ec.name} style={{ ...s.colorPill, ...(draft.eyeColor === ec.name ? s.colorPillActive : {}) }} onClick={() => setDraft({ ...draft, eyeColor: draft.eyeColor === ec.name ? undefined : ec.name })}>
                        <span style={{ ...s.colorDot, background: ec.color }} />
                        {ec.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={s.sectionLabel}>Eye Features</div>
                  <div style={s.pillRow}>
                    {EYE_FEATURES.map((f) => (
                      <button key={f} style={{ ...s.pill, ...(draft.eyeFeatures.includes(f) ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, eyeFeatures: toggle(draft.eyeFeatures, f) })}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={s.sectionLabel}>Face Features</div>
                  <div style={s.pillRow}>
                    {FACE_FEATURES.map((f) => (
                      <button key={f} style={{ ...s.pill, ...(draft.faceFeatures.includes(f) ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, faceFeatures: toggle(draft.faceFeatures, f) })}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Hair Style ── */}
            <div data-section-id="hair-style" style={s.section}>
              <div style={s.sectionTitle}>Hair Style</div>
              <div style={s.imageGrid}>
                {byCategory("HAIR_STYLE").map((opt) => {
                  const selected = draft.hairStyle === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, hairStyle: draft.hairStyle === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("HAIR_STYLE").length === 0 && <div style={s.emptyHint}>No hair styles added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Hair Details ── */}
            <div data-section-id="hair-details" style={s.section}>
              <div style={s.sectionTitle}>Hair Details</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <div style={s.sectionLabel}>Hair Length</div>
                  <div style={s.pillRow}>
                    {HAIR_LENGTHS.map((l) => (
                      <button key={l} style={{ ...s.pill, ...(draft.hairLength === l ? s.pillActive : {}) }} onClick={() => setDraft({ ...draft, hairLength: draft.hairLength === l ? undefined : l })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={s.sectionLabel}>Hair Color</div>
                  <div style={s.colorPillRow}>
                    {HAIR_COLORS.map((hc) => (
                      <button key={hc.name} style={{ ...s.colorPill, ...(draft.hairColor === hc.name ? s.colorPillActive : {}) }} onClick={() => setDraft({ ...draft, hairColor: draft.hairColor === hc.name ? undefined : hc.name })}>
                        <span style={{ ...s.colorDot, background: hc.color }} />
                        {hc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body Type ── */}
            <div data-section-id="body-type" style={s.section}>
              <div style={s.sectionTitle}>Body Type</div>
              <div style={s.imageGrid}>
                {byCategory("BODY_TYPE").map((opt) => {
                  const selected = draft.bodyType === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, bodyType: draft.bodyType === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("BODY_TYPE").length === 0 && <div style={s.emptyHint}>No body types added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Breast Size ── */}
            <div data-section-id="breast-size" style={s.section}>
              <div style={s.sectionTitle}>Breast Size</div>
              <div style={s.imageGrid}>
                {byCategory("BREAST_SIZE").map((opt) => {
                  const selected = draft.breastSize === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, breastSize: draft.breastSize === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("BREAST_SIZE").length === 0 && <div style={s.emptyHint}>No breast sizes added yet. Add them in the admin panel.</div>}
              </div>
            </div>

            {/* ── Butt Size ── */}
            <div data-section-id="butt-size" style={s.section}>
              <div style={s.sectionTitle}>Butt Size</div>
              <div style={s.imageGrid}>
                {byCategory("BUTT_SIZE").map((opt) => {
                  const selected = draft.buttSize === opt.name;
                  return (
                    <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, buttSize: draft.buttSize === opt.name ? undefined : opt.name })}>
                      {(opt.imageThumbUrl || opt.imageUrl) && <img src={opt.imageThumbUrl || opt.imageUrl || ""} alt={opt.name} style={s.imgCardImg} loading="lazy" decoding="async" />}
                      {selected && <SelectedOverlay />}
                      <span style={s.imgCardLabel}>{opt.name}</span>
                    </button>
                  );
                })}
                {byCategory("BUTT_SIZE").length === 0 && <div style={s.emptyHint}>No butt sizes added yet. Add them in the admin panel.</div>}
              </div>
            </div>
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft); onClose(); }}>Save</button>
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
        .char-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
        .char-modal *::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .char-modal *::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 3px; }
        .char-modal *::-webkit-scrollbar-thumb:hover { background: #ff7cc8; }
        .char-modal { scrollbar-color: #f95bad #1a1a1a; scrollbar-width: thin; }
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
  sectionLabel: { color: "#aaa", fontSize: 13, fontWeight: 600, marginBottom: 10 },
  imageGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  imgCard: { position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#1a1a1a", padding: 0 },
  imgCardSelected: { border: "2px solid #555" },
  imgCardUnselected: { border: "2px solid #2a2a2a" },
  imgCardImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  imgCardLabel: { position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center" as const, color: "#fff", fontSize: 13, fontWeight: 600, textShadow: "0 1px 4px rgba(0,0,0,0.8)", zIndex: 2 },
  pillRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  pill: { padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  pillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  colorPillRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  colorPill: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: "1px solid #3a3a3a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  colorPillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  colorDot: { width: 14, height: 14, borderRadius: "50%", flexShrink: 0, border: "1px solid rgba(255,255,255,0.15)" },
  sliderTooltip: { position: "absolute", top: -8, transform: "translateX(-50%)", background: "#f95bad", color: "#fff", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6, pointerEvents: "none" as const, zIndex: 1 },
  slider: { width: "100%", marginTop: 12 },
  sliderLabels: { display: "flex", justifyContent: "space-between", color: "#666", fontSize: 12, marginTop: 4 },
  emptyHint: { color: "#555", fontSize: 13, padding: "20px 0" },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
