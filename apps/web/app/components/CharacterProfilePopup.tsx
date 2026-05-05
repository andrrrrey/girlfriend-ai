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
  const personality = Array.isArray(p.personality) ? (p.personality as string[]).join(", ") : (p.personalityType as string) || "";
  const lifestyle = (p.lifestyle as string) || "";
  const relationships = (p.relationshipType as string) || (p.familyStatus as string) || "";
  const kinks = Array.isArray(p.kinks) ? (p.kinks as string[]).join(", ") : (p.kinks as string) || "";
  const hobbies = Array.isArray(p.hobbies) ? (p.hobbies as string[]).join(", ") : (p.hobbies as string) || "";

  const handleStartChat = () => {
    router.push(`/chat?characterId=${character.id}`);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="cpp-modal" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Left: Avatar */}
        <div className="cpp-left" style={styles.left}>
          {character.avatarUrl ? (
            <img src={character.avatarUrl} alt={name} style={styles.avatar} />
          ) : (
            <div style={styles.avatarPlaceholder} />
          )}
          <div style={styles.progressBar}>
            <div style={styles.progressActive} />
            <div style={styles.progressInactive} />
            <div style={styles.progressInactive} />
          </div>
          <div style={styles.statsOverlay}>
            <div style={styles.statItem}>
              <span style={styles.statValue}>54.2K</span>
              <span style={styles.statLabel}>LIKES</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statValue}>1.2K</span>
              <span style={styles.statLabel}>COMMENTS</span>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statValue}>600</span>
              <span style={styles.statLabel}>GENERATED</span>
            </div>
          </div>
        </div>

        {/* Right: Content */}
        <div className="cpp-right" style={styles.right}>
          {/* Close button */}
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>

          {/* Name */}
          <h2 style={styles.name}>{name}{age ? `, ${age}` : ""}</h2>

          {/* Tags */}
          <div style={styles.tagsRow}>
            {rawTags.slice(0, 9).map((t, i) => (
              <span key={i} style={styles.tagPill}>{String(t)}</span>
            ))}
          </div>

          {/* Tabs */}
          <div style={styles.tabsRow}>
            {(["about", "gallery", "comments"] as Tab[]).map((t) => (
              <button
                key={t}
                style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
                onClick={() => setTab(t)}
              >
                {t === "about" ? "About me" : t === "gallery" ? "Gallery" : "Comments"}
                {tab === t && <div style={styles.tabUnderline} />}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="cpp-scroll" style={styles.content}>
            {tab === "about" && <AboutTab description={description} age={age} personality={personality} lifestyle={lifestyle} relationships={relationships} kinks={kinks} hobbies={hobbies} />}
            {tab === "gallery" && <GalleryTab avatarUrl={character.avatarUrl} />}
            {tab === "comments" && <CommentsTab />}
          </div>

          {/* Footer */}
          <div className="cpp-footer" style={styles.footer}>
            <button style={styles.likeBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 21S3 14.5 3 8.5a4.5 4.5 0 019-1.5 4.5 4.5 0 019 1.5C21 14.5 12 21 12 21z" /></svg>
            </button>
            <button style={styles.generateBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span>Generate</span>
            </button>
            <button style={styles.chatBtn} onClick={handleStartChat}>Start Chatting</button>
          </div>
        </div>
      </div>

      <style>{`
        .cpp-scroll::-webkit-scrollbar { display: none; }
        @media (max-width: 768px) {
          .cpp-modal { flex-direction: column !important; width: 100vw !important; height: 100vh !important; max-height: 100vh !important; border-radius: 0 !important; }
          .cpp-left { width: 100% !important; height: 240px !important; flex-shrink: 0 !important; border-radius: 0 !important; }
          .cpp-right { border-radius: 0 !important; }
          .cpp-footer { padding: 12px 16px !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ── */

function AboutTab({ description, age, personality, lifestyle, relationships, kinks, hobbies }: {
  description: string; age: string; personality: string; lifestyle: string; relationships: string; kinks: string; hobbies: string;
}) {
  const items: { icon: string; label: string; value: string }[] = [
    { icon: "age", label: "AGE", value: age },
    { icon: "personality", label: "PERSONALITY", value: personality },
    { icon: "lifestyle", label: "LIFESTYLE", value: lifestyle },
    { icon: "relationships", label: "RELATIONSHIPS", value: relationships },
    { icon: "kinks", label: "KINKS", value: kinks },
    { icon: "hobbies", label: "HOBBIES", value: hobbies },
  ].filter((x) => x.value);

  return (
    <div>
      <div style={styles.sectionLabel}>DESCRIPTION</div>
      <p style={styles.descText}>{description || "No description yet."}</p>

      {items.length > 0 && (
        <>
          <div style={{ ...styles.sectionLabel, marginTop: 24 }}>ABOUT ME</div>
          <div style={styles.aboutGrid}>
            {items.map((item, i) => (
              <div key={i} style={styles.aboutItem}>
                <div style={styles.aboutIcon}>{aboutIcon(item.icon)}</div>
                <div>
                  <div style={styles.aboutLabel}>{item.label}</div>
                  <div style={styles.aboutValue}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...styles.sectionLabel, marginTop: 24 }}>CREATOR</div>
      <div style={styles.creatorRow}>
        <div style={styles.creatorAvatar} />
        <div>
          <div style={styles.creatorName}>@helloimjack17499</div>
          <div style={styles.creatorStats}>
            <span style={{ color: "#c1f0aa" }}>34K 💚</span>
            <span style={{ color: "#969696", marginLeft: 12 }}>12K 👥</span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button style={styles.moreCharsBtn}>More Characters</button>
        <button style={styles.followBtn}>Follow 🟢</button>
      </div>
    </div>
  );
}

function GalleryTab({ avatarUrl }: { avatarUrl: string | null }) {
  const placeholders = Array.from({ length: 8 });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={styles.sectionLabel}>GENERATED CONTENT</div>
        <span style={{ color: "#f95bad", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>VIEW ALL (600)</span>
      </div>
      <div style={styles.galleryGrid}>
        {placeholders.map((_, i) => {
          const isPremium = i >= 5;
          return (
            <div key={i} style={styles.galleryCard}>
              {avatarUrl && i < 2 ? (
                <img src={avatarUrl} alt="" style={styles.galleryImg} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${135 + i * 20}deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)` }} />
              )}
              {isPremium && (
                <div style={styles.premiumOverlay}>
                  <div style={styles.lockIcon}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>More Photos 💎</div>
                  <div style={{ fontSize: 10, color: "#f95bad", textTransform: "uppercase" as const, fontWeight: 600 }}>PREMIUM FEATURE</div>
                  <button style={styles.premiumBtn}>Become Premium</button>
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={styles.sectionLabel}>COMMENTS</div>
        <span style={{ color: "#f95bad", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>VIEW ALL (600)</span>
      </div>
      <div style={styles.commentsList}>
        {MOCK_COMMENTS.map((c, i) => (
          <div key={i} style={styles.commentItem}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={styles.commentUser}>{c.user}</span>
                <span style={styles.commentDate}>{c.date}</span>
              </div>
              <p style={styles.commentText}>{c.text}</p>
            </div>
            {c.likes > 0 && (
              <div style={{ ...styles.commentLikes, background: c.liked ? "#2a4d2a" : "#2a2a2a" }}>
                {c.likes} {c.liked ? "💚" : "🤍"}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={styles.commentInputRow}>
        <input style={styles.commentInput} placeholder="Leave a comment..." />
        <button style={styles.commentSendBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>
    </div>
  );
}

function aboutIcon(type: string) {
  const s = { width: 20, height: 20, color: "#969696" };
  switch (type) {
    case "age":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4-4v2" /><circle cx="10" cy="7" r="4" /></svg>;
    case "personality":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>;
    case "lifestyle":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>;
    case "relationships":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
    case "kinks":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" /></svg>;
    case "hobbies":
      return <svg width={s.width} height={s.height} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
    default:
      return null;
  }
}

/* ── Styles ── */

const styles: Record<string, React.CSSProperties> = {
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
    width: "min(940px, 95vw)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "row" as const,
    overflow: "hidden",
    border: "1px solid #2a2a2a",
    position: "relative",
  },
  left: {
    width: "38%",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    background: "#0a0a0a",
  },
  avatar: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
    position: "absolute" as const,
    inset: 0,
  },
  avatarPlaceholder: {
    position: "absolute" as const,
    inset: 0,
    background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)",
  },
  progressBar: {
    position: "absolute" as const,
    bottom: 80,
    left: 12,
    right: 12,
    display: "flex",
    gap: 4,
    zIndex: 3,
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
    opacity: 0.7,
  },
  statsOverlay: {
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-around",
    padding: "16px 8px",
    background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
    zIndex: 3,
  },
  statItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 800,
    color: "#fff",
    fontFamily: "'Syne', sans-serif",
  },
  statLabel: {
    fontSize: 8,
    fontWeight: 500,
    color: "#969696",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  },
  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    position: "relative" as const,
  },
  closeBtn: {
    position: "absolute" as const,
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "none",
    background: "rgba(255,255,255,0.08)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  name: {
    fontSize: 28,
    fontWeight: 700,
    color: "#fff",
    padding: "20px 24px 0",
    margin: 0,
    fontFamily: "'Syne', sans-serif",
  },
  tagsRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    padding: "12px 24px 0",
  },
  tagPill: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 4,
    padding: "5px 12px",
    fontSize: 11,
    fontWeight: 500,
    color: "#fff",
    whiteSpace: "nowrap" as const,
  },
  tabsRow: {
    display: "flex",
    borderBottom: "1px solid #2a2a2a",
    padding: "0 24px",
    marginTop: 16,
    flexShrink: 0,
  },
  tabBtn: {
    position: "relative" as const,
    padding: "14px 24px",
    background: "transparent",
    border: "none",
    color: "#848484",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "'Syne', sans-serif",
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
    boxShadow: "0 0 8px 1px rgba(249,91,173,0.5)",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 24px",
    scrollbarWidth: "none" as const,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 24px",
    borderTop: "1px solid #2a2a2a",
    flexShrink: 0,
    background: "#111",
  },
  likeBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    border: "1px solid #313131",
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
    border: "1px solid #313131",
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "0 18px",
    fontFamily: "'Syne', sans-serif",
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
    fontWeight: 400,
    color: "#ccc",
    lineHeight: 1.6,
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
    gap: 10,
  },
  aboutIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "#1a1a1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  aboutLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "#848484",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 2,
  },
  aboutValue: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
  },
  creatorRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d1b3d, #1a0a2e)",
    flexShrink: 0,
  },
  creatorName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
  },
  creatorStats: {
    fontSize: 12,
    marginTop: 2,
  },
  moreCharsBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #313131",
    background: "transparent",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "'Syne', sans-serif",
  },
  followBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #313131",
    background: "transparent",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    fontFamily: "'Syne', sans-serif",
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  galleryCard: {
    aspectRatio: "3/4",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative" as const,
    border: "1px solid #313131",
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
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(8px)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    zIndex: 2,
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "rgba(249,91,173,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  premiumBtn: {
    marginTop: 8,
    padding: "8px 20px",
    borderRadius: 6,
    border: "none",
    background: "#f95bad",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  },
  commentsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  },
  commentItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 0",
    borderBottom: "1px solid #1e1e1e",
  },
  commentUser: {
    fontSize: 13,
    fontWeight: 700,
    color: "#c1f0aa",
  },
  commentDate: {
    fontSize: 11,
    color: "#969696",
  },
  commentText: {
    fontSize: 13,
    color: "#ccc",
    margin: "6px 0 0",
    lineHeight: 1.4,
  },
  commentLikes: {
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    marginTop: 4,
  },
  commentInputRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    padding: "12px 16px",
    background: "#1a1a1a",
    borderRadius: 8,
    border: "1px solid #2a2a2a",
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
    width: 32,
    height: 32,
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
