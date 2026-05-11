"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth";
import { users, getPublicGallery, characters as charactersApi } from "../../../lib/api";
import type { PublicUserProfile, GalleryItem, Character } from "../../../lib/api";
import LikeButton from "../../components/LikeButton";
import FilterDropdown from "../../components/FilterDropdown";
import ScrollableTagsRow from "../../components/ScrollableTagsRow";
import CharacterProfilePopup from "../../components/CharacterProfilePopup";

const PAGE_CSS = `
  .up-wrap {
    display: flex;
    min-height: calc(100vh - 46px);
  }

  /* ── LEFT SIDEBAR ── */
  .up-sidebar {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid #1e1e1e;
    padding: 28px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #0d0d0d;
    position: sticky;
    top: 46px;
    height: calc(100vh - 46px);
    overflow-y: auto;
  }
  .up-sidebar::-webkit-scrollbar { display: none; }

  .up-avatar {
    width: 80px;
    height: 80px;
    border-radius: 12px;
    object-fit: cover;
    background: linear-gradient(135deg, #2d1b3d, #1a0a2e);
    flex-shrink: 0;
  }

  .up-name {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    font-family: 'Syne', sans-serif;
    margin: 0;
  }
  .up-handle {
    font-size: 12px;
    color: #848484;
    margin: 0;
  }

  .up-stats {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .up-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  .up-stat-likes { color: #c1f0aa; }
  .up-stat-followers { color: #848484; }

  .up-socials {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .up-social-link {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #2a2a2a;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.15s;
    text-decoration: none;
    color: #848484;
  }
  .up-social-link:hover { border-color: #f95bad; color: #f95bad; }

  .up-follow-btn {
    width: 100%;
    height: 38px;
    border-radius: 8px;
    border: 1px solid #2a2a2a;
    background: transparent;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: 'Syne', sans-serif;
    transition: all 0.15s;
  }
  .up-follow-btn:hover { border-color: #f95bad; color: #f95bad; }
  .up-follow-btn.following {
    background: rgba(249,91,173,0.12);
    border-color: #f95bad;
    color: #f95bad;
  }

  .up-about-label {
    font-size: 9px;
    font-weight: 600;
    color: #848484;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0;
  }
  .up-about-text {
    font-size: 12px;
    color: #aaa;
    line-height: 1.6;
    margin: 0;
  }
  .up-read-more {
    font-size: 11px;
    color: #f95bad;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font-family: 'Syne', sans-serif;
    font-weight: 600;
  }

  /* ── MAIN CONTENT ── */
  .up-content {
    flex: 1;
    min-width: 0;
    padding: 28px 28px 60px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .up-search-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .up-search-wrap {
    flex: 1;
    position: relative;
  }
  .up-search-input {
    width: 100%;
    height: 36px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    color: #fff;
    font-size: 13px;
    padding: 0 12px 0 36px;
    outline: none;
    box-sizing: border-box;
    font-family: 'Syne', sans-serif;
  }
  .up-search-input::placeholder { color: #848484; }
  .up-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #848484;
    pointer-events: none;
  }

  .up-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .up-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .up-card-wrap {
    position: relative;
    width: 200px;
    height: 280px;
    flex-shrink: 0;
  }
  .up-card-wrap:hover { z-index: 5; }
  .up-card {
    width: 200px;
    height: 280px;
    border-radius: 8px;
    border: 1px solid #313131;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    background: #1e1e1e;
    transition: border-color 0.15s;
  }
  .up-card-wrap:hover .up-card { border-color: #5b5b5b; }
  .up-card-thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .up-card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(9,9,9,0) 50%, rgba(9,9,9,0.75) 100%);
  }
  .up-card-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    height: 20px;
    background: rgba(9,9,9,0.65);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    font-size: 9px;
    font-weight: 600;
    color: #fff;
    z-index: 3;
  }
  .up-card-name {
    position: absolute;
    bottom: 10px;
    left: 10px;
    right: 10px;
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    font-family: 'Syne', sans-serif;
    z-index: 3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .up-hover-panel {
    position: absolute;
    inset: 0;
    background: rgba(9,9,9,0.75);
    backdrop-filter: blur(2px);
    border: 0.8px solid rgba(228,0,120,0.2);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 10px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 4;
    gap: 6px;
  }
  .up-card-wrap:hover .up-hover-panel {
    opacity: 1;
    pointer-events: auto;
  }
  .up-hover-btn {
    width: 100%;
    height: 28px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    border: none;
    font-family: 'Syne', sans-serif;
    background: linear-gradient(90deg, #f95bad, #ff0084);
  }

  .up-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 60px 0;
    color: #969696;
    font-size: 14px;
  }

  .up-skeleton {
    width: 200px;
    height: 280px;
    border-radius: 8px;
    background: #1e1e1e;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
  }
  .up-skeleton::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
    animation: up-shimmer 1.4s infinite;
  }
  @keyframes up-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* ── MOBILE ── */
  @media (max-width: 768px) {
    .up-wrap { flex-direction: column; }
    .up-sidebar {
      width: 100%;
      position: static;
      height: auto;
      border-right: none;
      border-bottom: 1px solid #1e1e1e;
      padding: 20px 16px;
    }
    .up-sidebar-top {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .up-avatar { width: 72px; height: 72px; }
    .up-content { padding: 16px 16px 40px; }
    .up-card-wrap { width: calc(50% - 8px); height: 200px; }
    .up-card { width: 100%; height: 200px; }
    .up-hover-panel { height: 200px; }
    .up-skeleton { width: calc(50% - 8px); height: 200px; }
  }
`;

