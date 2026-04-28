"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { getPublicGallery } from "../../lib/api";

/* ── CSS ─────────────────────────────────────────── */

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
  .filter-dropdown {
    height: 30px;
    background: #1e1e1e;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .filter-dropdown .muted { font-size: 10px; font-weight: 500; color: #969696; }
  .filter-dropdown .val { font-size: 10px; font-weight: 500; color: #fff; }

  .gallery-tags {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .g-tag {
    background: #121212;
    border-radius: 4px;
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    position: relative;
  }
  .g-tag.active { background: #1e1e1e; }
  .g-tag.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%);
    width: 16px;
    height: 3px;
    background: #f95bad;
    box-shadow: 0 0 5px 1px rgba(228,0,120,0.6);
    border-radius: 0.5px;
    z-index: 2;
  }

  .gallery-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    width: 100%;
  }

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
  .g-card:hover { border-color: #5b5b5b; }

  .g-card-thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .g-card-thumb-placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
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

  /* Skeleton */
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

  /* ── Lightbox ── */
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

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .gallery-content { padding: 16px 16px 40px; gap: 14px; }
    .gallery-title { font-size: 22px; }
    .gallery-filter-row { flex-wrap: wrap; }
    .g-card { width: calc(50% - 9px); height: 220px; }
    .g-card-skeleton { width: calc(50% - 9px); height: 220px; }
  }
  @media (max-width: 480px) {
    .g-card { width: calc(50% - 9px); height: 220px; }
    .g-card-skeleton { width: calc(50% - 9px); height: 220px; }
  }
`;

/* ── SVGs ─────────────────────────────────────────── */

const CHEVRON_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const IMAGE_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" stroke-width="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const VIDEO_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" stroke-width="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const TAGS = ["All", "Group Chats", "Teen", "Asian", "Anime", "Blond", "Strong", "Lonely", "Young", "Latina", "Romantic", "Athletic"];

/* ── HTML builder ─────────────────────────────────── */

function buildContent() {
  const tags = TAGS.map((t, i) =>
    `<span class="g-tag${i === 0 ? " active" : ""}" data-tag="${t}">${t}</span>`
  ).join("");

  return `
    <div class="gallery-title-row">
      <div class="gallery-title">
        <span class="pink">AI Photo&amp;Video </span><span class="white">Gallery</span>
      </div>
    </div>

    <div class="gallery-tabs">
      <div class="gallery-tab active" data-tab="all">All</div>
      <div class="gallery-tab" data-tab="image">Image</div>
      <div class="gallery-tab" data-tab="video">Video</div>
    </div>

    <div class="gallery-filter-row">
      <div class="filter-dropdown">
        <span class="muted">Gender:</span>
        <span class="val">All</span>
        ${CHEVRON_SVG}
      </div>
      <div class="filter-dropdown">
        <span class="muted">Style:</span>
        <span class="val">All</span>
        ${CHEVRON_SVG}
      </div>
      <div class="filter-dropdown">
        <span class="muted">Created by:</span>
        <span class="val">Everyone</span>
        ${CHEVRON_SVG}
      </div>
      <div class="filter-dropdown">
        <span class="muted">Sort by:</span>
        <span class="val">Newest</span>
        ${CHEVRON_SVG}
      </div>
    </div>

    <div class="gallery-tags">${tags}</div>

    <div class="gallery-grid" id="gallery-grid">
      ${[1,2,3,4,5,6,7,8,9,10].map(() => `<div class="g-card-skeleton"></div>`).join("")}
    </div>

    <!-- Lightbox -->
    <div class="g-lightbox" id="g-lightbox">
      <div class="g-lightbox-close" id="g-lightbox-close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </div>
      <div id="g-lightbox-media-wrap"></div>
    </div>
  `;
}

function cardHtml(item: { type: string; url?: string | null }) {
  const typeIcon = item.type === "video" ? VIDEO_ICON : IMAGE_ICON;
  const typeLabel = item.type === "video" ? "Video" : "Image";
  const bg = item.url;
  const bgStyle = bg ? `background: #1e1e1e;` : `background: linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%);`;
  const dataUrl = bg ? ` data-url="${bg}"` : "";
  const dataType = ` data-type="${item.type}"`;

  const mediaEl = bg
    ? item.type === "video"
      ? `<video class="g-card-thumb" src="${bg}" muted loop preload="metadata" playsinline></video>`
      : `<img class="g-card-thumb" src="${bg}" alt="Generated" loading="lazy" />`
    : "";

  return `
    <div class="g-card"${dataUrl}${dataType}>
      <div class="g-card-thumb-placeholder" style="${bgStyle}">
        ${mediaEl}
      </div>
      <div class="g-card-overlay"></div>
      <div class="g-card-type-badge">${typeIcon} ${typeLabel}</div>
    </div>
  `;
}

