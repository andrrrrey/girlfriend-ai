"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { characters, auth } from "../lib/api";
import type { Character } from "../lib/api";
import CharacterProfilePopup from "./components/CharacterProfilePopup";
import ScrollableTagsRow from "./components/ScrollableTagsRow";
import FilterDropdown from "./components/FilterDropdown";

const PAGE_CSS = `
    .content { position: relative; }
    .hero {
      border: 1px solid #313131; border-radius: 8px; height: 160px;
      position: absolute; left: 0; right: 0; top: 8px; margin: 0 36px;
      overflow: hidden; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-end; padding: 4px 8px;
    }
    .hero-bg { position: absolute; inset: 0; pointer-events: none; }
    .hero-content {
      position: relative; z-index: 2; display: flex; flex: 1;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 12px; width: 453px;
    }
    .hero-title { font-size: 32px; font-weight: 700; color: #fff; white-space: nowrap; line-height: 1.1; }
    .hero-progress { position: relative; width: 100%; display: flex; gap: 6px; z-index: 2; }
    .progress-bar { flex: 1; height: 2px; position: relative; }
    .progress-bar-inner { position: absolute; inset: 0; border-radius: 1px; }
    .progress-bar.active .progress-bar-inner { background: #f95bad; box-shadow: 0px 0px 5px 1px rgba(228,0,120,0.6); }
    .progress-bar.inactive { opacity: 0.7; }
    .progress-bar.inactive .progress-bar-inner { background: #46383e; border-radius: 1px; }
    .characters-section {
      position: absolute; left: 36px; right: 36px; top: 196px;
      display: flex; flex-direction: column; gap: 16px;
    }
    .chars-header { display: flex; flex-direction: column; gap: 5px; max-width: 570px; }
    .chars-title { font-size: 32px; font-weight: 700; line-height: 1.1; }
    .chars-title .pink { color: #ff99ce; }
    .cards-row { display: flex; flex-wrap: wrap; gap: 18px; height: auto; width: 100%; }
    .card {
      border: 1px solid #313131; border-radius: 8px; width: 220px; height: 300px;
      overflow: hidden; position: relative; flex-shrink: 0; display: flex;
      flex-direction: column; justify-content: flex-end; padding: 8px; cursor: pointer;
    }
    .card-bg { position: absolute; inset: 0; pointer-events: none; border-radius: 8px; }
    .card-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .card-overlay {
      position: absolute; inset: 0; border-radius: 8px;
      background: linear-gradient(to bottom, rgba(9,9,9,0) 56.167%, rgba(9,9,9,0.8) 100%);
    }
    .card-name { font-size: 20px; font-weight: 700; color: #fff; position: relative; z-index: 1; white-space: nowrap; line-height: 1.2; }
    .card-featured-wrap { position: relative; height: 300px; width: 220px; flex-shrink: 0; }
    .card-featured-wrap:hover { z-index: 5; }
    .hover-panel {
      position: absolute; left: 0; top: 0; width: 220px; height: 300px;
      background: rgba(9,9,9,0.7); backdrop-filter: blur(2px);
      border: 0.8px solid rgba(228,0,120,0.2); border-radius: 8px; overflow: hidden;
      display: flex; flex-direction: column; align-items: flex-start;
      justify-content: space-between; padding: 12px;
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
    }
    .card-featured-wrap:hover .hover-panel { opacity: 1; pointer-events: auto; }
    .card-featured-wrap:hover .card.featured { border-color: #5b5b5b; }
    .card-featured-wrap .card-progress { opacity: 0; transition: opacity 0.2s ease; }
    .card-featured-wrap:hover .card-progress { opacity: 1; }
    .card-featured-wrap .card-actions {
      position: absolute; top: 8px; right: 8px; z-index: 10;
      flex-direction: column; align-items: flex-end; gap: 4px;
      opacity: 0; transition: opacity 0.2s ease; display: flex;
    }
    .card-featured-wrap:hover .card-actions { opacity: 1; }
    .hover-tags { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; align-content: flex-start; }
    .hover-tag {
      background: rgba(255,153,206,0.6); backdrop-filter: blur(2px);
      border-radius: 4px; padding: 4px 8px; font-size: 8px; font-weight: 500; color: #fff; white-space: nowrap;
    }
    .hover-description { font-size: 10px; font-weight: 500; color: #fff; line-height: 1.3; width: 100%; }
    .hover-stats { display: flex; align-items: flex-start; justify-content: space-between; width: 100%; white-space: nowrap; }
    .hover-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .hover-stat-value { font-size: 16px; font-weight: 700; color: #fff; }
    .hover-stat-label { font-size: 7px; font-weight: 500; color: #848484; text-transform: uppercase; line-height: 1.2; }
    .card.featured { border-color: #5b5b5b; left: 0; z-index: 2; }
    .card-action-btn {
      width: 28px; height: 28px; background: rgba(48,39,43,0.4); backdrop-filter: blur(2px);
      border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .card-progress { display: flex; gap: 2px; width: 100%; position: relative; z-index: 2; }
    .card-progress .progress-bar { flex: 1; height: 2px; }
    @media (max-width: 768px) {
      .content { padding-bottom: 24px; }
      .hero { margin: 0 16px; height: 130px; top: 8px; }
      .hero-content { width: 100%; padding: 0 8px; }
      .hero-title { font-size: 20px; white-space: normal; text-align: center; }
      .characters-section { left: 16px; top: 168px; width: calc(100% - 32px); }
      .chars-header { width: 100%; }
      .chars-title { font-size: 20px; }
      .cards-row { gap: 10px; }
      .card { width: calc(50% - 9px); height: 230px; }
      .card-featured-wrap { width: calc(50% - 9px); height: 230px; }
      .hover-panel { width: 100%; height: 230px; }
      .card-name { font-size: 15px; }
    }
    @media (max-width: 480px) {
      .card { width: calc(50% - 9px); height: 190px; }
      .card-featured-wrap { width: calc(50% - 9px); height: 190px; }
      .hover-panel { width: 100%; height: 190px; }
      .hero-title { font-size: 18px; }
    }
`;

