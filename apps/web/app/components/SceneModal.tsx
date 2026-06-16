"use client";

import React, { useState, useRef, useEffect } from "react";
import type { SceneCategory, SceneOptionsResponse } from "../../lib/api";
import { useT } from "../../context/language";
import { localizeOption } from "../../lib/optionLabel";
import type { TKey } from "../../lib/i18n";

const ATMOSPHERE_LABEL_KEYS: Record<string, TKey> = {
  timeOfDay: "gen.timeOfDay",
  weather: "gen.weather",
  particles: "gen.particles",
  environmentEffects: "gen.environmentEffects",
};

export interface SceneSelections {
  locations: string[];
  timeOfDay: string[];
  weather: string[];
  particles: string[];
  environmentEffects: string[];
  props: string;
}

export const DEFAULT_SCENE_SELECTIONS: SceneSelections = {
  locations: [],
  timeOfDay: [],
  weather: [],
  particles: [],
  environmentEffects: [],
  props: "",
};

interface Props {
  open: boolean;
  onClose: () => void;
  selections: SceneSelections;
  onSave: (selections: SceneSelections) => void;
  options: SceneOptionsResponse;
}

export const ATMOSPHERE_SECTIONS = [
  { key: "timeOfDay" as const, label: "Time of Day", options: ["Sunrise", "Morning", "Daylight", "Strong Sun", "Golden Hour", "Sunset", "Night", "Moonlight"] },
  { key: "weather" as const, label: "Weather", options: ["Clear sky", "Overcast", "Light rain", "Heavy rain", "Thunderstorm", "Light snow", "Blizzard", "Fog", "Strong wind", "Rainbow", "Aurora / Northern lights", "Heat", "Frost"] },
  { key: "particles" as const, label: "Particles", options: ["Sakura petals", "Falling leaves", "Fireflies", "Flying sparks", "Magic sparkles", "Dust in light", "Soap bubbles", "Ash", "Confetti", "Falling feathers"] },
  { key: "environmentEffects" as const, label: "Environment Effects", options: ["Smoke", "Steam", "Wet surfaces", "God rays", "Volumetric fog", "Sun glare", "Neon glow", "Bioluminescence"] },
];

type AtmosphereKey = "timeOfDay" | "weather" | "particles" | "environmentEffects";

const toggle = (arr: string[], val: string): string[] =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

function SelectedOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 1 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f95bad", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </div>
  );
}

export default function SceneModal({ open, onClose, selections, onSave, options }: Props) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<SceneSelections>({
    locations: [...selections.locations],
    timeOfDay: [...selections.timeOfDay],
    weather: [...selections.weather],
    particles: [...selections.particles],
    environmentEffects: [...selections.environmentEffects],
    props: selections.props,
  });
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    setDraft({
      locations: [...selections.locations],
      timeOfDay: [...selections.timeOfDay],
      weather: [...selections.weather],
      particles: [...selections.particles],
      environmentEffects: [...selections.environmentEffects],
      props: selections.props,
    });
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

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRandom = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const allLocations = options.LOCATION.flatMap((c) => c.options);
    setDraft({
      locations: allLocations.length ? [pick(allLocations).name] : [],
      timeOfDay: [pick(ATMOSPHERE_SECTIONS[0].options)],
      weather: [pick(ATMOSPHERE_SECTIONS[1].options)],
      particles: [pick(ATMOSPHERE_SECTIONS[2].options)],
      environmentEffects: [pick(ATMOSPHERE_SECTIONS[3].options)],
      props: "",
    });
  };

  const toggleAtmosphere = (key: AtmosphereKey, val: string) => {
    setDraft({ ...draft, [key]: toggle(draft[key] as string[], val) });
  };

  type SidebarEntry = { type: "header"; label: string } | { type: "item"; id: string; label: string };
  const sidebarItems: SidebarEntry[] = [];
  if (options.LOCATION.length > 0) {
    sidebarItems.push({ type: "header", label: t("gen.location") });
    options.LOCATION.forEach((cat) => sidebarItems.push({ type: "item", id: `location-${cat.id}`, label: localizeOption(cat.name, lang) }));
  }
  sidebarItems.push({ type: "item", id: "atmosphere", label: t("gen.atmosphere") });

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="scene-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>{t("gen.titleScene")}</span>
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
            <button style={s.sidebarGenerate} onClick={handleRandom}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              {t("gen.generateRandom")}
            </button>
          </div>

          <div style={s.content} ref={contentRef}>
            {/* Location categories */}
            {options.LOCATION.map((cat) => (
              <div key={cat.id} data-section-id={`location-${cat.id}`} style={s.section}>
                <div style={s.sectionTitle}>{localizeOption(cat.name, lang)}</div>
                <div style={s.imageGrid}>
                  {cat.options.map((opt) => {
                    const selected = draft.locations.includes(opt.name);
                    return (
                      <button key={opt.id} style={{ ...s.imgCard, ...(selected ? s.imgCardSelected : s.imgCardUnselected) }} onClick={() => setDraft({ ...draft, locations: toggle(draft.locations, opt.name) })}>
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
            {options.LOCATION.length === 0 && (
              <div style={s.section}><div style={s.sectionTitle}>{t("gen.location")}</div><div style={s.emptyHint}>{t("gen.noLocations")}</div></div>
            )}

            {/* Atmosphere */}
            <div data-section-id="atmosphere" style={s.section}>
              <div style={s.sectionTitle}>{t("gen.atmosphere")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {ATMOSPHERE_SECTIONS.map((sec) => (
                  <div key={sec.key}>
                    <div style={s.sectionLabel}>{ATMOSPHERE_LABEL_KEYS[sec.key] ? t(ATMOSPHERE_LABEL_KEYS[sec.key]) : sec.label}</div>
                    <div style={s.pillRow}>
                      {sec.options.map((opt) => {
                        const selected = (draft[sec.key] as string[]).includes(opt);
                        return (
                          <button key={opt} style={{ ...s.pill, ...(selected ? s.pillActive : {}) }} onClick={() => toggleAtmosphere(sec.key, opt)}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div>
                  <div style={s.sectionLabel}>{t("gen.props")}</div>
                  <textarea style={s.propsTextarea} placeholder={t("gen.propsPlaceholder")} value={draft.props} onChange={(e) => setDraft({ ...draft, props: e.target.value })} rows={4} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.cancelBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button style={s.saveBtn} onClick={() => { onSave(draft); onClose(); }}>{t("common.save")}</button>
        </div>
      </div>

      <style>{`
        .scene-modal *::-webkit-scrollbar { width: 6px; height: 6px; }
        .scene-modal *::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .scene-modal *::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 3px; }
        .scene-modal *::-webkit-scrollbar-thumb:hover { background: #ff7cc8; }
        .scene-modal { scrollbar-color: #f95bad #1a1a1a; scrollbar-width: thin; }
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
  sectionLabel: { color: "#aaa", fontSize: 13, fontWeight: 600, marginBottom: 10 },
  pillRow: { display: "flex", flexWrap: "wrap" as const, gap: 8 },
  pill: { padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  pillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  propsTextarea: { width: "100%", padding: "12px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const, minHeight: 100 },
  emptyHint: { color: "#555", fontSize: 13, padding: "20px 0" },
  footer: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  cancelBtn: { flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
