"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { likes, comments as commentsApi, users, resizedMediaUrl } from "../../lib/api";
import type { Character, CommentItem } from "../../lib/api";
import LikeButton from "./LikeButton";

interface Props {
  character: Character | null;
  onClose: () => void;
}

type Tab = "about" | "gallery" | "comments";

export default function CharacterProfilePopup({ character, onClose }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("about");
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [commentItems, setCommentItems] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (character) {
      document.body.style.overflow = "hidden";
      setTab("about");
      setCommentItems([]);
      setCommentText("");
      setCommentCursor(null);

      likes.getCount("character", character.id)
        .then((r) => setLikeCount(r.count))
        .catch(() => {});
      commentsApi.getCount(character.id)
        .then((r) => setCommentCount(r.count))
        .catch(() => {});

      if (user) {
        likes.getStatus("character", character.id)
          .then((r) => { setLiked(r.liked); setLikeCount(r.count); })
          .catch(() => {});
      }
    }
    return () => { document.body.style.overflow = ""; };
  }, [character, user]);

  const loadComments = useCallback(async () => {
    if (!character) return;
    try {
      const res = await commentsApi.list(character.id, commentCursor ?? undefined);
      setCommentItems((prev) => commentCursor ? [...prev, ...res.items] : res.items);
      setCommentCursor(res.nextCursor);
    } catch {}
  }, [character, commentCursor]);

  useEffect(() => {
    if (tab === "comments" && character && commentItems.length === 0) {
      loadComments();
    }
  }, [tab, character]);

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

  const handleSendComment = async () => {
    if (!user || !character || !commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const item = await commentsApi.create(character.id, commentText.trim());
      setCommentItems((prev) => [item, ...prev]);
      setCommentCount((c) => c + 1);
      setCommentText("");
    } catch {}
    setSubmitting(false);
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div className="cpp-modal" style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* ═══════════════════ LEFT PANEL ═══════════════════ */}
        <div className="cpp-left" style={s.left}>
          <div style={s.imgWrap}>
            {character.avatarUrl
              ? <img src={resizedMediaUrl(character.avatarUrl, { w: 768 }) ?? character.avatarUrl} alt={character.name} style={s.avatar} decoding="async" />
              : <div style={s.avatarBg} />
            }
            <div style={s.dotsBtn}>
              <svg width="16" height="4" viewBox="0 0 16 4" fill="none">
                <circle cx="2" cy="2" r="2" fill="#fff"/>
                <circle cx="8" cy="2" r="2" fill="#fff"/>
                <circle cx="14" cy="2" r="2" fill="#fff"/>
              </svg>
            </div>
            <div style={s.progress}>
              <div style={s.progActive} />
              <div style={s.progInactive} />
              <div style={s.progInactive} />
            </div>
          </div>

          <div style={s.stats}>
            <div style={s.stat}>
              <span style={s.statVal}>{formatCount(likeCount)}</span>
              <span style={s.statLbl}>LIKES</span>
            </div>
            <div style={s.statSep} />
            <div style={s.stat}>
              <span style={s.statVal}>{formatCount(commentCount)}</span>
              <span style={s.statLbl}>COMMENTS</span>
            </div>
            <div style={s.statSep} />
            <div style={s.stat}>
              <span style={s.statVal}>—</span>
              <span style={s.statLbl}>GENERATED</span>
            </div>
          </div>

          <div style={s.actions}>
            <LikeButton
              targetType="character"
              targetId={character.id}
              initialLiked={liked}
              initialCount={likeCount}
              size="lg"
              showCount={false}
              onToggle={(newLiked, newCount) => { setLiked(newLiked); setLikeCount(newCount); }}
            />
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
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <div style={s.head}>
            <h2 style={s.name}>{character.name}{age ? `, ${age}` : ""}</h2>
            <div style={s.tagsRow}>
              {rawTags.slice(0, 10).map((t, i) => (
                <span key={i} style={s.tag}>{String(t)}</span>
              ))}
            </div>
          </div>

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
                creator={character.creator ?? null}
              />
            )}
            {tab === "gallery" && <GalleryTab avatarUrl={character.avatarUrl} />}
            {tab === "comments" && (
              <CommentsTab
                items={commentItems}
                commentCount={commentCount}
                hasMore={!!commentCursor}
                onLoadMore={loadComments}
              />
            )}
          </div>

          {tab === "comments" && (
            <div style={s.commentFooter}>
              {user ? (
                <>
                  <input
                    style={s.commentInput}
                    placeholder="Leave a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSendComment(); }}
                  />
                  <button style={s.sendBtn} onClick={handleSendComment} disabled={submitting}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={submitting ? "#444" : "#848484"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </>
              ) : (
                <button
                  style={{ ...s.commentInput, cursor: "pointer", textAlign: "left", color: "#848484" }}
                  onClick={() => router.push("/login")}
                >
                  Sign in to comment...
                </button>
              )}
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

function AboutTab({ description, age, personality, lifestyle, relationships, kinks, hobbies, creator }: {
  description: string; age: string; personality: string; lifestyle: string;
  relationships: string; kinks: string; hobbies: string;
  creator: Character["creator"] | null;
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

      {creator && (
        <>
          <p style={{ ...s.secLabel, marginTop: 22 }}>CREATOR</p>
          <CreatorSection creator={creator} />
        </>
      )}
    </div>
  );
}

function CreatorSection({ creator }: {
  creator: NonNullable<Character["creator"]>
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  useEffect(() => {
    if (!user || !creator.nickname) return;
    users.getFollowStatus(creator.nickname)
      .then((r) => setFollowing(r.following))
      .catch(() => {});
  }, [user, creator.nickname]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !creator.nickname || followLoading) return;
    setFollowLoading(true);
    try {
      if (following) {
        await users.unfollow(creator.nickname);
        setFollowing(false);
      } else {
        await users.follow(creator.nickname);
        setFollowing(true);
      }
    } catch {}
    setFollowLoading(false);
  };

  const goToProfile = () => {
    if (creator.nickname) router.push(`/users/${creator.nickname}`);
  };

  return (
    <div style={s.creatorRow}>
      <div
        style={{ ...s.creatorAva, cursor: creator.nickname ? "pointer" : "default" }}
        onClick={creator.nickname ? goToProfile : undefined}
      >
        {creator.avatarUrl && (
          <img src={resizedMediaUrl(creator.avatarUrl, { w: 96 }) ?? creator.avatarUrl} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
        )}
      </div>
      <div>
        <div
          style={{ ...s.creatorName, cursor: creator.nickname ? "pointer" : "default" }}
          onClick={creator.nickname ? goToProfile : undefined}
        >
          @{creator.nickname || "unknown"}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
          {creator.likeCount !== undefined && (
            <span style={{ fontSize: 12, color: "#c1f0aa" }}>{formatCount(creator.likeCount)} ♥</span>
          )}
          {creator.followerCount !== undefined && (
            <span style={{ fontSize: 12, color: "#848484" }}>{formatCount(creator.followerCount)} 👥</span>
          )}
        </div>
      </div>
      <div style={{ flex: 1 }} />
      {creator.nickname && (
        <button style={s.outlineBtn} onClick={goToProfile}>More Characters</button>
      )}
      {user && creator.nickname && user.id !== creator.id && (
        <button
          style={{ ...s.outlineBtn, ...(following ? { borderColor: "#f95bad", color: "#f95bad" } : {}) }}
          onClick={handleFollow}
          disabled={followLoading}
        >
          {following ? "Following 🟢" : "Follow 🟢"}
        </button>
      )}
    </div>
  );
}

function GalleryTab({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ ...s.secLabel, margin: 0 }}>GENERATED CONTENT</p>
        <span style={{ color: "#f95bad", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>VIEW ALL</span>
      </div>
      <div style={s.galGrid}>
        {Array.from({ length: 12 }).map((_, i) => {
          const isPremium = i === 5;
          const isBlurred = i > 5 && i < 9;
          return (
            <div key={i} style={{ ...s.galCard, ...(isBlurred ? s.galBlurred : {}) }}>
              {avatarUrl && i < 2
                ? <img src={resizedMediaUrl(avatarUrl, { w: 400 }) ?? avatarUrl} alt="" style={s.galImg} loading="lazy" decoding="async" />
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

function CommentsTab({ items, commentCount, hasMore, onLoadMore }: {
  items: CommentItem[];
  commentCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <p style={{ ...s.secLabel, margin: 0 }}>COMMENTS</p>
        <span style={{ color: "#f95bad", fontSize: 11, fontWeight: 700 }}>
          {commentCount} total
        </span>
      </div>
      {items.length === 0 && (
        <p style={{ color: "#848484", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
          No comments yet. Be the first to comment!
        </p>
      )}
      {items.map((c) => (
        <div key={c.id} style={s.commentRow}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={s.commentUser}>@{c.user.nickname || "user"}</span>
              <span style={s.commentDate}>{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
            <p style={s.commentText}>{c.content}</p>
          </div>
          <LikeButton
            targetType="comment"
            targetId={c.id}
            initialLiked={c.liked}
            initialCount={c.likeCount}
            size="sm"
            showCount={true}
          />
        </div>
      ))}
      {hasMore && (
        <button onClick={onLoadMore} style={s.loadMoreBtn}>
          Load more comments
        </button>
      )}
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
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 12px 16px",
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
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 28px",
    scrollbarWidth: "none" as const,
  },
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
  loadMoreBtn: {
    width: "100%",
    padding: "12px 0",
    background: "transparent",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    color: "#bbb",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    marginTop: 12,
  },
};
