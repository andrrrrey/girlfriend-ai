"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../../context/auth";
import { getPublicGallery, getGalleryTags } from "../../lib/api";
import type { GalleryItem } from "../../lib/api";
import AuthRequiredOverlay from "../components/AuthRequiredOverlay";
import FilterDropdown from "../components/FilterDropdown";
import ScrollableTagsRow from "../components/ScrollableTagsRow";
import LikeButton from "../components/LikeButton";

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
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    width: 100%;
  }

  .g-card-wrap {
    position: relative;
    width: 220px;
    height: 300px;
    flex-shrink: 0;
  }
  .g-card-wrap:hover { z-index: 5; }

  .g-card {
    width: 220px;
    height: 300px;
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
    width: 220px;
    height: 300px;
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
    width: 220px;
    height: 300px;
    border-radius: 8px;
    background: #1e1e1e;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
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
    .g-card-wrap { width: calc(50% - 9px); height: auto; }
    .g-card { width: 100%; height: 220px; }
    .g-hover-panel { width: 100%; height: 220px; }
    .g-card-skeleton { width: calc(50% - 9px); height: 220px; }
  }
  @media (max-width: 480px) {
    .g-card-wrap { width: calc(50% - 9px); }
    .g-card { width: 100%; height: 220px; }
    .g-hover-panel { width: 100%; height: 220px; }
    .g-card-skeleton { width: calc(50% - 9px); height: 220px; }
  }
`;

const GENDER_OPTIONS = [
  { value: "", label: "All" },
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Non-binary", label: "Non-binary" },
];
const STYLE_OPTIONS = [
  { value: "", label: "All" },
  { value: "Realistic", label: "Realistic" },
  { value: "Anime", label: "Anime" },
  { value: "Fantasy", label: "Fantasy" },
];
const CREATED_BY_OPTIONS = [
  { value: "", label: "Everyone" },
  { value: "platform", label: "Platform" },
  { value: "community", label: "Community" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
];

function GalleryCard({ item, onOpen }: { item: GalleryItem; onOpen: (item: GalleryItem) => void }) {
  const url = item.output?.url;
  const prompt = item.input?.prompt || "";
  const isVideo = item.type === "video";

  return (
    <div className="g-card-wrap">
      <div className="g-hover-panel">
        {prompt && <p className="g-hover-prompt">{prompt}</p>}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LikeButton targetType="gallery_item" targetId={item.jobId} size="sm" showCount />
        </div>
        <div className="g-hover-actions">
          <button className="g-hover-btn primary" onClick={(e) => { e.stopPropagation(); if (url) onOpen(item); }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="6"/><path d="M6 5l5 3-5 3V5z" fill="currentColor" stroke="none"/></svg>
            View
          </button>
          <button className="g-hover-btn secondary" onClick={(e) => {
            e.stopPropagation();
            if (url && navigator.share) navigator.share({ url }).catch(() => {});
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" strokeWidth="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" strokeWidth="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Share
          </button>
        </div>
      </div>
      <div className="g-card-top-actions">
        <div style={{
          width: 28, height: 28, background: "rgba(48,39,43,0.55)", backdropFilter: "blur(2px)",
          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <LikeButton targetType="gallery_item" targetId={item.jobId} size="sm" showCount={false} />
        </div>
      </div>
      <div className="g-card" onClick={() => { if (url) onOpen(item); }}>
        {url ? (
          isVideo ? (
            <video className="g-card-thumb" src={url} muted loop preload="metadata" playsInline />
          ) : (
            <img className="g-card-thumb" src={url} alt="" loading="lazy" />
          )
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)" }} />
        )}
        <div className="g-card-overlay" />
        <div className="g-card-type-badge">
          {isVideo ? (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" strokeWidth="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {isVideo ? "Video" : "Image"}
        </div>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [gender, setGender] = useState("");
  const [style, setStyle] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);

  const fetchItems = useCallback(() => {
    setFetching(true);
    const params: Record<string, any> = { sortBy };
    if (activeTab !== "all") params.type = activeTab;
    if (gender) params.gender = gender;
    if (style) params.style = style;
    if (createdBy) params.createdBy = createdBy;

    getPublicGallery(params)
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]))
      .finally(() => setFetching(false));
  }, [activeTab, gender, style, createdBy, sortBy]);

  useEffect(() => {
    if (loading) return;
    fetchItems();
  }, [loading, fetchItems]);

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
              <AuthRequiredOverlay title="Sign in to view Gallery" subtitle="Create an account or sign in to browse AI-generated photos and videos" />
            </div>
          </>
        )}

        <div className="gallery-title-row">
          <div className="gallery-title">
            <span className="pink">AI Photo&amp;Video </span><span className="white">Gallery</span>
          </div>
        </div>

        <div className="gallery-tabs">
          {[
            { key: "all", label: "All" },
            { key: "image", label: "Image" },
            { key: "video", label: "Video" },
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
          <FilterDropdown label="Gender" value={gender} options={GENDER_OPTIONS} onChange={setGender} />
          <FilterDropdown label="Style" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
          <FilterDropdown label="Created by" value={createdBy} options={CREATED_BY_OPTIONS} onChange={setCreatedBy} />
          <FilterDropdown label="Sort by" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
        </div>

        {tags.length > 0 && (
          <ScrollableTagsRow
            tags={tags}
            selectedTags={selectedTags}
            onTagToggle={(tag) => {
              setSelectedTags((prev) =>
                prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
              );
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
              <span>No items found in the gallery yet.</span>
            </div>
          ) : (
            filteredItems.map((item) => (
              <GalleryCard key={item.jobId} item={item} onOpen={openLightbox} />
            ))
          )}
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
                <img className="g-lightbox-media" src={lightbox.url} alt="Gallery" />
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}
