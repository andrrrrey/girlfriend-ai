"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { characters, getGenerationHistory } from "../../lib/api";

/* ── CSS ─────────────────────────────────────────── */

const PAGE_CSS = `
  .my-ai-content {
    position: relative;
    min-height: calc(100vh - 46px);
    padding: 28px 36px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Title row */
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

  /* Tabs */
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
  }
  .my-ai-tab.active {
    background: #1e1e1e;
    color: #fff;
  }

  /* Filter row */
  .my-ai-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .my-ai-search {
    flex: 1;
    height: 30px;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    cursor: text;
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

  /* Tags */
  .my-ai-tags {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
    overflow: hidden;
  }
  .ai-tag {
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
  .ai-tag.active {
    background: #1e1e1e;
  }
  .ai-tag.active::after {
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

  /* Grid */
  .my-ai-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
  }

  .ai-card {
    width: 160px;
    border-radius: 8px;
    border: 1px solid #313131;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
    background: #1e1e1e;
    display: flex;
    flex-direction: column;
    height: 220px;
  }
  .ai-card.character-card {
    box-shadow: 0 0 0 1px rgba(249,91,173,0) inset;
  }
  .ai-card.character-card.featured {
    box-shadow: 0 0 12px 0 rgba(249,91,173,0.25);
    border-color: rgba(249,91,173,0.4);
  }

  .ai-card-thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .ai-card-thumb-placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .ai-card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(9,9,9,0) 40%, rgba(9,9,9,0.85) 100%);
    border-radius: 8px;
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

  .ai-card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 3;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .ai-card:hover .ai-card-actions { opacity: 1; }

  .ai-card-action-btn {
    width: 24px;
    height: 24px;
    background: rgba(48,39,43,0.55);
    backdrop-filter: blur(2px);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ai-card-action-btn:hover { background: rgba(249,91,173,0.3); }

  .ai-card-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px;
    z-index: 3;
  }
  .ai-card-name {
    font-size: 13px;
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

  /* Empty state */
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

  /* Loading skeleton */
  .ai-card-skeleton {
    width: 160px;
    height: 220px;
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
`;

/* ── SVGs ─────────────────────────────────────────── */

const CHEVRON_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SEARCH_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="#848484" stroke-width="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const HEART_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SHARE_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" stroke-width="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const MORE_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1" fill="#fff"/><circle cx="8" cy="8" r="1" fill="#fff"/><circle cx="12" cy="8" r="1" fill="#fff"/></svg>`;
const GEAR_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="#fff" stroke-width="1.2"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89L3.05 12.95" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const IMAGE_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" stroke-width="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const VIDEO_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" stroke-width="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const CHAR_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="#fff" stroke-width="1.2"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;

const TAGS = ["All", "Group Chats", "Teen", "Asian", "Anime", "Blond", "Strong", "Lonely", "Young", "Latina", "Romantic", "Athletic"];

/* ── HTML builder ─────────────────────────────────── */

function buildContent() {
  const tags = TAGS.map((t, i) =>
    `<span class="ai-tag${i === 0 ? " active" : ""}" data-tag="${t}">${t}</span>`
  ).join("");

  return `
    <div class="my-ai-title-row">
      <div class="my-ai-title">
        <span class="pink">My AI </span><span class="white">Library</span>
      </div>
      <button class="manage-btn">
        ${GEAR_SVG}
        <span>Manage my Library</span>
      </button>
    </div>

    <div class="my-ai-tabs">
      <div class="my-ai-tab active" data-tab="created">Created</div>
      <div class="my-ai-tab" data-tab="liked">Liked</div>
    </div>

    <div class="my-ai-filter-row">
      <div class="my-ai-search">
        ${SEARCH_SVG}
        <input type="text" placeholder="Search your library..." id="my-ai-search-input" />
      </div>
      <div class="filter-dropdown">
        <span class="muted">Type:</span>
        <span class="val">All</span>
        ${CHEVRON_SVG}
      </div>
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
        <span class="muted">Sort:</span>
        <span class="val">Newest</span>
        ${CHEVRON_SVG}
      </div>
    </div>

    <div class="my-ai-tags">${tags}</div>

    <div class="my-ai-grid" id="my-ai-grid">
      ${[1,2,3,4,5,6,7,8,9,10].map(() => `<div class="ai-card-skeleton"></div>`).join("")}
    </div>
  `;
}

function cardHtml(item: { type: string; name: string; age?: number; avatarUrl?: string | null; url?: string | null; featured?: boolean }) {
  const typeIcon = item.type === "Image" ? IMAGE_ICON : item.type === "Video" ? VIDEO_ICON : CHAR_ICON;
  const bg = item.avatarUrl || item.url;
  const bgStyle = bg
    ? `background: #1e1e1e;`
    : `background: linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%);`;

  const featuredClass = item.featured ? " featured" : "";
  const typeClass = item.type === "Character" ? " character-card" : "";
  const footer = item.type === "Character" && item.name
    ? `<div class="ai-card-footer"><div class="ai-card-name">${item.name}${item.age ? `, ${item.age}` : ""}</div></div><div class="ai-card-pink-bar"></div>`
    : ``;

  return `
    <div class="ai-card${typeClass}${featuredClass}">
      <div class="ai-card-thumb-placeholder" style="${bgStyle}">
        ${bg ? `<img class="ai-card-thumb" src="${bg}" alt="${item.name || ""}" loading="lazy" />` : ""}
      </div>
      <div class="ai-card-overlay"></div>
      <div class="ai-card-type-badge">${typeIcon} ${item.type}</div>
      <div class="ai-card-actions">
        <div class="ai-card-action-btn">${HEART_SVG}</div>
        <div class="ai-card-action-btn">${SHARE_SVG}</div>
        <div class="ai-card-action-btn">${MORE_SVG}</div>
      </div>
      ${footer}
    </div>
  `;
}

