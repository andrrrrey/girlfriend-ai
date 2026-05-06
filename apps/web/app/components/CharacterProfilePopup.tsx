"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import type { Character } from "../../lib/api";

interface Props {
  character: Character | null;
  onClose: () => void;
}

type Tab = "about" | "gallery" | "comments";

const MOCK_COMMENTS = [
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 0,  liked: false },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 0,  liked: false },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
];

export default function CharacterProfilePopup({ character, onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("about");

  useEffect(() => {
    if (character) {
      document.body.style.overflow = "hidden";
      setTab("about");
    }
    return () => { document.body.style.overflow = ""; };
  }, [character]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  if (!character) return null;

  const p = (character.personality as Record<string, unknown>) || {};
  const age = p.age ? String(p.age) : "";
  const description = (p.description as string) || (p.bio as string) || "";
  const rawTags = (p.tags as string[]) || (p.traits as string[]) || character.tags || [];

  const personalityVal = Array.isArray(p.personality)
    ? (p.personality as string[]).join(", ")
    : (p.personalityType as string) || (p.personality as string) || "";
  const lifestyleVal = Array.isArray(p.lifestyle)
    ? (p.lifestyle as string[]).join(", ")
    : (p.lifestyle as string) || "";
  const relationshipsVal = (p.relationshipType as string) || (p.familyStatus as string) || "";
  const kinksVal = Array.isArray(p.kinks)
    ? (p.kinks as string[]).join(", ")
    : (p.kinks as string) || "";
  const hobbiesVal = Array.isArray(p.hobbies)
    ? (p.hobbies as string[]).join(", ")
    : (p.hobbies as string) || "";

  const handleStartChat = () => {
    if (!user) {
      router.push("/login");
      onClose();
      return;
    }
    router.push(`/chat?characterId=${character.id}`);
    onClose();
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="cpp-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* ═══════════════════ LEFT PANEL ═══════════════════ */}
        <div className="cpp-left" style={s.left}>

          {/* Image */}
          <div style={s.imgWrap}>
            {character.avatarUrl
              ? <img src={character.avatarUrl} alt={character.name} style={s.avatar} />
              : <div style={s.avatarBg} />
            }
            {/* Three-dot menu on image */}
            <div style={s.dotsBtn}>
              <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
                <circle cx="2" cy="2" r="2" fill="#fff"/>
                <circle cx="8" cy="2" r="2" fill="#fff"/>
                <circle cx="14" cy="2" r="2" fill="#fff"/>
              </svg>
            </div>
            {/* Progress bar */}
            <div style={s.progress}>
              <div style={s.progActive} />
              <div style={s.progInactive} />
              <div style={s.progInactive} />
            </div>
          </div>

          {/* Stats below image */}
          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statVal}>54.2K</span>
              <span style={s.statLbl}>LIKES</span>
            </div>
            <div style={s.statSep} />
            <div style={s.stat}>
              <span style={s.statVal}>1.2K</span>
              <span style={s.statLbl}>COMMENTS</span>
            </div>
            <div style={s.statSep} />
            <div style={s.stat}>
              <span style={s.statVal}>600</span>
              <span style={s.statLbl}>GENERATED</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={s.actions}>
            <button style={s.likeBtn}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
                <path d="M12 21S3 14.5 3 8.5a4.5 4.5 0 019-1.5 4.5 4.5 0 019 1.5C21 14.5 12 21 12 21z"/>
              </svg>
            </button>
            <button style={s.generateBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span>Generate</span>
            </button>
            <button style={s.chatBtn} onClick={handleStartChat}>Start Chatting</button>
          </div>
        </div>

        {/* ═══════════════════ RIGHT PANEL ═══════════════════ */}
        <div className="cpp-right" style={s.right}>

          {/* Close button */}
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          {/* Name + Tags */}
          <div style={s.head}>
            <h2 style={s.name}>{character.name}{age ? `, ${age}` : ""}</h2>
            <div style={s.tagsRow}>
              {rawTags.slice(0, 10).map((t, i) => (
                <span key={i} style={s.tag}>{String(t)}</span>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={s.tabRow}>
            {(["about", "gallery", "comments"] as Tab[]).map((t) => (
              <button
                key={t}
                style={{ ...s.tabBtn, ...(tab === t ? s.tabActive : {}) }}
                onClick={() => setTab(t)}
              >
                {t === "about" ? "About me" : t === "gallery" ? "Gallery" : "Comments"}
                {tab === t && <div style={s.tabLine} />}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="cpp-scroll" style={s.content}>
            {tab === "about" && (
              <AboutTab
                description={description}
                age={age}
                personality={personalityVal}
                lifestyle={lifestyleVal}
                relationships={relationshipsVal}
                kinks={kinksVal}
                hobbies={hobbiesVal}
              />
            )}
            {tab === "gallery" && <GalleryTab avatarUrl={character.avatarUrl} />}
            {tab === "comments" && <CommentsList />}
          </div>

          {/* Comments input footer (only on Comments tab) */}
          {tab === "comments" && (
            <div style={s.commentFooter}>
              <input style={s.commentInput} placeholder="Leave a comment..." />
              <button style={s.sendBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .cpp-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 768px) {
          .cpp-modal {
            flex-direction: column !important;
            width: 100vw !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
          }
          .cpp-left {
            width: 100% !important;
            height: 300px !important;
            flex-shrink: 0 !important;
          }
          .cpp-right { flex: 1 !important; min-height: 0 !important; }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════ Sub-components ══════════════════ */

function AboutTab({ description, age, personality, lifestyle, relationships, kinks, hobbies }: {
  description: string; age: string; personality: string; lifestyle: string;
  relationships: string; kinks: string; hobbies: string;
}) {
  const rows: { icon: string; label: string; value: string }[] = [
    { icon: "age",           label: "AGE",           value: age },
    { icon: "personality",   label: "PERSONALITY",   value: personality },
    { icon: "lifestyle",     label: "LIFESTYLE",     value: lifestyle },
    { icon: "relationships", label: "RELATIONSHIPS", value: relationships },
    { icon: "kinks",         label: "KINKS",         value: kinks },
    { icon: "hobbies",       label: "HOBBIES",       value: hobbies },
  ].filter((r) => r.value);

  return (
    <div>
      {description && (
        <>
          <p style={s.secLabel}>DESCRIPTION</p>
          <p style={s.descText}>{description}</p>
        </>
      )}

      {rows.length > 0 && (
        <>
          <p style={{ ...s.secLabel, marginTop: description ? 22 : 0 }}>ABOUT ME</p>
          <div style={s.aboutGrid}>
            {rows.map((row, i) => (
              <div key={i} style={s.aboutItem}>
                <div style={s.aboutIconWrap}>{AboutIcon(row.icon)}</div>
                <div>
                  <div style={s.aboutLabel}>{row.label}</div>
                  <div style={s.aboutVal}>{row.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ ...s.secLabel, marginTop: 22 }}>CREATOR</p>
      <div style={s.creatorRow}>
        <div style={s.creatorAva} />
        <div>
          <div style={s.creatorName}>@helloimjack17499</div>
          <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 12, color: "#c1f0aa" }}>34K ♥</span>
            <span style={{ fontSize: 12, color: "#848484" }}>12K 👥</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button style={s.outlineBtn}>More Characters</button>
        <button style={s.outlineBtn}>Follow 🟢</button>
      </div>
    </div>
  );
}

function GalleryTab({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...s.secLabel, margin: 0 }}>GENERATED CONTENT</p>
        <span style={{ color: "#f95bad", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>VIEW ALL (600)</span>
      </div>
      <div style={s.galGrid}>
        {Array.from({ length: 12 }).map((_, i) => {
          const isPremium = i === 5;
          const isBlurred = i > 5 && i < 9;
          return (
            <div key={i} style={{ ...s.galCard, ...(isBlurred ? s.galBlurred : {}) }}>
              {avatarUrl && i < 2
                ? <img src={avatarUrl} alt="" style={s.galImg} />
                : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${125 + i * 15}deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)` }} />
              }
              {isPremium && (
                <div style={s.premOverlay}>
                  <div style={s.lockCircle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", textAlign: "center" as const }}>More Photos 💎</div>
                  <div style={{ fontSize: 9, color: "#f95bad", textTransform: "uppercase" as const, fontWeight: 600, letterSpacing: "0.05em" }}>PREMIUM FEATURE</div>
                  <button style={s.premBtn}>Become Premium</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommentsList() {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <p style={{ ...s.secLabel, margin: 0 }}>COMMENTS</p>
        <span style={{ color: "#f95bad", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>VIEW ALL (600)</span>
      </div>
      {MOCK_COMMENTS.map((c, i) => (
        <div key={i} style={s.commentRow}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={s.commentUser}>{c.user}</span>
              <span style={s.commentDate}>{c.date}</span>
            </div>
            <p style={s.commentText}>{c.text}</p>
          </div>
          {c.likes > 0 && (
            <div style={{ ...s.commentLike, background: c.liked ? "rgba(193,240,170,0.12)" : "#252525", color: c.liked ? "#c1f0aa" : "#fff" }}>
              {c.likes} ♥
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AboutIcon(type: string) {
  const c = "#848484", w = 18, h = 18;
  switch (type) {
    case "age":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "personality":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
    case "lifestyle":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 15V7l6-3 3 3h4"/><path d="M12 4v8"/><path d="M9 10h6"/></svg>;
    case "relationships":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
    case "kinks":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>;
    case "hobbies":
      return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>;
    default: return null;
  }
}

/* ══════════════════ Styles ══════════════════ */

const s: Record<string, React.CSSProperties> = {
  /* Overlay */
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.82)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    background: "#111",
    borderRadius: 12,
    width: "min(1060px, 96vw)",
    height: "min(88vh, 850px)",
    display: "flex",
    flexDirection: "row" as const,
    overflow: "hidden",
    border: "1px solid #1e1e1e",
    position: "relative" as const,
  },

  /* ─── LEFT PANEL ─── */
  left: {
    width: "36%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    background: "#0a0a0a",
  },
  imgWrap: {
    flex: 1,
    position: "relative" as const,
    overflow: "hidden",
    minHeight: 0,
  },
  avatar: {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  avatarBg: {
    position: "absolute" as const,
    inset: 0,
    background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)",
  },
  dotsBtn: {
    position: "absolute" as const,
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "rgba(30,20,25,0.55)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 3,
  },
  progress: {
    position: "absolute" as const,
    bottom: 10,
    left: 10,
    right: 10,
    display: "flex",
    gap: 4,
    zIndex: 2,
  },
  progActive: {
    flex: 1,
    height: 2,
    background: "#f95bad",
    borderRadius: 1,
    boxShadow: "0 0 6px rgba(249,91,173,0.7)",
  },
  progInactive: {
    flex: 1,
    height: 2,
    background: "#46383e",
    borderRadius: 1,
    opacity: 0.6,
  },

  /* Stats */
  stats: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "14px 8px",
    flexShrink: 0,
  },
  stat: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 3,
  },
  statVal: {
    fontSize: 22,
    fontWeight: 800,
    color: "#fff",
    fontFamily: "'Syne', sans-serif",
    lineHeight: 1,
  },
  statLbl: {
    fontSize: 8,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
  },
  statSep: {
    width: 1,
    height: 30,
    background: "#252525",
    flexShrink: 0,
  },

  /* Action buttons */
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 12px 16px",
    flexShrink: 0,
  },
  likeBtn: {
    width: 46,
    height: 46,
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  generateBtn: {
    height: 46,
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    fontFamily: "'Syne', sans-serif",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  chatBtn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    whiteSpace: "nowrap" as const,
  },

  /* ─── RIGHT PANEL ─── */
  right: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    position: "relative" as const,
  },
  closeBtn: {
    position: "absolute" as const,
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.06)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  head: {
    padding: "22px 28px 0",
    flexShrink: 0,
  },
  name: {
    fontSize: 26,
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 14px",
    fontFamily: "'Syne', sans-serif",
    paddingRight: 48,
    lineHeight: 1.2,
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  tag: {
    background: "transparent",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "5px 14px",
    fontSize: 11,
    fontWeight: 500,
    color: "#ccc",
    whiteSpace: "nowrap" as const,
  },

  /* Tabs */
  tabRow: {
    display: "flex",
    borderBottom: "1px solid #252525",
    padding: "0 28px",
    marginTop: 18,
    flexShrink: 0,
  },
  tabBtn: {
    position: "relative" as const,
    flex: 1,
    padding: "14px 0",
    background: "transparent",
    border: "none",
    color: "#848484",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    textAlign: "center" as const,
    whiteSpace: "nowrap" as const,
  },
  tabActive: {
    color: "#fff",
  },
  tabLine: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    background: "#f95bad",
    borderRadius: "2px 2px 0 0",
    boxShadow: "0 0 10px rgba(249,91,173,0.6)",
  },

  /* Scrollable content */
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 28px",
    scrollbarWidth: "none" as const,
  },

  /* Comments footer */
  commentFooter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 28px 14px",
    borderTop: "1px solid #1e1e1e",
    flexShrink: 0,
    background: "#111",
  },
  commentInput: {
    flex: 1,
    height: 40,
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    outline: "none",
    color: "#ccc",
    fontSize: 13,
    padding: "0 14px",
    fontFamily: "'Syne', sans-serif",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  /* ─── About tab ─── */
  secLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    margin: "0 0 12px",
  },
  descText: {
    fontSize: 13,
    color: "#bbb",
    lineHeight: 1.7,
    margin: 0,
  },
  aboutGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  aboutItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  aboutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#1e1e1e",
    border: "1px solid #252525",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  aboutLabel: {
    fontSize: 9,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    marginBottom: 4,
  },
  aboutVal: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    lineHeight: 1.3,
  },
  creatorRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  creatorAva: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d1b3d, #1a0a2e)",
    border: "1px solid #2a2a2a",
    flexShrink: 0,
  },
  creatorName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
  },
  outlineBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "transparent",
    color: "#fff",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "'Syne', sans-serif",
  },

  /* ─── Gallery tab ─── */
  galGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 8,
  },
  galCard: {
    aspectRatio: "3/4",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative" as const,
    border: "1px solid #1e1e1e",
    background: "#1a1a1a",
    cursor: "pointer",
  },
  galBlurred: {
    filter: "blur(6px)",
    pointerEvents: "none" as const,
  },
  galImg: {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  premOverlay: {
    position: "absolute" as const,
    inset: 0,
    background: "rgba(9,9,9,0.7)",
    backdropFilter: "blur(12px)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 2,
    padding: "8px",
  },
  lockCircle: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "rgba(249,91,173,0.15)",
    border: "1px solid rgba(249,91,173,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  premBtn: {
    marginTop: 6,
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  },

  /* ─── Comments tab ─── */
  commentRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  commentUser: {
    fontSize: 13,
    fontWeight: 700,
    color: "#c1f0aa",
  },
  commentDate: {
    fontSize: 11,
    color: "#848484",
  },
  commentText: {
    fontSize: 13,
    color: "#bbb",
    margin: "5px 0 0",
    lineHeight: 1.4,
  },
  commentLike: {
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    marginTop: 2,
  },
};