const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "character", label: "Character" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

function SocialIcon({ provider }: { provider: string }) {
  switch (provider) {
    case "tiktok":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.85a8.27 8.27 0 004.84 1.55V6.95a4.85 4.85 0 01-1.07-.26z"/>
        </svg>
      );
    case "instagram":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="20" rx="5"/>
          <circle cx="12" cy="12" r="4"/>
          <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
        </svg>
      );
    case "x":
    case "twitter":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.726-8.84L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    case "vk":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.07 2H8.93C3.33 2 2 3.33 2 8.93v6.14C2 20.67 3.33 22 8.93 22h6.14C20.67 22 22 20.67 22 15.07V8.93C22 3.33 20.67 2 15.07 2zm3.08 13.5h-1.71c-.64 0-.84-.51-2-1.67-1-.98-1.44-.98-1.7-.98-.35 0-.45.1-.45.58v1.52c0 .41-.13.66-1.22.66-1.8 0-3.8-1.09-5.2-3.12C4.38 10.15 4 8.3 4 7.88c0-.26.1-.5.58-.5h1.71c.43 0 .6.2.77.65.84 2.42 2.27 4.54 2.85 4.54.22 0 .32-.1.32-.65V9.77c-.07-1.17-.68-1.27-.68-1.69 0-.2.16-.4.42-.4h2.7c.36 0 .49.19.49.62v3.33c0 .36.15.49.26.49.22 0 .41-.13.82-.54 1.27-1.43 2.18-3.62 2.18-3.62.12-.26.32-.5.74-.5h1.71c.51 0 .62.27.51.62-.22 1.05-2.37 4.05-2.37 4.05-.19.31-.26.45 0 .8.19.26.81.8 1.22 1.28.77.88 1.36 1.62 1.52 2.14.15.5-.11.76-.6.76z"/>
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      );
  }
}

