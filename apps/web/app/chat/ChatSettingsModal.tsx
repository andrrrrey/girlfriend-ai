"use client";

import React, { useEffect, useRef, useState } from "react";
import { useT } from "../../context/language";
import { ApiError, getVoices, type Voice } from "../../lib/api";
import type { TKey } from "../../lib/i18n";
import {
  CHAT_ARCHETYPES,
  CHAT_HOBBIES,
  CHAT_LIKES,
  CHAT_OCCUPATIONS,
  CHAT_RELATIONSHIPS,
  EMOJI_LEVELS,
  JEALOUSY_LEVELS,
  LIMITS,
  MEETING_SCENARIOS,
  MESSAGE_LENGTHS,
  SLIDER_KEYS,
  SWEARING_LEVELS,
  VOICE_MODES,
  chatSettingsApi,
  optionLabel,
  type ChatSettings,
} from "../../lib/chatSettings";

interface Props {
  open: boolean;
  onClose: () => void;
  chatId: string;
  characterName: string;
  /** Текущие сохранённые настройки чата. */
  settings: ChatSettings;
  /** 18+ доступен: у пользователя включён NSFW и он подтвердил возраст. */
  nsfwAllowed: boolean;
  onSaved: (settings: ChatSettings) => void;
}

/** «Настройки чата»: персонаж меняется только в этом чате пользователя. */
export default function ChatSettingsModal({ open, onClose, chatId, characterName, settings, nsfwAllowed, onSaved }: Props) {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<ChatSettings>(settings);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [idea, setIdea] = useState("");
  const [assisting, setAssisting] = useState(false);
  const [customHobby, setCustomHobby] = useState("");
  const [newBoundary, setNewBoundary] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setError("");
    setIdea("");
    getVoices().then((v) => setVoices(v.filter((x) => x.isActive))).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      audioRef.current?.pause();
    };
  }, [open, settings, onClose]);

  if (!open) return null;

  const set = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleIn = (list: string[] | undefined, v: string) => (list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v];
  const occupationPreset = !!draft.occupation && (CHAT_OCCUPATIONS as readonly string[]).includes(draft.occupation);

  const errorText = (err: unknown): string => {
    if (err instanceof ApiError) {
      const code = err.body?.error;
      if (code === "PROMPT_FORBIDDEN") {
        return err.body?.match ? t("cs.errForbiddenMatch", { match: String(err.body.match) }) : t("cs.errForbidden");
      }
      if (code === "MODERATION_UNAVAILABLE") return t("cs.errModeration");
    }
    return t("cs.errGeneric");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await chatSettingsApi.save(chatId, draft);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(t("cs.resetConfirm"))) return;
    setSaving(true);
    setError("");
    try {
      await chatSettingsApi.reset(chatId);
      onSaved({});
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAssist = async () => {
    if (!idea.trim()) return;
    setAssisting(true);
    setError("");
    try {
      const { backstory } = await chatSettingsApi.assistBackstory(chatId, idea, lang);
      set("backstory", backstory);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAssisting(false);
    }
  };

  const playSample = async (voiceId: string) => {
    audioRef.current?.pause();
    if (playing === voiceId) { setPlaying(null); return; }
    setPlaying(voiceId);
    try {
      const url = await chatSettingsApi.voiceSample(voiceId, lang);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      await audio.play();
    } catch {
      setPlaying(null);
    }
  };

  const pills = <T extends string>(
    values: readonly T[],
    isActive: (v: T) => boolean,
    onClick: (v: T) => void,
    label: (v: T) => string,
  ) => (
    <div style={s.pills}>
      {values.map((v) => (
        <button key={v} type="button" style={isActive(v) ? { ...s.pill, ...s.pillActive } : s.pill} onClick={() => onClick(v)} aria-pressed={isActive(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );

  const section = (titleKey: TKey, hintKey: TKey | null, body: React.ReactNode) => (
    <section style={s.section}>
      <div style={s.sectionTitle}>{t(titleKey)}</div>
      {hintKey && <div style={s.hint}>{t(hintKey)}</div>}
      {body}
    </section>
  );

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={t("cs.title")}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div>
            <div style={s.title}>{t("cs.title")}</div>
            <div style={s.subtitle}>{t("cs.subtitle", { name: characterName })}</div>
          </div>
          <button type="button" style={s.closeBtn} onClick={onClose} aria-label={t("common.cancel")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={s.body}>
          {section("cs.backstory", "cs.backstoryHint", (
            <>
              <textarea
                style={{ ...s.input, minHeight: 110, resize: "vertical" }}
                value={draft.backstory ?? ""}
                maxLength={LIMITS.backstory}
                onChange={(e) => set("backstory", e.target.value)}
                placeholder={t("cs.backstoryPlaceholder")}
              />
              <div style={s.counter}>{(draft.backstory ?? "").length}/{LIMITS.backstory}</div>
              <div style={s.row}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={idea}
                  maxLength={LIMITS.backstoryIdea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder={t("cs.ideaPlaceholder")}
                />
                <button type="button" style={s.ghostBtn} onClick={handleAssist} disabled={assisting || !idea.trim()}>
                  {assisting ? t("cs.assisting") : t("cs.assist")}
                </button>
              </div>
            </>
          ))}

          {section("cs.meeting", "cs.meetingHint", (
            <>
              {pills(
                [...MEETING_SCENARIOS, "custom"] as const,
                (v) => draft.meetingScenario === v,
                (v) => set("meetingScenario", draft.meetingScenario === v ? undefined : v),
                (v) => (v === "custom" ? t("cs.custom") : optionLabel(t, "scenario", v)),
              )}
              {draft.meetingScenario === "custom" && (
                <input
                  style={{ ...s.input, marginTop: 8 }}
                  value={draft.meetingCustom ?? ""}
                  maxLength={LIMITS.meetingCustom}
                  onChange={(e) => set("meetingCustom", e.target.value)}
                  placeholder={t("cs.meetingCustomPlaceholder")}
                />
              )}
            </>
          ))}

          {section("cs.occupation", "cs.occupationHint", (
            <>
              {pills(
                CHAT_OCCUPATIONS,
                (v) => draft.occupation === v,
                (v) => set("occupation", draft.occupation === v ? undefined : v),
                (v) => optionLabel(t, "occupation", v),
              )}
              <input
                style={{ ...s.input, marginTop: 8 }}
                value={occupationPreset ? "" : draft.occupation ?? ""}
                maxLength={LIMITS.occupation}
                onChange={(e) => set("occupation", e.target.value || undefined)}
                placeholder={t("cs.ownWord")}
              />
            </>
          ))}

          {section("cs.hobbies", "cs.hobbiesHint", (
            <>
              {pills(
                [...CHAT_HOBBIES, ...(draft.hobbies ?? []).filter((h) => !(CHAT_HOBBIES as readonly string[]).includes(h))],
                (v) => (draft.hobbies ?? []).includes(v),
                (v) => set("hobbies", toggleIn(draft.hobbies, v)),
                (v) => optionLabel(t, "hobby", v),
              )}
              <div style={{ ...s.row, marginTop: 8 }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={customHobby}
                  maxLength={LIMITS.hobby}
                  onChange={(e) => setCustomHobby(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customHobby.trim()) {
                      e.preventDefault();
                      set("hobbies", [...new Set([...(draft.hobbies ?? []), customHobby.trim()])].slice(0, LIMITS.hobbies));
                      setCustomHobby("");
                    }
                  }}
                  placeholder={t("cs.ownHobby")}
                />
                <button
                  type="button"
                  style={s.ghostBtn}
                  disabled={!customHobby.trim() || (draft.hobbies ?? []).length >= LIMITS.hobbies}
                  onClick={() => {
                    set("hobbies", [...new Set([...(draft.hobbies ?? []), customHobby.trim()])].slice(0, LIMITS.hobbies));
                    setCustomHobby("");
                  }}
                >
                  {t("cs.add")}
                </button>
              </div>
            </>
          ))}

          {section("cs.archetype", "cs.archetypeHint", pills(
            CHAT_ARCHETYPES,
            (v) => draft.archetype === v,
            (v) => set("archetype", draft.archetype === v ? undefined : v),
            (v) => optionLabel(t, "archetype", v),
          ))}

          {section("cs.relationship", "cs.relationshipHint", pills(
            CHAT_RELATIONSHIPS,
            (v) => draft.relationship === v,
            (v) => set("relationship", draft.relationship === v ? undefined : v),
            (v) => optionLabel(t, "relationship", v),
          ))}

          {section("cs.sliders", "cs.slidersHint", (
            <div style={s.sliders}>
              {SLIDER_KEYS.map((k) => (
                <label key={k} style={s.sliderRow}>
                  <span style={s.sliderEnd}>{t(`cs.slider.${k}.lo` as TKey)}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draft.sliders?.[k] ?? 50}
                    onChange={(e) => set("sliders", { ...draft.sliders, [k]: Number(e.target.value) })}
                    style={s.range}
                    aria-label={`${t(`cs.slider.${k}.lo` as TKey)} — ${t(`cs.slider.${k}.hi` as TKey)}`}
                  />
                  <span style={{ ...s.sliderEnd, textAlign: "right" }}>{t(`cs.slider.${k}.hi` as TKey)}</span>
                </label>
              ))}
              <div style={s.inline}>
                <span style={s.inlineLabel}>{t("cs.jealousy")}</span>
                {pills(
                  JEALOUSY_LEVELS,
                  (v) => draft.sliders?.jealousy === v,
                  (v) => set("sliders", { ...draft.sliders, jealousy: draft.sliders?.jealousy === v ? undefined : v }),
                  (v) => t(`cs.jealousy.${v}` as TKey),
                )}
              </div>
            </div>
          ))}

          {section("cs.style", null, (
            <div style={s.sliders}>
              <div style={s.inline}>
                <span style={s.inlineLabel}>{t("cs.length")}</span>
                {pills(MESSAGE_LENGTHS, (v) => draft.style?.length === v,
                  (v) => set("style", { ...draft.style, length: draft.style?.length === v ? undefined : v }),
                  (v) => t(`cs.length.${v}` as TKey))}
              </div>
              <div style={s.inline}>
                <span style={s.inlineLabel}>{t("cs.emoji")}</span>
                {pills(EMOJI_LEVELS, (v) => draft.style?.emoji === v,
                  (v) => set("style", { ...draft.style, emoji: draft.style?.emoji === v ? undefined : v }),
                  (v) => t(`cs.emoji.${v}` as TKey))}
              </div>
              <div style={s.inline}>
                <span style={s.inlineLabel}>{t("cs.swearing")}</span>
                {pills(SWEARING_LEVELS, (v) => draft.style?.swearing === v,
                  (v) => set("style", { ...draft.style, swearing: draft.style?.swearing === v ? undefined : v }),
                  (v) => t(`cs.swearing.${v}` as TKey))}
              </div>
              <div style={s.inline}>
                <span style={s.inlineLabel}>{t("cs.petName")}</span>
                <input
                  style={{ ...s.input, maxWidth: 260 }}
                  value={draft.style?.petName ?? ""}
                  maxLength={LIMITS.petName}
                  onChange={(e) => set("style", { ...draft.style, petName: e.target.value || undefined })}
                  placeholder={t("cs.petNamePlaceholder")}
                />
              </div>
            </div>
          ))}

          {section("cs.voice", "cs.voiceHint", (
            voices.length === 0 ? <div style={s.hint}>{t("cs.noVoices")}</div> : (
              <div style={s.voices}>
                {voices.map((v) => {
                  const active = draft.voiceId === v.voiceId;
                  return (
                    <div key={v.id} style={active ? { ...s.voice, ...s.pillActive } : s.voice}>
                      <button
                        type="button"
                        style={s.play}
                        onClick={() => playSample(v.voiceId)}
                        aria-label={t("cs.playSample")}
                      >
                        {playing === v.voiceId ? "■" : "▶"}
                      </button>
                      <button type="button" style={s.voiceName} onClick={() => set("voiceId", active ? undefined : v.voiceId)}>
                        {v.name}
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          ))}

          {section("cs.voiceMode", "cs.voiceModeHint", pills(
            VOICE_MODES,
            (v) => draft.voiceMode === v,
            (v) => set("voiceMode", draft.voiceMode === v ? undefined : v),
            (v) => t(`cs.voiceMode.${v}` as TKey),
          ))}

          {section("cs.level", nsfwAllowed ? "cs.levelHint" : "cs.levelNsfwOff", pills(
            nsfwAllowed ? (["flirt", "nsfw"] as const) : (["flirt"] as const),
            (v) => draft.level === v,
            (v) => set("level", draft.level === v ? undefined : v),
            (v) => t(`cs.level.${v}` as TKey),
          ))}

          {nsfwAllowed && draft.level !== "flirt" && section("cs.likes", "cs.likesHint", pills(
            CHAT_LIKES,
            (v) => (draft.likes ?? []).includes(v),
            (v) => set("likes", toggleIn(draft.likes, v)),
            (v) => optionLabel(t, "like", v),
          ))}

          {section("cs.boundaries", "cs.boundariesHint", (
            <>
              {(draft.boundaries ?? []).length > 0 && (
                <div style={s.pills}>
                  {(draft.boundaries ?? []).map((b) => (
                    <span key={b} style={{ ...s.pill, ...s.pillActive, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {b}
                      <button
                        type="button"
                        style={s.chipX}
                        onClick={() => set("boundaries", (draft.boundaries ?? []).filter((x) => x !== b))}
                        aria-label={t("common.delete")}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ ...s.row, marginTop: 8 }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={newBoundary}
                  maxLength={LIMITS.boundary}
                  onChange={(e) => setNewBoundary(e.target.value)}
                  placeholder={t("cs.boundaryPlaceholder")}
                />
                <button
                  type="button"
                  style={s.ghostBtn}
                  disabled={!newBoundary.trim() || (draft.boundaries ?? []).length >= LIMITS.boundaries}
                  onClick={() => {
                    set("boundaries", [...new Set([...(draft.boundaries ?? []), newBoundary.trim()])]);
                    setNewBoundary("");
                  }}
                >
                  {t("cs.add")}
                </button>
              </div>
            </>
          ))}
        </div>

        {error && <div style={s.error}>{error}</div>}
        <div style={s.footer}>
          <button type="button" style={s.resetBtn} onClick={handleReset} disabled={saving}>{t("cs.reset")}</button>
          <div style={{ flex: 1 }} />
          <button type="button" style={s.cancelBtn} onClick={onClose} disabled={saving}>{t("common.cancel")}</button>
          <button type="button" style={s.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? t("cs.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#111", borderRadius: 16, width: "min(720px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #2a2a2a" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px 14px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 },
  title: { color: "#fff", fontSize: 20, fontWeight: 700 },
  subtitle: { color: "#848484", fontSize: 13, marginTop: 4, lineHeight: 1.4 },
  closeBtn: { width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  body: { flex: 1, overflowY: "auto", padding: "8px 20px 20px" },
  section: { padding: "16px 0", borderBottom: "1px solid #1f1f1f" },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: 600, marginBottom: 4 },
  hint: { color: "#848484", fontSize: 12, lineHeight: 1.5, marginBottom: 10 },
  input: { width: "100%", boxSizing: "border-box", padding: "10px 12px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" },
  counter: { color: "#666", fontSize: 11, textAlign: "right", margin: "4px 0 8px" },
  row: { display: "flex", gap: 8, alignItems: "center" },
  pills: { display: "flex", flexWrap: "wrap", gap: 8 },
  pill: { padding: "7px 12px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  pillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad" },
  chipX: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 },
  sliders: { display: "flex", flexDirection: "column", gap: 12 },
  sliderRow: { display: "grid", gridTemplateColumns: "minmax(70px, 1fr) 3fr minmax(70px, 1fr)", alignItems: "center", gap: 10 },
  sliderEnd: { color: "#bbb", fontSize: 12 },
  range: { width: "100%", accentColor: "#f95bad" },
  inline: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 },
  inlineLabel: { color: "#bbb", fontSize: 13, minWidth: 120 },
  voices: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 },
  voice: { display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a" },
  play: { width: 28, height: 28, flexShrink: 0, borderRadius: "50%", border: "none", background: "#2a2a2a", color: "#fff", fontSize: 11, cursor: "pointer" },
  voiceName: { flex: 1, textAlign: "left", background: "none", border: "none", color: "inherit", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  ghostBtn: { height: 40, padding: "0 14px", borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  error: { color: "#e36466", fontSize: 13, padding: "10px 20px 0" },
  footer: { display: "flex", flexWrap: "wrap", gap: 10, padding: "14px 20px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  resetBtn: { height: 42, padding: "0 14px", borderRadius: 10, border: "1px solid rgba(227,100,102,0.5)", background: "transparent", color: "#e36466", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  cancelBtn: { height: 42, padding: "0 18px", borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { height: 42, padding: "0 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
