"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../context/auth";
import { getPublicGallery, getGalleryTags, likes, resizedMediaUrl } from "../../lib/api";
import type { GalleryItem } from "../../lib/api";
import AuthRequiredOverlay from "../components/AuthRequiredOverlay";
import FilterDropdown from "../components/FilterDropdown";
import ScrollableTagsRow from "../components/ScrollableTagsRow";
import { formatTag } from "../../lib/tags";
import LikeButton from "../components/LikeButton";
import { useT } from "../../context/language";

const PAGE_CSS = `
  .gallery-content {
    position: relative;
    min-height: calc(100vh - 46px);
    padding: 28px 36px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .gallery-title-row {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 4px;
  }
  .gallery-title {
    font-weight: 700;
    font-size: 32px;
    line-height: 1.1;
    text-align: center;
  }
  .gallery-title .pink { color: #f95bad; }
  .gallery-title .white { color: #fff; }

  .gallery-tabs {
    display: flex;
    align-items: center;
    background: #252525;
    border-radius: 6px;
    padding: 3px;
    width: fit-content;
    align-self: center;
  }
  .gallery-tab {
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
  .gallery-tab.active {
    background: #1e1e1e;
    color: #fff;
  }

  .gallery-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 18px;
    width: 100%;
  }

  .g-card-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 22 / 30;
  }
  .g-card-wrap:hover { z-index: 5; }

  .g-card {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    border: 1px solid #313131;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    background: #1e1e1e;
    transition: border-color 0.15s ease;
  }
  .g-card-wrap:hover .g-card { border-color: #5b5b5b; }

  .g-card-thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .g-card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(9,9,9,0) 50%, rgba(9,9,9,0.75) 100%);
    border-radius: 8px;
  }

  .g-card-type-badge {
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

  .g-hover-panel {
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
    justify-content: flex-end;
    padding: 12px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    z-index: 4;
    gap: 8px;
  }
  .g-card-wrap:hover .g-hover-panel {
    opacity: 1;
    pointer-events: auto;
  }

  .g-hover-prompt {
    font-size: 10px;
    font-weight: 500;
    color: #fff;
    line-height: 1.3;
    width: 100%;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .g-hover-actions {
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .g-hover-btn {
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
  .g-hover-btn.primary {
    background: linear-gradient(90deg, #f95bad, #ff0084);
  }
  .g-hover-btn.secondary {
    background: rgba(48,39,43,0.6);
    border: 1px solid rgba(255,255,255,0.12);
  }

  .g-card-top-actions {
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
  .g-card-wrap:hover .g-card-top-actions { opacity: 1; }

  .g-card-skeleton {
    width: 100%;
    aspect-ratio: 22 / 30;
    border-radius: 8px;
    background: #1e1e1e;
    position: relative;
    overflow: hidden;
  }
  .g-card-skeleton::after {
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

  .gallery-empty {
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
  .gallery-empty svg { opacity: 0.3; }

  .g-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }
  .g-lightbox.open {
    opacity: 1;
    pointer-events: auto;
  }
  .g-lightbox-media {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 8px;
    object-fit: contain;
    box-shadow: 0 0 60px rgba(0,0,0,0.8);
  }
  .g-lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
  }
  .g-lightbox-close:hover { background: rgba(255,255,255,0.2); }

  @media (max-width: 768px) {
    .gallery-content { padding: 16px 16px 40px; gap: 14px; }
    .gallery-title { font-size: 22px; }
    .gallery-filter-row { flex-wrap: wrap; }
    .gallery-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;

function GalleryCard({ item, onOpen, likeStatus }: { item: GalleryItem; onOpen: (item: GalleryItem) => void; likeStatus?: { liked: boolean; count: number } }) {
  const { t } = useT();
  const url = item.output?.url;
  const prompt = item.input?.prompt || "";
  const isVideo = item.type === "video";

  return (
    <div className="g-card-wrap">
      <div className="g-hover-panel">
        {prompt && <p className="g-hover-prompt">{prompt}</p>}
        <div className="g-hover-actions">
          <button className="g-hover-btn primary" onClick={(e) => { e.stopPropagation(); if (url) onOpen(item); }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6"/><path d="M6 5l5 3-5 3V5z" fill="currentColor" stroke="none"/></svg>
            {t("gallery.view")}
          </button>
          <button className="g-hover-btn secondary" onClick={(e) => {
            e.stopPropagation();
            if (url && navigator.share) navigator.share({ url }).catch(() => {});
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" strokeWidth="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {t("gallery.share")}
          </button>
        </div>
      </div>
      <div className="g-card-top-actions">
        <div style={{
          width: 28, height: 28, background: "rgba(48,39,43,0.55)", backdropFilter: "blur(2px)",
          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <LikeButton targetType="gallery_item" targetId={item.jobId} size="sm" showCount={true} initialLiked={likeStatus?.liked || false} initialCount={likeStatus?.count || 0} />
        </div>
      </div>
      <div className="g-card" onClick={() => { if (url) onOpen(item); }}>
        {url ? (
          isVideo ? (
            <video className="g-card-thumb" src={url} muted loop preload="metadata" playsInline
              onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = "none"; }} />
          ) : (
            <img className="g-card-thumb" src={resizedMediaUrl(url, { w: 400 }) ?? url} alt="" loading="lazy" decoding="async"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          )
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
          </div>
        )}
        <div className="g-card-overlay" />
        <div className="g-card-type-badge">
          {isVideo ? (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" strokeWidth="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {isVideo ? t("media.video") : t("media.image")}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export default function GalleryPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
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
    { value: "popular", label: t("filter.popular") },
  ];
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState("all");
  const [gender, setGender] = useState("");
  const [style, setStyle] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback((pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true); else setFetching(true);
    const params: Record<string, any> = { sortBy, page: pageNum, limit: PAGE_SIZE };
    if (activeTab !== "all") params.type = activeTab;
    if (gender) params.gender = gender;
    if (style) params.style = style;

    getPublicGallery(params)
      .then((data) => {
        const newItems = data.items || [];
        if (append) {
          setItems((prev) => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }
        setHasMore(newItems.length >= PAGE_SIZE);
      })
      .catch(() => { if (!append) setItems([]); })
      .finally(() => { setFetching(false); setLoadingMore(false); });
  }, [activeTab, gender, style, sortBy]);

  useEffect(() => {
    if (loading) return;
    setPage(1);
    setHasMore(true);
    fetchItems(1, false);
  }, [loading, activeTab, gender, style, sortBy]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || fetching || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchItems(nextPage, true);
      }
    }, { threshold: 0.1 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, fetching, loadingMore, page, fetchItems]);

  useEffect(() => {
    if (items.length === 0) return;
    const jobIds = items.map((i) => i.jobId);
    likes.batchStatus("gallery_item", jobIds)
      .then(setLikeStatuses)
      .catch(() => {});
  }, [items]);

  useEffect(() => {
    if (loading) return;
    getGalleryTags()
      .then((data) => setTags(data.map((t) => t.tag)))
      .catch(() => setTags([]));
  }, [loading]);

  const filteredItems = selectedTags.length > 0
    ? items.filter((item) => {
        const prompt = (item.input?.prompt || "").toLowerCase();
        return selectedTags.some((tag) => prompt.includes(tag.toLowerCase()));
      })
    : items;

  const openLightbox = (item: GalleryItem) => {
    const url = item.output?.url;
    if (url) setLightbox({ url, type: item.type });
  };

  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="gallery-content" style={{ position: "relative" }}>
        {!user && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99, pointerEvents: "none" }}>
              <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", pointerEvents: "auto" }} />
            </div>
            <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
              <AuthRequiredOverlay title={t("gallery.signInTitle")} subtitle={t("gallery.signInSubtitle")} />
            </div>
          </>
        )}

        <div className="gallery-title-row">
          <div className="gallery-title">
            <span className="pink">{t("gallery.titlePink")}</span><span className="white">{t("gallery.titleWhite")}</span>
          </div>
        </div>

        <div className="gallery-tabs">
          {[
            { key: "all", label: t("media.all") },
            { key: "image", label: t("media.image") },
            { key: "video", label: t("media.video") },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`gallery-tab${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="gallery-filter-row">
          <FilterDropdown label={t("filter.gender")} value={gender} options={GENDER_OPTIONS} onChange={setGender} />
          <FilterDropdown label={t("filter.style")} value={style} options={STYLE_OPTIONS} onChange={setStyle} />
          <FilterDropdown label={t("filter.sortBy")} value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
        </div>

        {tags.length > 0 && (
          <ScrollableTagsRow
            tags={tags}
            selectedTags={selectedTags}
            formatLabel={formatTag}
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

        <div className="gallery-grid">
          {fetching ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div className="g-card-skeleton" key={i} />
            ))
          ) : filteredItems.length === 0 ? (
            <div className="gallery-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{t("gallery.empty")}</span>
            </div>
          ) : (
            filteredItems.map((item) => (
              <GalleryCard key={item.jobId} item={item} onOpen={openLightbox} likeStatus={likeStatuses[item.jobId]} />
            ))
          )}
          {loadingMore && Array.from({ length: 4 }).map((_, i) => (
            <div className="g-card-skeleton" key={`loading-${i}`} />
          ))}
          {hasMore && !fetching && <div ref={sentinelRef} style={{ width: "100%", height: 1 }} />}
        </div>

        <div
          className={`g-lightbox${lightbox ? " open" : ""}`}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest(".g-lightbox-media")) {
              setLightbox(null);
            }
          }}
        >
          <button className="g-lightbox-close" onClick={() => setLightbox(null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div>
            {lightbox && (
              lightbox.type === "video" ? (
                <video className="g-lightbox-media" src={lightbox.url} controls autoPlay loop />
              ) : (
                <img className="g-lightbox-media" src={resizedMediaUrl(lightbox.url, { w: 1080 }) ?? lightbox.url} alt="Gallery" decoding="async" />
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