type ContentItem =
  | { kind: "gallery"; item: GalleryItem }
  | { kind: "character"; item: Character };

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const nickname = params?.nickname as string;

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [search, setSearch] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aboutExpanded, setAboutExpanded] = useState(false);

  const [selectedChar, setSelectedChar] = useState<Character | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Load public profile
  useEffect(() => {
    if (!nickname || authLoading || !user) return;
    setProfileLoading(true);
    users.getPublicProfile(nickname)
      .then((p) => {
        setProfile(p);
        setFollowing(p.isFollowing);
        setProfileLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setProfileLoading(false);
      });
  }, [nickname, authLoading, user]);

  // Load content (gallery + characters) when profile is available
  const loadContent = useCallback(async () => {
    if (!profile) return;
    setContentLoading(true);

    try {
      const showChars = !typeFilter || typeFilter === "character";
      const showMedia = !typeFilter || typeFilter === "image" || typeFilter === "video";

      const [galleryData, charsData] = await Promise.all([
        showMedia
          ? getPublicGallery({
              userId: profile.id,
              type: typeFilter && typeFilter !== "character" ? typeFilter : undefined,
              sortBy: sortBy === "oldest" ? "oldest" : "newest",
              limit: 60,
            })
          : Promise.resolve({ items: [], total: 0 }),
        showChars
          ? charactersApi.listPublic({ createdByUserId: profile.id, sortBy: sortBy === "oldest" ? "oldest" : "newest", limit: 60 })
          : Promise.resolve({ items: [], total: 0 }),
      ]);

      const combined: ContentItem[] = [];

      if (showMedia) {
        for (const g of galleryData.items) {
          combined.push({ kind: "gallery", item: g });
        }
      }

      if (showChars) {
        for (const c of charsData.items) {
          combined.push({ kind: "character", item: c });
        }
      }

      // Sort combined by date if "newest"
      combined.sort((a, b) => {
        const aDate = a.kind === "gallery" ? a.item.createdAt : (a.item as Character).createdAt;
        const bDate = b.kind === "gallery" ? b.item.createdAt : (b.item as Character).createdAt;
        return sortBy === "oldest"
          ? new Date(aDate).getTime() - new Date(bDate).getTime()
          : new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      setContentItems(combined);
    } catch {
      setContentItems([]);
    } finally {
      setContentLoading(false);
    }
  }, [profile, typeFilter, sortBy]);

  useEffect(() => {
    if (profile) loadContent();
  }, [profile, loadContent]);

  // Tag filtering (client-side on character tags + gallery prompts)
  const filteredItems = search || selectedTags.length > 0
    ? contentItems.filter((ci) => {
        const searchLower = search.toLowerCase();
        if (ci.kind === "gallery") {
          const prompt = (ci.item.input?.prompt || "").toLowerCase();
          const matchSearch = !search || prompt.includes(searchLower);
          const matchTags = selectedTags.length === 0 || selectedTags.some((t) => prompt.includes(t.toLowerCase()));
          return matchSearch && matchTags;
        } else {
          const c = ci.item as Character;
          const name = c.name.toLowerCase();
          const matchSearch = !search || name.includes(searchLower) || c.tags.some((t) => t.toLowerCase().includes(searchLower));
          const matchTags = selectedTags.length === 0 || selectedTags.some((t) => c.tags.some((ct) => ct.toLowerCase() === t.toLowerCase()));
          return matchSearch && matchTags;
        }
      })
    : contentItems;

  // Collect tags from characters for the tag bar
  useEffect(() => {
    const tagSet = new Set<string>();
    contentItems.forEach((ci) => {
      if (ci.kind === "character") {
        (ci.item as Character).tags.forEach((t) => tagSet.add(t));
      }
    });
    setTags(Array.from(tagSet).slice(0, 30));
  }, [contentItems]);

  const handleFollow = async () => {
    if (!user || followLoading) return;
    setFollowLoading(true);
    try {
      if (following) {
        await users.unfollow(nickname);
        setFollowing(false);
        setProfile((p) => p ? { ...p, followerCount: Math.max(0, p.followerCount - 1) } : p);
      } else {
        await users.follow(nickname);
        setFollowing(true);
        setProfile((p) => p ? { ...p, followerCount: p.followerCount + 1 } : p);
      }
    } catch {}
    setFollowLoading(false);
  };

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const aboutText = profile?.aboutMe || "";
  const shouldTruncate = aboutText.length > 200;
  const displayAbout = shouldTruncate && !aboutExpanded ? aboutText.slice(0, 200) + "..." : aboutText;

  if (authLoading || profileLoading) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
        <div className="up-wrap">
          <div className="up-sidebar">
            <div className="up-skeleton" style={{ width: 80, height: 80, borderRadius: 12 }} />
            <div className="up-skeleton" style={{ width: 140, height: 16, borderRadius: 4 }} />
            <div className="up-skeleton" style={{ width: 100, height: 12, borderRadius: 4 }} />
          </div>
          <div className="up-content">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="up-skeleton" />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 46px)", flexDirection: "column", gap: 12, color: "#848484" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.2">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <p style={{ margin: 0, fontSize: 16, color: "#fff" }}>User not found</p>
          <p style={{ margin: 0, fontSize: 13 }}>@{nickname} doesn&apos;t exist</p>
        </div>
      </>
    );
  }

  const isOwnProfile = user?.id === profile?.id;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="up-wrap">

        {/* ── SIDEBAR ── */}
        <aside className="up-sidebar">
          <div className="up-sidebar-top" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {profile?.avatarUrl
              ? <img src={profile.avatarUrl} alt={profile.nickname || ""} className="up-avatar" />
              : <div className="up-avatar" style={{ background: "linear-gradient(135deg, #2d1b3d, #1a0a2e)", borderRadius: 12 }} />
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="up-name">{profile?.nickname || nickname}</p>
              <p className="up-handle">@{profile?.nickname || nickname}</p>
              <div className="up-stats" style={{ marginTop: 6 }}>
                <span className="up-stat up-stat-likes">
                  {formatCount(profile?.likeCount ?? 0)} ♥
                </span>
                <span className="up-stat up-stat-followers">
                  {formatCount(profile?.followerCount ?? 0)}&nbsp;
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* Social links */}
          {profile?.socialLinks && profile.socialLinks.length > 0 && (
            <div className="up-socials">
              {profile.socialLinks.map((sl) => (
                <a
                  key={sl.provider}
                  href={sl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="up-social-link"
                  title={sl.provider}
                >
                  <SocialIcon provider={sl.provider} />
                </a>
              ))}
            </div>
          )}

          {/* Follow button */}
          {!isOwnProfile && (
            <button
              className={`up-follow-btn${following ? " following" : ""}`}
              onClick={handleFollow}
              disabled={followLoading}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: following ? "#f95bad" : "#4caf50", flexShrink: 0 }} />
              {following ? "Following" : "Follow"}
            </button>
          )}

          {/* About me */}
          {aboutText && (
            <div>
              <p className="up-about-label">About me</p>
              <p className="up-about-text" style={{ marginTop: 6 }}>{displayAbout}</p>
              {shouldTruncate && (
                <button className="up-read-more" onClick={() => setAboutExpanded((v) => !v)}>
                  {aboutExpanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="up-content">
          {/* Search + filter row */}
          <div className="up-search-row">
            <div className="up-search-wrap">
              <svg className="up-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                className="up-search-input"
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  if (searchTimeout.current) clearTimeout(searchTimeout.current);
                  searchTimeout.current = setTimeout(() => setSearch(v), 300);
                  // Immediate update for empty
                  if (!v) setSearch("");
                }}
              />
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <ScrollableTagsRow
              tags={tags}
              selected={selectedTags}
              onToggle={(tag) =>
                setSelectedTags((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                )
              }
            />
          )}

          {/* Filter dropdowns */}
          <div className="up-filter-row">
            <FilterDropdown
              label="Type"
              value={typeFilter}
              options={TYPE_OPTIONS}
              onChange={setTypeFilter}
            />
            <FilterDropdown
              label="Sort by"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={setSortBy}
            />
          </div>

          {/* Grid */}
          {contentLoading ? (
            <div className="up-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="up-skeleton" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="up-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <span>No content yet</span>
            </div>
          ) : (
            <div className="up-grid">
              {filteredItems.map((ci, idx) => {
                if (ci.kind === "gallery") {
                  const g = ci.item;
                  const url = g.output?.url;
                  const isVideo = g.type === "video";
                  return (
                    <div key={`g-${g.jobId}`} className="up-card-wrap">
                      <div className="up-hover-panel">
                        {g.input?.prompt && (
                          <p style={{ fontSize: 10, color: "#fff", margin: 0, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any }}>
                            {g.input.prompt}
                          </p>
                        )}
                        <button
                          className="up-hover-btn"
                          onClick={() => {
                            if (url) window.open(url, "_blank");
                          }}
                        >
                          View
                        </button>
                      </div>
                      <div className="up-card">
                        {url ? (
                          isVideo
                            ? <video className="up-card-thumb" src={url} muted loop preload="metadata" playsInline />
                            : <img className="up-card-thumb" src={url} alt="" loading="lazy" />
                        ) : (
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)" }} />
                        )}
                        <div className="up-card-overlay" />
                        <div className="up-card-badge">
                          {isVideo ? (
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" strokeWidth="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                          ) : (
                            <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          )}
                          {isVideo ? "Video" : "Image"}
                        </div>
                        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5 }}>
                          <LikeButton
                            targetType="gallery_item"
                            targetId={g.jobId}
                            size="sm"
                            showCount={false}
                            initialLiked={false}
                            initialCount={0}
                          />
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  const c = ci.item as Character;
                  const p = (c.personality as Record<string, unknown>) || {};
                  const age = p.age ? String(p.age) : "";
                  return (
                    <div key={`c-${c.id}`} className="up-card-wrap">
                      <div className="up-hover-panel">
                        <p style={{ fontSize: 10, color: "#fff", margin: 0, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any }}>
                          {c.tags.slice(0, 5).join(", ")}
                        </p>
                        <button
                          className="up-hover-btn"
                          onClick={() => setSelectedChar(c)}
                        >
                          View Profile
                        </button>
                      </div>
                      <div className="up-card" onClick={() => setSelectedChar(c)}>
                        {c.avatarUrl
                          ? <img className="up-card-thumb" src={c.avatarUrl} alt={c.name} loading="lazy" />
                          : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${135 + idx * 20}deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)` }} />
                        }
                        <div className="up-card-overlay" />
                        <div className="up-card-badge">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                          Character
                        </div>
                        <div className="up-card-name">{c.name}{age ? `, ${age}` : ""}</div>
                      </div>
                    </div>
                  );
                }
              })}
            </div>
          )}
        </main>
      </div>

      {/* Character popup */}
      {selectedChar && (
        <CharacterProfilePopup
          character={selectedChar}
          onClose={() => setSelectedChar(null)}
        />
      )}
    </>
  );
}
