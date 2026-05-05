"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Character } from "../../lib/api";

interface Props {
  character: Character | null;
  onClose: () => void;
}

type Tab = "about" | "gallery" | "comments";

const MOCK_COMMENTS = [
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 0, liked: false },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 0, liked: false },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
  { user: "@jack17499", date: "7/25/2026", text: "Amazinggggg...", likes: 34, liked: true },
];

export default function CharacterProfilePopup({ character, onClose }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("about");

  useEffect(() => {
    if (character) {
      document.body.style.overflow = "hidden";
      setTab("about");
    }
    return () => { document.body.style.overflow = ""; };
  }, [character]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!character) return null;

  const p = (character.personality as Record<string, unknown>) || {};
  const age = p.age ? String(p.age) : "";
  const name = character.name;
  const description = (p.description as string) || (p.bio as string) || "";
  const rawTags = (p.tags as string[]) || (p.traits as string[]) || character.tags || [];
  const personality = Array.isArray(p.personality)
    ? (p.personality as string[]).join(", ")
    : (p.personalityType as string) || (p.personality as string) || "";
  const lifestyle = Array.isArray(p.lifestyle)
    ? (p.lifestyle as string[]).join(", ")
    : (p.lifestyle as string) || "";
  const relationships = (p.relationshipType as string) || (p.familyStatus as string) || "";
  const kinks = Array.isArray(p.kinks)
    ? (p.kinks as string[]).join(", ")
    : (p.kinks as string) || "";
  const hobbies = Array.isArray(p.hobbies)
    ? (p.hobbies as string[]).join(", ")
    : (p.hobbies as string) || "";

  const handleStartChat = () => {
    router.push(`/chat?characterId=${character.id}`);
    onClose();
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="cpp-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* ── Left: Avatar + stats ── */}
        <div className="cpp-left" style={s.left}>
          {/* Image area */}
          <div style={s.imgWrap}>
            {character.avatarUrl
              ? <img src={character.avatarUrl} alt={name} style={s.avatar} />
              : <div style={s.avatarPlaceholder} />
            }
            {/* Progress bar inside image, near bottom */}
            <div style={s.progressBar}>
              <div style={s.progressActive} />
              <div style={s.progressInactive} />
              <div style={s.progressInactive} />
            </div>
          </div>

          {/* Stats row — below image, not overlay */}
          <div style={s.statsRow}>
            <div style={s.statItem}>
              <span style={s.statValue}>54.2K</span>
              <span style={s.statLabel}>LIKES</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <span style={s.statValue}>1.2K</span>
              <span style={s.statLabel}>COMMENTS</span>
            </div>
            <div style={s.statDivider} />
            <div style={s.statItem}>
              <span style={s.statValue}>600</span>
              <span style={s.statLabel}>GENERATED</span>
            </div>
          </div>
        </div>

        {/* ── Right: Content ── */}
        <div className="cpp-right" style={s.right}>
          {/* Close button */}
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Name + tags */}
          <div style={s.header}>
            <h2 style={s.name}>{name}{age ? `, ${age}` : ""}</h2>
            <div style={s.tagsRow}>
              {rawTags.slice(0, 9).map((t, i) => (
                <span key={i} style={s.tagPill}>{String(t)}</span>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={s.tabsRow}>
            {(["about", "gallery", "comments"] as Tab[]).map((t) => (
              <button
                key={t}
                style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
                onClick={() => setTab(t)}
              >
                {t === "about" ? "About me" : t === "gallery" ? "Gallery" : "Comments"}
                {tab === t && <div style={s.tabUnderline} />}
              </button>
            ))}
          </div>

          {/* Scrollable content — fixed height via parent flex */}
          <div className="cpp-scroll" style={s.content}>
            {tab === "about" && (
              <AboutTab
                description={description}
                age={age}
                personality={personality}
                lifestyle={lifestyle}
                relationships={relationships}
                kinks={kinks}
                hobbies={hobbies}
              />
            )}
            {tab === "gallery" && <GalleryTab avatarUrl={character.avatarUrl} />}
            {tab === "comments" && <CommentsTab />}
          </div>

          {/* Footer */}
          <div style={s.footer}>
            <button style={s.likeBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
                <path d="M12 21S3 14.5 3 8.5a4.5 4.5 0 019-1.5 4.5 4.5 0 019 1.5C21 14.5 12 21 12 21z" />
              </svg>
            </button>
            <button style={s.generateBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Generate</span>
            </button>
            <button style={s.chatBtn} onClick={handleStartChat}>Start Chatting</button>
          </div>
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
            height: 260px !important;
            flex-shrink: 0 !important;
            flex-direction: row !important;
          }
          .cpp-right { border-radius: 0 !important; min-height: 0 !important; flex: 1 !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────── */

function AboutTab({ description, age, personality, lifestyle, relationships, kinks, hobbies }: {
  description: string; age: string; personality: string; lifestyle: string;
  relationships: string; kinks: string; hobbies: string;
}) {
  const items: { icon: string; label: string; value: string }[] = [
    { icon: "age",           label: "AGE",           value: age },
    { icon: "personality",   label: "PERSONALITY",   value: personality },
    { icon: "lifestyle",     label: "LIFESTYLE",     value: lifestyle },
    { icon: "relationships", label: "RELATIONSHIPS", value: relationships },
    { icon: "kinks",         label: "KINKS",         value: kinks },
    { icon: "hobbies",       label: "HOBBIES",       value: hobbies },
  ].filter((x) => x.value);

  return (
    <div>
      {description && (
        <>
          <div style={s.sectionLabel}>DESCRIPTION</div>
          <p style={s.descText}>{description}</p>
        </>
      )}

      {items.length > 0 && (
        <>
          <div style={{ ...s.sectionLabel, marginTop: description ? 24 : 0 }}>ABOUT ME</div>
          <div style={s.aboutGrid}>
            {items.map((item, i) => (
              <div key={i} style={s.aboutItem}>
                <div style={s.aboutIcon}>{AboutIcon(item.icon)}</div>
                <div>
                  <div style={s.aboutLabel}>{item.label}</div>
                  <div style={s.aboutValue}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...s.sectionLabel, marginTop: 24 }}>CREATOR</div>
      <div style={s.creatorRow}>
        <div style={s.creatorAvatar} />
        <div>
          <div style={s.creatorName}>@helloimjack17499</div>
          <div style={s.creatorMeta}>
            <span style={{ color: "#c1f0aa", fontSize: 12 }}>34K ♥</span>
            <span style={{ color: "#969696", fontSize: 12, marginLeft: 10 }}>12K 👥</span>
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
        <div style={s.sectionLabel}>GENERATED CONTENT</div>
        <span style={{ color: "#f95bad", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>VIEW ALL (600)</span>
      </div>
      <div style={s.galleryGrid}>
        {Array.from({ length: 9 }).map((_, i) => {
          const isPremium = i === 5;
          return (
            <div key={i} style={s.galleryCard}>
              {avatarUrl && i < 2
                ? <img src={avatarUrl} alt="" style={s.galleryImg} />
                : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${130 + i * 18}deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)` }} />
              }
              {isPremium && (
                <div style={s.premiumOverlay}>
                  <div style={s.lockCircle}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "center" as const }}>More Photos 💎</div>
                  <div style={{ fontSize: 9, color: "#f95bad", textTransform: "uppercase" as const, fontWeight: 600, letterSpacing: "0.05em" }}>PREMIUM FEATURE</div>
                  <button style={s.premiumBtn}>Become Premium</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommentsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={s.sectionLabel}>COMMENTS</div>
        <span style={{ color: "#f95bad", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>VIEW ALL (600)</span>
      </div>
      <div>
        {MOCK_COMMENTS.map((c, i) => (
          <div key={i} style={s.commentItem}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={s.commentUser}>{c.user}</span>
                <span style={s.commentDate}>{c.date}</span>
              </div>
              <p style={s.commentText}>{c.text}</p>
            </div>
            {c.likes > 0 && (
              <div style={{ ...s.commentLikes, background: c.liked ? "rgba(193,240,170,0.15)" : "#2a2a2a", color: c.liked ? "#c1f0aa" : "#fff" }}>
                {c.likes} ♥
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={s.commentInputRow}>
        <input style={s.commentInput} placeholder="Leave a comment..." />
        <button style={s.commentSendBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function AboutIcon(type: string) {
  const c = "#848484";
  switch (type) {
    case "age":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2"/><circle cx="12" cy="7" r="4"/></svg>;
    case "personality":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
    case "lifestyle":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    case "relationships":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
    case "kinks":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>;
    case "hobbies":
      return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
    default:
      return null;
  }
}

/* ── Styles ─────────────────────────────────────── */

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modal: {
    background: "#111",
    borderRadius: 12,
    width: "min(960px, 96vw)",
    height: "min(88vh, 720px)",
    display: "flex",
    flexDirection: "row" as const,
    overflow: "hidden",
    border: "1px solid #2a2a2a",
    position: "relative" as const,
  },

  /* ── Left column ── */
  left: {
    width: "37%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    background: "#0a0a0a",
    overflow: "hidden",
  },
  imgWrap: {
    flex: 1,
    position: "relative" as const,
    overflow: "hidden",
  },
  avatar: {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  avatarPlaceholder: {
    position: "absolute" as const,
    inset: 0,
    background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)",
  },
  progressBar: {
    position: "absolute" as const,
    bottom: 12,
    left: 12,
    right: 12,
    display: "flex",
    gap: 4,
    zIndex: 2,
  },
  progressActive: {
    flex: 1,
    height: 2,
    background: "#f95bad",
    borderRadius: 1,
    boxShadow: "0 0 5px 1px rgba(228,0,120,0.6)",
  },
  progressInactive: {
    flex: 1,
    height: 2,
    background: "#46383e",
    borderRadius: 1,
    opacity: 0.6,
  },
  statsRow: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: "14px 8px",
    background: "#111",
    borderTop: "1px solid #1e1e1e",
  },
  statItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 3,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 800,
    color: "#fff",
    fontFamily: "'Syne', sans-serif",
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
  },
  statDivider: {
    width: 1,
    height: 28,
    background: "#2a2a2a",
    flexShrink: 0,
  },

  /* ── Right column ── */
  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    position: "relative" as const,
    minWidth: 0,
  },
  closeBtn: {
    position: "absolute" as const,
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.07)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  header: {
    padding: "20px 28px 0",
    flexShrink: 0,
  },
  name: {
    fontSize: 26,
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 12px",
    fontFamily: "'Syne', sans-serif",
    paddingRight: 48,
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  tagPill: {
    background: "#1e1e1e",
    border: "1px solid #2a2a2a",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 11,
    fontWeight: 500,
    color: "#ccc",
    whiteSpace: "nowrap" as const,
  },
  tabsRow: {
    display: "flex",
    borderBottom: "1px solid #252525",
    padding: "0 28px",
    marginTop: 16,
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
  },
  tabBtnActive: {
    color: "#fff",
  },
  tabUnderline: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    background: "#f95bad",
    borderRadius: "2px 2px 0 0",
    boxShadow: "0 0 8px rgba(249,91,173,0.6)",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 28px",
    scrollbarWidth: "none" as const,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 28px",
    borderTop: "1px solid #252525",
    flexShrink: 0,
    background: "#111",
  },
  likeBtn: {
    width: 44,
    height: 44,
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
    height: 44,
    borderRadius: 8,
    border: "1px solid #2a2a2a",
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 20px",
    fontFamily: "'Syne', sans-serif",
    flexShrink: 0,
  },
  chatBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  },

  /* ── About tab ── */
  sectionLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: 12,
  },
  descText: {
    fontSize: 13,
    color: "#bbb",
    lineHeight: 1.65,
    margin: 0,
  },
  aboutGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },
  aboutItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  aboutIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#1a1a1a",
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
    letterSpacing: "0.06em",
    marginBottom: 3,
  },
  aboutValue: {
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
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d1b3d, #1a0a2e)",
    flexShrink: 0,
    border: "1px solid #2a2a2a",
  },
  creatorName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    marginBottom: 2,
  },
  creatorMeta: {
    display: "flex",
    gap: 4,
  },
  outlineBtn: {
    padding: "7px 14px",
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

  /* ── Gallery tab ── */
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
  },
  galleryCard: {
    aspectRatio: "2/3",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative" as const,
    border: "1px solid #252525",
    background: "#1a1a1a",
    cursor: "pointer",
  },
  galleryImg: {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  premiumOverlay: {
    position: "absolute" as const,
    inset: 0,
    background: "rgba(9,9,9,0.65)",
    backdropFilter: "blur(10px)",
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
    marginBottom: 2,
  },
  premiumBtn: {
    marginTop: 6,
    padding: "8px 18px",
    borderRadius: 6,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  },

  /* ── Comments tab ── */
  commentItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 0",
    borderBottom: "1px solid #1e1e1e",
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
  commentLikes: {
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
  commentInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: "10px 14px",
    background: "#1a1a1a",
    borderRadius: 8,
    border: "1px solid #252525",
  },
  commentInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: 13,
    fontFamily: "'Syne', sans-serif",
  },
  commentSendBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