const HERO_HTML = `
  <div class="hero">
    <div class="hero-bg">
      <div style="width:100%;height:100%;background:linear-gradient(135deg, #1a0a1e 0%, #2d1b3d 30%, #1a0a2e 60%, #0d0d1a 100%);border-radius:8px;"></div>
    </div>
    <div class="hero-content">
      <h1 class="hero-title">Create your New Girlfriend</h1>
      <button class="btn-primary">Create Now</button>
    </div>
    <div class="hero-progress">
      <div class="progress-bar active"><div class="progress-bar-inner"></div></div>
      <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
      <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
    </div>
  </div>
`;

const GENDER_OPTIONS = [
  { value: "", label: "All" },
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Trans", label: "Trans" },
];
const STYLE_OPTIONS = [
  { value: "", label: "All" },
  { value: "Realistic", label: "Realistic" },
  { value: "Anime", label: "Anime" },
];
const CREATED_BY_OPTIONS = [
  { value: "", label: "All" },
  { value: "platform", label: "lovecast.ai" },
  { value: "community", label: "Community" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
];

function buildDynamicCards(chars: Character[]): string {
  if (!chars || chars.length === 0) return "";
  return chars
    .map((char, index) => {
      const p = (char.personality as Record<string, unknown> | null) || {};
      const age = p["age"] ? ` ${p["age"]}` : "";
      const label = `${char.name}${age}`;
      const description = (p["description"] as string) || (p["bio"] as string) || "";
      const rawTags = (p["tags"] as string[]) || (p["traits"] as string[]) || char.tags || [];
      const tagsHtml = rawTags.slice(0, 7).map((t) => `<span class="hover-tag">${t}</span>`).join("");
      const descHtml = description
        ? `<p class="hover-description">${description.slice(0, 140)}${description.length > 140 ? "…" : ""}</p>`
        : `<p class="hover-description" style="color:#969696;">No description yet.</p>`;
      const bgContent = char.avatarUrl
        ? `<img src="${char.avatarUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="${char.name}" />`
        : `<div style="position:absolute;inset:0;width:100%;height:100%;background:linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%);border-radius:8px;"></div>`;
      return `
<div class="card-featured-wrap" data-char-idx="${index}">
  <div class="hover-panel">
    <div class="hover-tags">${tagsHtml}</div>
    ${descHtml}
    <div class="hover-stats">
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">likes</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">comments</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">generated</span></div>
    </div>
  </div>
  <div class="card-actions">
    <div class="card-action-btn"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="card-action-btn"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1" fill="#fff"/><circle cx="8" cy="8" r="1" fill="#fff"/><circle cx="12" cy="8" r="1" fill="#fff"/></svg></div>
  </div>
  <div class="card featured">
    <div class="card-bg">${bgContent}<div class="card-overlay"></div></div>
    <div class="card-name">${label}</div>
  </div>
</div>`;
    })
    .join("\n");
}

export default function HomePage() {
  const [chars, setChars] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [gender, setGender] = useState("");
  const [style, setStyle] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const charsRef = useRef<Character[]>(chars);
  charsRef.current = chars;

  const fetchChars = useCallback(async (params?: {
    search?: string; gender?: string; style?: string;
    createdBy?: string; sortBy?: string; tags?: string[];
  }) => {
    try {
      const result = await characters.listPublic({
        search: params?.search || undefined,
        gender: params?.gender || undefined,
        style: params?.style || undefined,
        createdBy: params?.createdBy || undefined,
        sortBy: params?.sortBy || "newest",
        tags: params?.tags?.length ? params.tags : undefined,
      });
      setChars(result.items);
    } catch {
      try {
        const result = await characters.listPublic();
        setChars(result.items);
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetchChars();
    characters.getTags()
      .then((t) => setTags(t))
      .catch(() => {});
  }, [fetchChars]);

  useEffect(() => {
    fetchChars({ search: searchQuery, gender, style, createdBy, sortBy, tags: selectedTags });
  }, [gender, style, createdBy, sortBy, selectedTags, fetchChars]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchChars({ search: val, gender, style, createdBy, sortBy, tags: selectedTags });
    }, 300);
  };

  const handleTagToggle = (tag: string) => {
    if (tag === "__ALL__") {
      setSelectedTags([]);
    } else {
      setSelectedTags((prev) =>
        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
      );
    }
  };

  const dynamicCardsHtml = buildDynamicCards(chars);

  const handleCardClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".card-action-btn")) return;
    const wrap = target.closest(".card-featured-wrap") as HTMLElement | null;
    if (!wrap) return;
    const idx = Number(wrap.dataset.charIdx);
    if (!isNaN(idx) && charsRef.current[idx]) {
      setSelectedChar(charsRef.current[idx]);
    }
  }, []);

  useEffect(() => {
    const container = document.getElementById("cards-row-dynamic");
    if (!container || !dynamicCardsHtml) return;
    container.innerHTML = dynamicCardsHtml;
    container.addEventListener("click", handleCardClick as EventListener);
    return () => container.removeEventListener("click", handleCardClick as EventListener);
  }, [dynamicCardsHtml, handleCardClick, selectedChar]);

  return (
    <>
      <style>{PAGE_CSS}</style>
      <div className="content">
        <div dangerouslySetInnerHTML={{ __html: HERO_HTML }} />

        <div className="characters-section">
          <div className="chars-header">
            <div className="section-label" style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: "#969696" }}>CHARACTERS</div>
            <h2 className="chars-title"><span className="pink">Choose Your Partner </span>for Today</h2>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", flexWrap: "wrap" }}>
              {/* Search input */}
              <div style={{
                flex: 1, minWidth: 150, height: 30, display: "flex", alignItems: "center", gap: 10,
                padding: "7px 12px", background: "#121212", border: "1px solid #313131", borderRadius: 4,
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/>
                  <path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: "#fff", fontSize: 12, fontWeight: 500, fontFamily: "'Syne', sans-serif",
                  }}
                />
              </div>

              <div style={{ width: 1, height: 20, background: "#313131", flexShrink: 0 }} />

              {/* Filter dropdowns */}
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <FilterDropdown label="Gender" value={gender} options={GENDER_OPTIONS} onChange={setGender} />
                <FilterDropdown label="Style" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
                <FilterDropdown label="Created by" value={createdBy} options={CREATED_BY_OPTIONS} onChange={setCreatedBy} />
                <FilterDropdown label="Sort by" value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
              </div>
            </div>

            {/* Dynamic tags */}
            <ScrollableTagsRow
              tags={tags.map((t) => t.tag)}
              selectedTags={selectedTags}
              onTagToggle={handleTagToggle}
              maxVisible={15}
            />
          </div>

          {/* Character cards rendered dynamically */}
          <div id="cards-row-dynamic" className="cards-row" />
        </div>
      </div>

      <CharacterProfilePopup
        character={selectedChar}
        onClose={() => setSelectedChar(null)}
      />
    </>
  );
}
