"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { characters, getGenerationHistory, likes, deleteGenerationJob, resizedMediaUrl } from "../../lib/api";
import type { Character } from "../../lib/api";
import FilterDropdown from "../components/FilterDropdown";
import ScrollableTagsRow from "../components/ScrollableTagsRow";
import LikeButton from "../components/LikeButton";
import { useT } from "../../context/language";

const PAGE_CSS = `
  .my-ai-content {
    position: relative;
    min-height: calc(100vh - 46px);
    padding: 28px 36px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .my-ai-title-row {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding-top: 4px;
  }
  .my-ai-title {
    font-weight: 700;
    font-size: 32px;
    line-height: 1.1;
    text-align: center;
  }
  .my-ai-title .pink { color: #f95bad; }
  .my-ai-title .white { color: #fff; }

  .manage-btn {
    position: absolute;
    right: 0;
    top: 4px;
    height: 30px;
    background: transparent;
    border: 1px solid #313131;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
  }
  .manage-btn:hover { border-color: #f95bad; }
  .manage-btn.active { border-color: #f95bad; background: rgba(249,91,173,0.1); }

  .my-ai-tabs {
    display: flex;
    align-items: center;
    background: #252525;
    border-radius: 6px;
    padding: 3px;
    width: fit-content;
    align-self: center;
  }
  .my-ai-tab {
    padding: 6px 20px;
    font-size: 12px;
    font-weight: 600;
    color: #969696;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    background: none;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .my-ai-tab.active {
    background: #1e1e1e;
    color: #fff;
  }

  .my-ai-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .my-ai-search {
    flex: 1;
    height: 34px;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 8;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-radius: 8px;
  }
  .my-ai-search input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'Syne', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    min-width: 0;
  }
  .my-ai-search input::placeholder { color: #848484; }

  .my-ai-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 18px;
    width: 100%;
  }

  .ai-card-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 22 / 30;
  }
  .ai-card-wrap:hover { z-index: 5; }

  .ai-hover-panel {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: rgba(9,9,9,0.75);
    backdrop-filter: blur(2px);
    border: 0.8px solid rgba(228,0,120,0.2);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    padding: 12px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 4;
  }
  .ai-card-wrap:hover .ai-hover-panel {
    opacity: 1;
    pointer-events: auto;
  }

  .ai-hover-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    align-content: flex-start;
  }
  .ai-hover-tag {
    background: rgba(255,153,206,0.6);
    backdrop-filter: blur(2px);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 8px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
  }
  .ai-hover-description {
    font-size: 10px;
    font-weight: 500;
    color: #fff;
    line-height: 1.3;
    width: 100%;
  }
  .ai-hover-actions {
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .ai-hover-btn {
    flex: 1;
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
    white-space: nowrap;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .ai-hover-btn.primary {
    background: linear-gradient(90deg, #f95bad, #ff0084);
  }
  .ai-hover-btn.secondary {
    background: rgba(48,39,43,0.6);
    border: 1px solid rgba(255,255,255,0.12);
  }

  .ai-card-top-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .ai-card-wrap:hover .ai-card-top-actions { opacity: 1; }
  .ai-card-action-btn {
    width: 28px;
    height: 28px;
    background: rgba(48,39,43,0.55);
    backdrop-filter: blur(2px);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    padding: 0;
  }
  .ai-card-action-btn:hover { background: rgba(249,91,173,0.3); }

  .ai-card {
    border: 1px solid #313131;
    border-radius: 8px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 8px;
  }
  .ai-card-wrap:hover .ai-card { border-color: #5b5b5b; }
  .ai-card.char-card { border-color: #313131; }
  .ai-card.char-card.featured {
    box-shadow: 0 0 12px 0 rgba(249,91,173,0.2);
    border-color: rgba(249,91,173,0.35);
  }

  .ai-card-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: 8px;
  }
  .ai-card-bg img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
  }
  .ai-card-overlay {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    background: linear-gradient(to bottom, rgba(9,9,9,0) 50%, rgba(9,9,9,0.85) 100%);
  }

  .ai-card-type-badge {
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
    white-space: nowrap;
  }

  .ai-card-footer {
    position: relative;
    z-index: 3;
  }
  .ai-card-name {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ai-card-pink-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #f95bad;
    box-shadow: 0 0 6px 1px rgba(249,91,173,0.6);
    z-index: 4;
  }

  .manage-select-circle {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.5);
    background: rgba(0,0,0,0.3);
    z-index: 11;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .manage-select-circle.selected {
    border-color: #f95bad;
    background: #f95bad;
  }

  .manage-bar {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e1e;
    border: 1px solid #313131;
    border-radius: 12px;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 50;
    font-family: 'Syne', sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .ai-card-skeleton {
    width: 100%;
    aspect-ratio: 22 / 30;
    border-radius: 8px;
    background: #1e1e1e;
    position: relative;
    overflow: hidden;
  }
  .ai-card-skeleton::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
    animation: skeleton-shimmer 1.4s infinite;
  }
  @keyframes skeleton-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .my-ai-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 60px 0;
    color: #969696;
    font-size: 14px;
    width: 100%;
  }
  .my-ai-empty svg { opacity: 0.3; }

  @media (max-width: 768px) {
    .my-ai-content { padding: 16px 16px 40px; gap: 14px; }
    .my-ai-title { font-size: 22px; }
    .manage-btn { display: none; }
    .my-ai-filter-row { flex-wrap: wrap; }
    .my-ai-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  }
`;