/* ── Component ───────────────────────────────────── */

export default function MyAIPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const initRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    // Tab switching
    document.querySelectorAll<HTMLElement>(".my-ai-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".my-ai-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        loadData(tab.dataset.tab === "liked");
      };
    });

    // Tag switching
    document.querySelectorAll<HTMLElement>(".ai-tag").forEach((tag) => {
      tag.onclick = () => {
        document.querySelectorAll(".ai-tag").forEach((t) => t.classList.remove("active"));
        tag.classList.add("active");
      };
    });

    // Initial data load
    loadData(false);
  }, [user, loading, router]);

  function loadData(likedTab: boolean) {
    const grid = document.getElementById("my-ai-grid");
    if (!grid) return;

    // Show skeletons
    grid.innerHTML = [1,2,3,4,5,6,7,8,9,10].map(() => `<div class="ai-card-skeleton"></div>`).join("");

    if (likedTab) {
      // Liked tab: show empty for now
      setTimeout(() => {
        if (!grid) return;
        grid.innerHTML = `<div class="my-ai-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span>No liked items yet</span>
        </div>`;
      }, 300);
      return;
    }

    Promise.all([
      characters.listMy().catch(() => []),
      getGenerationHistory().catch(() => []),
    ]).then(([myChars, history]) => {
      type GridItem = {
        type: string;
        name: string;
        age?: number;
        avatarUrl?: string | null;
        url?: string | null;
        featured?: boolean;
        createdAt: string;
      };

      const items: GridItem[] = [
        ...myChars.map((c) => ({
          type: "Character",
          name: c.name,
          age: (c.personality as { age?: number })?.age,
          avatarUrl: c.avatarUrl,
          url: null,
          featured: c.isPublic,
          createdAt: c.createdAt,
        })),
        ...history.map((h) => ({
          type: h.type === "video" ? "Video" : "Image",
          name: (h.input as { prompt?: string } | null)?.prompt?.slice(0, 20) || "Generated",
          avatarUrl: null,
          url: (h.output as { url?: string } | null)?.url,
          featured: false,
          createdAt: h.createdAt,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      if (!grid) return;
      if (items.length === 0) {
        grid.innerHTML = `<div class="my-ai-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>Your library is empty. Create a character or generate content!</span>
        </div>`;
        return;
      }

      grid.innerHTML = items.map((item) => cardHtml(item)).join("");
    });
  }

  if (loading) return <div style={{ color: "#aaa", padding: 40 }}>Loading...</div>;
  if (!user) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="my-ai-content" dangerouslySetInnerHTML={{ __html: buildContent() }} />
    </>
  );
}
