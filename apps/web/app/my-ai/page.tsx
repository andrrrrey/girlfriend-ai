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
  .ai-tag.active { background: #1e1e1e; }
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
    gap: 18px;
    width: 100%;
  }

  /* Card wrapper (matches home page pattern) */
  .ai-card-wrap {
    position: relative;
    width: 220px;
    height: 300px;
    flex-shrink: 0;
  }
  .ai-card-wrap:hover { z-index: 5; }

  /* Hover panel (same as home page) */
  .ai-hover-panel {
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
  }
  .ai-hover-btn.primary {
    background: linear-gradient(90deg, #f95bad, #ff0084);
    border: none;
  }
  .ai-hover-btn.secondary {
    background: rgba(48,39,43,0.6);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .ai-hover-btn svg { width: 12px; height: 12px; flex-shrink: 0; }

  /* Card actions (top-right) */
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
  }
  .ai-card-action-btn:hover { background: rgba(249,91,173,0.3); }
  .ai-card-action-btn svg { width: 14px; height: 14px; }

  /* The card itself */
  .ai-card {
    border: 1px solid #313131;
    border-radius: 8px;
    width: 220px;
    height: 300px;
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
  .ai-card-sub {
    font-size: 11px;
    color: #969696;
    margin-top: 2px;
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

  /* Skeleton */
  .ai-card-skeleton {
    width: 220px;
    height: 300px;
    border-radius: 8px;
    background: #1e1e1e;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
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

  /* Responsive */
  @media (max-width: 768px) {
    .my-ai-content { padding: 16px 16px 40px; gap: 14px; }
    .my-ai-title { font-size: 22px; }
    .manage-btn { display: none; }
    .my-ai-filter-row { flex-wrap: wrap; }
    .ai-card-wrap { width: calc(50% - 9px); height: auto; }
    .ai-card { width: 100%; height: 220px; }
    .ai-hover-panel { width: 100%; height: 220px; }
    .ai-card-skeleton { width: calc(50% - 9px); height: 220px; }
    .my-ai-grid { gap: 12px; }
  }
`;

/* ── SVGs ─────────────────────────────────────────── */

const CHEVRON_SVG = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SEARCH_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="#848484" stroke-width="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const HEART_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SHARE_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" stroke-width="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const MORE_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1" fill="#fff"/><circle cx="8" cy="8" r="1" fill="#fff"/><circle cx="12" cy="8" r="1" fill="#fff"/></svg>`;
const GEAR_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="#fff" stroke-width="1.2"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89L3.05 12.95" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const IMAGE_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="#fff" stroke-width="1.2"/><circle cx="5.5" cy="5.5" r="1" fill="#fff"/><path d="M2 11l3.5-3.5 2.5 2.5 2-2L14 11" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const VIDEO_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 5a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="#fff" stroke-width="1.2"/><path d="M12 6.5l3-2v7l-3-2V6.5z" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const CHAR_ICON = `<svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="#fff" stroke-width="1.2"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const CHAT_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M14 10a1.3 1.3 0 01-1.3 1.3H4.7L2 13.7V3.3A1.3 1.3 0 013.3 2h9.4A1.3 1.3 0 0114 3.3V10z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DOWNLOAD_ICON = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v2h12v-2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

function cardHtml(item: {
  type: string;
  name: string;
  age?: number;
  avatarUrl?: string | null;
  url?: string | null;
  description?: string;
  tags?: string[];
  featured?: boolean;
}) {
  const typeIcon = item.type === "Image" ? IMAGE_ICON : item.type === "Video" ? VIDEO_ICON : CHAR_ICON;
  const bg = item.avatarUrl || item.url;
  const bgContent = bg
    ? `<img src="${bg}" alt="${item.name || ""}" loading="lazy" />`
    : `<div style="position:absolute;inset:0;width:100%;height:100%;background:linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%);border-radius:8px;"></div>`;

  const isCharacter = item.type === "Character";
  const featuredClass = item.featured ? " featured" : "";
  const typeClass = isCharacter ? " char-card" : "";

  const footer = isCharacter && item.name
    ? `<div class="ai-card-footer"><div class="ai-card-name">${item.name}${item.age ? `, ${item.age}` : ""}</div></div><div class="ai-card-pink-bar"></div>`
    : item.name
    ? `<div class="ai-card-footer"><div class="ai-card-name" style="font-size:13px;">${item.name}</div></div>`
    : ``;

  // Tags for hover panel
  const tagsHtml = (item.tags || [])
    .slice(0, 6)
    .map((t) => `<span class="ai-hover-tag">${t}</span>`)
    .join("");
  const description = item.description
    ? `<p class="ai-hover-description">${item.description.slice(0, 120)}${item.description.length > 120 ? "…" : ""}</p>`
    : `<p class="ai-hover-description" style="color:#969696;">No description available.</p>`;

  const hoverActions = isCharacter
    ? `<div class="ai-hover-actions">
        <div class="ai-hover-btn primary">${CHAT_ICON} Chat now</div>
        <div class="ai-hover-btn secondary">${DOWNLOAD_ICON} Save</div>
      </div>`
    : `<div class="ai-hover-actions">
        <div class="ai-hover-btn primary">${DOWNLOAD_ICON} Download</div>
        <div class="ai-hover-btn secondary">${SHARE_SVG} Share</div>
      </div>`;

  return `
    <div class="ai-card-wrap">
      <div class="ai-hover-panel">
        <div class="ai-hover-tags">${tagsHtml}</div>
        ${description}
        ${hoverActions}
      </div>
      <div class="ai-card-top-actions">
        <div class="ai-card-action-btn">${HEART_SVG}</div>
        <div class="ai-card-action-btn">${SHARE_SVG}</div>
        <div class="ai-card-action-btn">${MORE_SVG}</div>
      </div>
      <div class="ai-card${typeClass}${featuredClass}">
        <div class="ai-card-bg">${bgContent}<div class="ai-card-overlay"></div></div>
        <div class="ai-card-type-badge">${typeIcon} ${item.type}</div>
        ${footer}
      </div>
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

    loadData(false);
  }, [user, loading, router]);

  function loadData(likedTab: boolean) {
    const grid = document.getElementById("my-ai-grid");
    if (!grid) return;

    grid.innerHTML = [1,2,3,4,5,6,7,8,9,10].map(() => `<div class="ai-card-skeleton"></div>`).join("");

    if (likedTab) {
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
        description?: string;
        tags?: string[];
        featured?: boolean;
        createdAt: string;
      };

      const items: GridItem[] = [
        ...myChars.map((c) => {
          const p = (c.personality as Record<string, unknown> | null) || {};
          return {
            type: "Character",
            name: c.name,
            age: p["age"] as number | undefined,
            avatarUrl: c.avatarUrl,
            url: null,
            description: (p["description"] as string) || (p["bio"] as string) || "",
            tags: (p["tags"] as string[]) || (p["traits"] as string[]) || [],
            featured: c.isPublic,
            createdAt: c.createdAt,
          };
        }),
        ...history.map((h) => ({
          type: h.type === "video" ? "Video" : "Image",
          name: (h.input as { prompt?: string } | null)?.prompt?.slice(0, 20) || "Generated",
          avatarUrl: null,
          url: (h.output as { url?: string } | null)?.url,
          description: (h.input as { prompt?: string } | null)?.prompt || "",
          tags: [],
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