interface GridItem {
  id?: string;
  jobId?: string;
  type: string;
  name: string;
  age?: number;
  avatarUrl?: string | null;
  url?: string | null;
  description?: string;
  tags?: string[];
  featured?: boolean;
  createdAt: string;
  gender?: string;
  style?: string;
}

function MyAICard({
  item,
  manageMode,
  selected,
  onToggleSelect,
  likeStatus,
  onOpen,
}: {
  item: GridItem;
  manageMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  likeStatus?: { liked: boolean; count: number };
  onOpen?: (item: GridItem) => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const isCharacter = item.type === "Character";
  const bg = item.avatarUrl || item.url;
  const tagsHtml = (item.tags || []).slice(0, 6);
  const desc = item.description || "";

  const targetType = isCharacter ? "character" : "gallery_item";
  const targetId = isCharacter ? item.id! : item.jobId!;

  return (
    <div className="ai-card-wrap">
      {manageMode && (
        <div
          className={`manage-select-circle${selected ? " selected" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 8l4 4 6-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      )}
      {!manageMode && (
        <>
          <div className="ai-hover-panel">
            <div className="ai-hover-tags">
              {tagsHtml.map((tag, i) => <span className="ai-hover-tag" key={i}>{tag}</span>)}
            </div>
            <p className="ai-hover-description" style={desc ? {} : { color: "#969696" }}>
              {desc ? (desc.length > 120 ? desc.slice(0, 120) + "…" : desc) : t("chat.noDescription")}
            </p>
            <div className="ai-hover-actions">
              {isCharacter ? (
                <>
                  <button className="ai-hover-btn primary" onClick={(e) => {
                    e.stopPropagation();
                    if (item.id) router.push(`/chat?characterId=${item.id}`);
                  }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M14 10a1.3 1.3 0 01-1.3 1.3H4.7L2 13.7V3.3A1.3 1.3 0 013.3 2h9.4A1.3 1.3 0 0114 3.3V10z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {t("myai.chatNow")}
                  </button>
                </>
              ) : (
                <>
                  <button className="ai-hover-btn primary" onClick={(e) => {
                    e.stopPropagation();
                    if (item.url) onOpen?.(item);
                  }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6"/><path d="M6 5l5 3-5 3V5z" fill="currentColor" stroke="none"/></svg>
                    {t("gallery.view")}
                  </button>
                  <button className="ai-hover-btn secondary" onClick={(e) => {
                    e.stopPropagation();
                    const shareUrl = item.url;
                    if (shareUrl && navigator.share) navigator.share({ url: shareUrl }).catch(() => {});
                  }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" strokeWidth="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    {t("gallery.share")}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="ai-card-top-actions">
            <div className="ai-card-action-btn">
              <LikeButton targetType={targetType} targetId={targetId} size="sm" showCount={false} initialLiked={likeStatus?.liked || false} initialCount={likeStatus?.count || 0} />
            </div>
          </div>
        </>
      )}
      <div className={`ai-card${isCharacter ? " char-card" : ""}${item.featured ? " featured" : ""}`}>
        <div className="ai-card-bg">
          {bg ? (
            item.type === "Video" ? (
              <video src={bg} muted loop playsInline preload="metadata" onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <img src={resizedMediaUrl(bg, { w: 400 }) ?? bg} alt={item.name || ""} loading="lazy" decoding="async" />
            )
          ) : (
            <div style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)", borderRadius: 8 }} />
          )}
          <div className="ai-card-overlay" />
        </div>
        <div className="ai-card-type-badge">
          {item.type === "Image" ? (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : item.type === "Video" ? (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" strokeWidth="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="#fff" strokeWidth="1.2"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
          )}
          {item.type === "Character" ? t("media.character") : item.type === "Video" ? t("media.video") : t("media.image")}
        </div>
        {isCharacter && item.name && (
          <>
            <div className="ai-card-footer">
              <div className="ai-card-name">{item.name}{item.age ? `, ${item.age}` : ""}</div>
            </div>
            <div className="ai-card-pink-bar" />
          </>
        )}
        {!isCharacter && item.name && (
          <div className="ai-card-footer">
            <div className="ai-card-name" style={{ fontSize: 13 }}>{item.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyAIPage() {
  const { t } = useT();
  const TYPE_OPTIONS = [
    { value: "", label: t("common.all") },
    { value: "Character", label: t("media.character") },
    { value: "Image", label: t("media.image") },
    { value: "Video", label: t("media.video") },
  ];
  const GENDER_OPTIONS = [
    { value: "", label: t("common.all") },
    { value: "Female", label: t("filter.female") },
    { value: "Male", label: t("filter.male") },
    { value: "Non-binary", label: t("filter.nonbinary") },
  ];
  const STYLE_OPTIONS = [
    { value: "", label: t("common.all") },
    { value: "Realistic", label: t("filter.realistic") },
    { value: "Anime", label: t("filter.anime") },
    { value: "Fantasy", label: t("filter.fantasy") },
  ];
  const SORT_OPTIONS = [
    { value: "newest", label: t("filter.newest") },
    { value: "oldest", label: t("filter.oldest") },
    { value: "name", label: t("filter.name") },
  ];
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("created");
  const [items, setItems] = useState<GridItem[]>([]);
  const [likedItems, setLikedItems] = useState<GridItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [gender, setGender] = useState("");
  const [style, setStyle] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);

  const loadCreated = useCallback(() => {
    if (!user) return;
    setFetching(true);
    Promise.all([
      characters.listMy().catch(() => []),
      getGenerationHistory().catch(() => []),
    ]).then(([myChars, history]) => {
      const allItems: GridItem[] = [
        ...myChars.map((c: Character) => {
          const p = (c.personality as Record<string, unknown> | null) || {};
          return {
            id: c.id,
            type: "Character",
            name: c.name,
            age: p["age"] as number | undefined,
            avatarUrl: c.avatarUrl,
            url: null,
            description: (p["description"] as string) || (p["bio"] as string) || "",
            tags: (p["tags"] as string[]) || (p["traits"] as string[]) || [],
            featured: c.isPublic,
            createdAt: c.createdAt,
            gender: (p["gender"] as string) || "",
            style: (p["style"] as string) || "",
          };
        }),
        ...history.map((h) => ({
          jobId: h.jobId,
          type: h.type === "video" ? "Video" : "Image",
          name: (h.input as { prompt?: string } | null)?.prompt?.slice(0, 20) || "Generated",
          avatarUrl: null,
          url: (h.output as { url?: string } | null)?.url,
          description: (h.input as { prompt?: string } | null)?.prompt || "",
          tags: [] as string[],
          featured: false,
          createdAt: h.createdAt,
          gender: "",
          style: "",
        })),
      ];
      setItems(allItems);

      const allTags = new Set<string>();
      allItems.forEach((item) => (item.tags || []).forEach((t) => allTags.add(t)));
      setTags(Array.from(allTags));
    }).finally(() => setFetching(false));
  }, [user]);

  const loadLiked = useCallback(() => {
    if (!user) return;
    setFetching(true);
    Promise.all([
      likes.getMyLiked("character", 1, 50).catch(() => ({ items: [], total: 0 })),
      likes.getMyLiked("gallery_item", 1, 50).catch(() => ({ items: [], total: 0 })),
    ]).then(([charLiked, galleryLiked]) => {
      const mapped: GridItem[] = [
        ...charLiked.items.map((item: any) => ({
          id: item.id,
          type: "Character",
          name: item.name || "Character",
          avatarUrl: item.avatarUrl || null,
          url: null,
          description: "",
          tags: [],
          featured: false,
          createdAt: item.createdAt || "",
          gender: "",
          style: "",
        })),
        ...galleryLiked.items.map((item: any) => ({
          jobId: item.jobId || item.id,
          type: item.type === "video" ? "Video" : "Image",
          name: item.input?.prompt?.slice(0, 20) || "Generated",
          avatarUrl: null,
          url: item.output?.url || null,
          description: item.input?.prompt || "",
          tags: [],
          featured: false,
          createdAt: item.createdAt || "",
          gender: "",
          style: "",
        })),
      ];
      setLikedItems(mapped);
    }).finally(() => setFetching(false));
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (activeTab === "created") loadCreated();
    else loadLiked();
  }, [user, loading, router, activeTab, loadCreated, loadLiked]);

  useEffect(() => {
    const source = activeTab === "created" ? items : likedItems;
    if (source.length === 0 || !user) return;
    const charIds = source.filter((i) => i.type === "Character" && i.id).map((i) => i.id!);
    const galleryIds = source.filter((i) => i.type !== "Character" && i.jobId).map((i) => i.jobId!);
    const promises: Promise<void>[] = [];
    if (charIds.length > 0) {
      promises.push(
        likes.batchStatus("character", charIds)
          .then((r) => setLikeStatuses((prev) => ({ ...prev, ...r })))
          .catch(() => {})
      );
    }
    if (galleryIds.length > 0) {
      promises.push(
        likes.batchStatus("gallery_item", galleryIds)
          .then((r) => setLikeStatuses((prev) => ({ ...prev, ...r })))
          .catch(() => {})
      );
    }
    Promise.all(promises);
  }, [items, likedItems, activeTab, user]);

  const sourceItems = activeTab === "created" ? items : likedItems;

  const filtered = sourceItems.filter((item) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = (item.description || "").toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    if (typeFilter && item.type !== typeFilter) return false;
    if (gender && item.gender?.toLowerCase() !== gender.toLowerCase()) return false;
    if (style && item.style?.toLowerCase() !== style.toLowerCase()) return false;
    if (selectedTags.length > 0) {
      const itemTags = (item.tags || []).map((t) => t.toLowerCase());
      if (!selectedTags.some((st) => itemTags.includes(st.toLowerCase()))) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const promises = Array.from(selectedIds).map((id) => {
      const item = items.find((i) => (i.id || i.jobId) === id);
      if (!item) return Promise.resolve();
      if (item.type === "Character") return Promise.resolve();
      if (item.jobId) return deleteGenerationJob(item.jobId).catch(() => {});
      return Promise.resolve();
    });
    await Promise.all(promises);
    setSelectedIds(new Set());
    setManageMode(false);
    setDeleting(false);
    loadCreated();
  };

  if (loading) return null;
  if (!user) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="my-ai-content">
        <div className="my-ai-title-row">
          <div className="my-ai-title">
            <span className="pink">{t("myai.titlePink")}</span><span className="white">{t("myai.titleWhite")}</span>
          </div>
          <button
            className={`manage-btn${manageMode ? " active" : ""}`}
            onClick={() => {
              setManageMode(!manageMode);
              setSelectedIds(new Set());
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="#fff" strokeWidth="1.2" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89L3.05 12.95" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span>{manageMode ? t("myai.done") : t("myai.manage")}</span>
          </button>
        </div>

        <div className="my-ai-tabs">
          {[
            { key: "created", label: t("myai.created") },
            { key: "liked", label: t("myai.liked") },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`my-ai-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => {
                setActiveTab(tab.key);
                setManageMode(false);
                setSelectedIds(new Set());
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="my-ai-filter-row">
          <div className="my-ai-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2" />
              <path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder={t("myai.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <FilterDropdown label={t("filter.type")} value={typeFilter} options={TYPE_OPTIONS} onChange={setTypeFilter} />
          <FilterDropdown label={t("filter.gender")} value={gender} options={GENDER_OPTIONS} onChange={setGender} />
          <FilterDropdown label={t("filter.style")} value={style} options={STYLE_OPTIONS} onChange={setStyle} />
          <FilterDropdown label={t("myai.filterSort")} value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
        </div>

        {tags.length > 0 && (
          <ScrollableTagsRow
            tags={tags}
            selectedTags={selectedTags}
            onTagToggle={(tag) => {
              if (tag === "__ALL__") {
                setSelectedTags([]);
              } else {
                setSelectedTags((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                );
              }
            }}
          />
        )}

        <div className="my-ai-grid">
          {fetching ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div className="ai-card-skeleton" key={i} />
            ))
          ) : sorted.length === 0 ? (
            <div className="my-ai-empty">
              {activeTab === "liked" ? (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  <span>{t("myai.noLiked")}</span>
                </>
              ) : (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>{t("myai.emptyLibrary")}</span>
                </>
              )}
            </div>
          ) : (
            sorted.map((item) => {
              const itemId = item.id || item.jobId || "";
              return (
                <MyAICard
                  key={itemId}
                  item={item}
                  manageMode={manageMode}
                  selected={selectedIds.has(itemId)}
                  onToggleSelect={() => toggleSelect(itemId)}
                  likeStatus={likeStatuses[itemId]}
                  onOpen={(it) => { if (it.url) setLightbox({ url: it.url, type: it.type }); }}
                />
              );
            })
          )}
        </div>

        {manageMode && selectedIds.size > 0 && (
          <div className="manage-bar">
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
              {t("myai.selected", { count: selectedIds.size })}
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              style={{
                background: "#e53e3e",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: deleting ? "not-allowed" : "pointer",
                opacity: deleting ? 0.6 : 1,
                fontFamily: "'Syne', sans-serif",
              }}
            >
              {deleting ? t("myai.deleting") : t("common.delete")}
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setManageMode(false); }}
              style={{
                background: "none",
                border: "1px solid #313131",
                borderRadius: 6,
                padding: "6px 16px",
                color: "#969696",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "'Syne', sans-serif",
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>

      {/* Lightbox: просмотр изображения/видео + кнопка Download внутри */}
      {lightbox && (
        <div
          onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-lb-media]")) setLightbox(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label={t("common.close")}
            style={{ position: "absolute", top: 20, right: 24, width: 40, height: 40, borderRadius: 8, border: "1px solid #313131", background: "rgba(0,0,0,0.4)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          {lightbox.type === "Video" ? (
            <video data-lb-media src={lightbox.url} controls autoPlay loop style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: 8 }} />
          ) : (
            <img data-lb-media src={lightbox.url} alt="" decoding="async" style={{ maxWidth: "90vw", maxHeight: "78vh", borderRadius: 8, objectFit: "contain" }} />
          )}
          <button
            data-lb-media
            onClick={() => {
              const a = document.createElement("a");
              a.href = lightbox.url;
              a.download = `${lightbox.type === "Video" ? "video" : "image"}-${Date.now()}.${lightbox.type === "Video" ? "mp4" : "png"}`;
              a.target = "_blank";
              a.rel = "noopener";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(to right, #f95bad, #ff0084)", border: "none", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12v2h12v-2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {t("myai.download")}
          </button>
        </div>
      )}
    </>
  );
}