/* ── Component ───────────────────────────────────── */

export default function GalleryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const initRef = useRef(false);
  const allItems = useRef<any[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    // Lightbox helpers
    function openLightbox(url: string, type: string) {
      const lb = document.getElementById("g-lightbox");
      const wrap = document.getElementById("g-lightbox-media-wrap");
      if (!lb || !wrap) return;
      if (type === "video") {
        wrap.innerHTML = `<video class="g-lightbox-media" src="${url}" controls autoplay loop></video>`;
      } else {
        wrap.innerHTML = `<img class="g-lightbox-media" src="${url}" alt="Gallery" />`;
      }
      lb.classList.add("open");
    }

    function closeLightbox() {
      const lb = document.getElementById("g-lightbox");
      const wrap = document.getElementById("g-lightbox-media-wrap");
      if (!lb || !wrap) return;
      lb.classList.remove("open");
      wrap.innerHTML = "";
    }

    document.getElementById("g-lightbox")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".g-lightbox-media")) return;
      closeLightbox();
    });
    document.getElementById("g-lightbox-close")?.addEventListener("click", closeLightbox);

    // Tab switching
    document.querySelectorAll<HTMLElement>(".gallery-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".gallery-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderItems(tab.dataset.tab || "all");
      };
    });

    // Tag switching
    document.querySelectorAll<HTMLElement>(".g-tag").forEach((tag) => {
      tag.onclick = () => {
        document.querySelectorAll(".g-tag").forEach((t) => t.classList.remove("active"));
        tag.classList.add("active");
      };
    });

    // Load data
    getPublicGallery()
      .then((items) => {
        allItems.current = items || [];
        renderItems("all");
      })
      .catch(() => {
        const grid = document.getElementById("gallery-grid");
        if (grid) {
          grid.innerHTML = `<div class="gallery-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Could not load gallery. Please try again later.</span>
          </div>`;
        }
      });

    function renderItems(typeFilter: string) {
      const grid = document.getElementById("gallery-grid");
      if (!grid) return;

      const filtered = allItems.current.filter((item) => {
        if (typeFilter === "all") return true;
        return item.type?.toLowerCase() === typeFilter;
      });

      if (filtered.length === 0) {
        grid.innerHTML = `<div class="gallery-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>No items found in the gallery yet.</span>
        </div>`;
        return;
      }

      grid.innerHTML = filtered.map((item) =>
        cardHtml({
          type: item.type || "image",
          url: item.output?.url || null,
        })
      ).join("");

      // Attach lightbox click handlers to new cards
      grid.querySelectorAll<HTMLElement>(".g-card").forEach((card) => {
        card.onclick = () => {
          const url = card.dataset.url;
          const type = card.dataset.type || "image";
          if (url) openLightbox(url, type);
        };
      });
    }
  }, [user, loading, router]);

  if (loading) return <div style={{ color: "#aaa", padding: 40 }}>Loading...</div>;
  if (!user) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="gallery-content" dangerouslySetInnerHTML={{ __html: buildContent() }} />
    </>
  );
}
