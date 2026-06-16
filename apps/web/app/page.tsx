"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { characters, auth, likes, resizedMediaUrl } from "../lib/api";
import type { Character } from "../lib/api";
import CharacterProfilePopup from "./components/CharacterProfilePopup";
import ShareModal from "./components/ShareModal";
import ReportModal from "./components/ReportModal";
import ScrollableTagsRow from "./components/ScrollableTagsRow";
import FilterDropdown from "./components/FilterDropdown";
import StoriesRail from "./components/StoriesRail";
import { formatTag } from "../lib/tags";
import { useT } from "../context/language";
import type { TKey } from "../lib/i18n";

type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

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
      position: absolute; left: 36px; right: 36px; top: 324px;
      display: flex; flex-direction: column; gap: 16px;
    }
    .chars-header { display: flex; flex-direction: column; gap: 5px; max-width: 570px; }
    .chars-title { font-size: 32px; font-weight: 700; line-height: 1.1; }
    .chars-title .pink { color: #ff99ce; }
    .cards-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; width: 100%; }
    .card {
      border: 1px solid #313131; border-radius: 8px; width: 100%; height: 100%;
      overflow: hidden; position: relative; display: flex;
      flex-direction: column; justify-content: flex-end; padding: 8px; cursor: pointer;
    }
    .card-bg { position: absolute; inset: 0; pointer-events: none; border-radius: 8px; }
    .card-bg img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .card-overlay {
      position: absolute; inset: 0; border-radius: 8px;
      background: linear-gradient(to bottom, rgba(9,9,9,0) 56.167%, rgba(9,9,9,0.8) 100%);
    }
    .card-name { font-size: 20px; font-weight: 700; color: #fff; position: relative; z-index: 1; white-space: nowrap; line-height: 1.2; }
    .card-featured-wrap { position: relative; width: 100%; aspect-ratio: 22 / 30; }
    .card-featured-wrap:hover { z-index: 5; }
    .hover-panel {
      position: absolute; left: 0; top: 0; width: 100%; height: 100%;
      background: rgba(9,9,9,0.75); backdrop-filter: blur(2px);
      border: 0.8px solid rgba(228,0,120,0.2); border-radius: 8px; overflow: hidden;
      display: flex; flex-direction: column; align-items: flex-start;
      justify-content: space-between; padding: 12px; gap: 8px;
      opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
      z-index: 4;
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
    .hover-description { font-size: 10px; font-weight: 500; color: #fff; line-height: 1.3; width: 100%; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .hover-actions { display: flex; gap: 6px; width: 100%; }
    .hover-btn { flex: 1; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10px; font-weight: 600; color: #fff; cursor: pointer; white-space: nowrap; }
    .hover-btn.primary { background: linear-gradient(90deg, #f95bad, #ff0084); }
    .hover-btn.secondary { background: rgba(48,39,43,0.6); border: 1px solid rgba(255,255,255,0.12); }
    .hover-stats { display: flex; align-items: flex-start; justify-content: space-between; width: 100%; white-space: nowrap; }
    .hover-stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
    .hover-stat-value { font-size: 16px; font-weight: 700; color: #fff; }
    .hover-stat-label { font-size: 7px; font-weight: 500; color: #848484; text-transform: uppercase; line-height: 1.2; }
    .card.featured { border-color: #5b5b5b; left: 0; z-index: 2; }
    .card-action-btn {
      width: 28px; height: 28px; background: rgba(48,39,43,0.4); backdrop-filter: blur(2px);
      border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;
    }
    .card-more-wrap { position: relative; }
    .card-more-menu {
      display: none; position: absolute; top: 32px; right: 0;
      background: #1b1b2e; border: 1px solid #313131; border-radius: 8px;
      padding: 4px; min-width: 130px; z-index: 20; flex-direction: column; gap: 2px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .card-more-menu.open { display: flex; }
    .card-more-item {
      padding: 8px 10px; font-size: 11px; font-weight: 600; color: #fff;
      border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap;
    }
    .card-more-item:hover { background: rgba(255,255,255,0.08); }
    .card-progress { display: flex; gap: 2px; width: 100%; position: relative; z-index: 2; }
    .card-progress .progress-bar { flex: 1; height: 2px; }
    @media (max-width: 768px) {
      .content { padding-bottom: 24px; }
      .hero { margin: 0 16px; height: 130px; top: 8px; }
      .hero-content { width: 100%; padding: 0 8px; }
      .hero-title { font-size: 20px; white-space: normal; text-align: center; }
      .characters-section { left: 16px; top: 272px; width: calc(100% - 32px); }
      .chars-header { width: 100%; }
      .chars-title { font-size: 20px; }
      .cards-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .card-name { font-size: 15px; }
    }
    @media (max-width: 480px) {
      .hero-title { font-size: 18px; }
    }
`;

const heroHtml = (t: TFn) => `
  <div class="hero">
    <div class="hero-bg">
      <div style="width:100%;height:100%;background:linear-gradient(135deg, #1a0a1e 0%, #2d1b3d 30%, #1a0a2e 60%, #0d0d1a 100%);border-radius:8px;"></div>
    </div>
    <div class="hero-content">
      <h1 class="hero-title">${t("home.heroTitle")}</h1>
      <button class="btn-primary">${t("home.createNow")}</button>
    </div>
    <div class="hero-progress">
      <div class="progress-bar active"><div class="progress-bar-inner"></div></div>
      <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
      <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
    </div>
  </div>
`;

function buildDynamicCards(chars: Character[], likeStatuses: Record<string, { liked: boolean; count: number }>, t: TFn): string {
  if (!chars || chars.length === 0) return "";
  return chars
    .map((char, index) => {
      const p = (char.personality as Record<string, unknown> | null) || {};
      const age = p["age"] ? ` ${p["age"]}` : "";
      const label = `${char.name}${age}`;
      const description = (p["description"] as string) || (p["bio"] as string) || "";
      const rawTags = (p["tags"] as string[]) || (p["traits"] as string[]) || char.tags || [];
      const tagsHtml = rawTags.slice(0, 7).map((t) => `<span class="hover-tag">${formatTag(String(t))}</span>`).join("");
      const descHtml = description
        ? `<p class="hover-description">${description.slice(0, 140)}${description.length > 140 ? "…" : ""}</p>`
        : `<p class="hover-description" style="color:#969696;">${t("home.noDescYet")}</p>`;
      const bgContent = char.avatarUrl
        ? `<img src="${resizedMediaUrl(char.avatarUrl, { w: 400 }) ?? char.avatarUrl}" loading="lazy" decoding="async" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="${char.name}" />`
        : `<div style="position:absolute;inset:0;width:100%;height:100%;background:linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%);border-radius:8px;"></div>`;
      const isLiked = likeStatuses[char.id]?.liked || false;
      const likeCount = likeStatuses[char.id]?.count || 0;
      const heartFill = isLiked ? "#f95bad" : "none";
      const heartStroke = isLiked ? "#f95bad" : "#fff";
      return `
<div class="card-featured-wrap" data-char-idx="${index}" data-char-id="${char.id}">
  <div class="hover-panel">
    <div class="hover-tags">${tagsHtml}</div>
    ${descHtml}
    <div class="hover-stats">
      <div class="hover-stat"><span class="hover-stat-value">${likeCount}</span><span class="hover-stat-label">${t("home.likes")}</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">${t("home.comments")}</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">${t("home.generated")}</span></div>
    </div>
    <div class="hover-actions">
      <div class="hover-btn primary" data-action="view">${t("home.view")}</div>
      <div class="hover-btn secondary" data-action="chat">${t("home.chat")}</div>
    </div>
  </div>
  <div class="card-actions">
    <div class="card-action-btn card-like-btn" data-char-id="${char.id}"><svg width="16" height="16" viewBox="0 0 16 16" fill="${heartFill}"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="${heartStroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="card-more-wrap">
      <div class="card-action-btn card-more-btn" data-char-id="${char.id}"><svg width="16" height="16" viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="3.5" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="12.5" r="1.3"/></svg></div>
      <div class="card-more-menu" data-char-id="${char.id}">
        <div class="card-more-item" data-action="share" data-char-id="${char.id}">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="12" cy="3" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="4" cy="8" r="1.5" stroke="#fff" stroke-width="1.2"/><circle cx="12" cy="13" r="1.5" stroke="#fff" stroke-width="1.2"/><path d="M5.5 9l5 3M10.5 4.5l-5 3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg>
          ${t("gallery.share")}
        </div>
        <div class="card-more-item" data-action="report" data-char-id="${char.id}">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 2v12" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/><path d="M3 2.5h8l-1.5 3L11 8.5H3" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>
          ${t("home.report")}
        </div>
      </div>
    </div>
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
  const { t } = useT();
  const GENDER_OPTIONS = [
    { value: "", label: t("home.filterAll") },
    { value: "Female", label: t("home.genderFemale") },
    { value: "Male", label: t("home.genderMale") },
    { value: "Trans", label: t("home.genderTrans") },
  ];
  const STYLE_OPTIONS = [
    { value: "", label: t("home.filterAll") },
    { value: "Realistic", label: t("home.styleRealistic") },
    { value: "Anime", label: t("home.styleAnime") },
  ];
  const SORT_OPTIONS = [
    { value: "newest", label: t("home.sortNewest") },
    { value: "oldest", label: t("home.sortOldest") },
    { value: "name", label: t("home.sortName") },
  ];
  const [chars, setChars] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [shareCharId, setShareCharId] = useState<string | null>(null);
  const [reportCharId, setReportCharId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [gender, setGender] = useState("");
  const [style, setStyle] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>({});
  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const charsRef = useRef<Character[]>(chars);
  charsRef.current = chars;

  const fetchChars = useCallback(async (params?: {
    search?: string; gender?: string; style?: string;
    sortBy?: string; tags?: string[];
  }) => {
    try {
      const result = await characters.listPublic({
        search: params?.search || undefined,
        gender: params?.gender || undefined,
        style: params?.style || undefined,
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
    if (chars.length === 0) return;
    const ids = chars.map((c) => c.id);
    likes.batchStatus("character", ids)
      .then(setLikeStatuses)
      .catch(() => {});
  }, [chars]);

  useEffect(() => {
    fetchChars({ search: searchQuery, gender, style, sortBy, tags: selectedTags });
  }, [gender, style, sortBy, selectedTags, fetchChars]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchChars({ search: val, gender, style, sortBy, tags: selectedTags });
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

  const handleOpenProfile = useCallback(async (id: string) => {
    const existing = charsRef.current.find((c) => c.id === id);
    if (existing) {
      setSelectedChar(existing);
      return;
    }
    try {
      const full = await characters.getOne(id);
      setSelectedChar(full);
    } catch {}
  }, []);

  const dynamicCardsHtml = buildDynamicCards(chars, likeStatuses, t);

  const handleCardClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Three-dots: toggle the share/report menu.
    const moreBtn = target.closest(".card-more-btn") as HTMLElement | null;
    if (moreBtn) {
      e.preventDefault();
      e.stopPropagation();
      const menu = moreBtn.parentElement?.querySelector(".card-more-menu");
      const willOpen = menu ? !menu.classList.contains("open") : false;
      document.querySelectorAll(".card-more-menu.open").forEach((m) => m.classList.remove("open"));
      if (menu && willOpen) menu.classList.add("open");
      return;
    }

    // Menu item: Share → open the copy-link popup for this character.
    const shareItem = target.closest('.card-more-item[data-action="share"]') as HTMLElement | null;
    if (shareItem) {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".card-more-menu.open").forEach((m) => m.classList.remove("open"));
      if (shareItem.dataset.charId) setShareCharId(shareItem.dataset.charId);
      return;
    }

    // Menu item: Report → open the report popup for this character.
    const reportItem = target.closest('.card-more-item[data-action="report"]') as HTMLElement | null;
    if (reportItem) {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".card-more-menu.open").forEach((m) => m.classList.remove("open"));
      if (reportItem.dataset.charId) setReportCharId(reportItem.dataset.charId);
      return;
    }

    const likeBtn = target.closest(".card-like-btn") as HTMLElement | null;
    if (likeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const charId = likeBtn.dataset.charId;
      if (charId) {
        likes.toggle("character", charId).then((result) => {
          setLikeStatuses((prev) => ({ ...prev, [charId]: result }));
        }).catch(() => {});
      }
      return;
    }
    if (target.closest(".card-action-btn")) return;
    const chatBtn = target.closest('.hover-btn[data-action="chat"]') as HTMLElement | null;
    if (chatBtn) {
      e.preventDefault();
      const wrap = chatBtn.closest(".card-featured-wrap") as HTMLElement | null;
      if (wrap?.dataset.charId) {
        window.location.href = `/chat?characterId=${wrap.dataset.charId}`;
      }
      return;
    }
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
  }, [dynamicCardsHtml, handleCardClick]);

  // Close any open card menu when clicking outside of it.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".card-more-wrap")) {
        document.querySelectorAll(".card-more-menu.open").forEach((m) => m.classList.remove("open"));
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Open the character profile popup if the page was opened via a shared link (?character=<id>).
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get("character");
    if (cid) handleOpenProfile(cid);
  }, [handleOpenProfile]);

  return (
    <>
      <style>{PAGE_CSS}</style>
      <div className="content">
        <div dangerouslySetInnerHTML={{ __html: heroHtml(t) }} />

        <StoriesRail onOpenProfile={handleOpenProfile} />

        <div className="characters-section">
          <div className="chars-header">
            <div className="section-label" style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", color: "#969696" }}>{t("home.charactersLabel")}</div>
            <h2 className="chars-title"><span className="pink">{t("home.choosePartner")}</span>{t("home.forToday")}</h2>
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
                  placeholder={t("common.search")}
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
                <FilterDropdown label={t("home.filterGender")} value={gender} options={GENDER_OPTIONS} onChange={setGender} />
                <FilterDropdown label={t("home.filterStyle")} value={style} options={STYLE_OPTIONS} onChange={setStyle} />
                <FilterDropdown label={t("home.filterSortBy")} value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} />
              </div>
            </div>

            {/* Dynamic tags */}
            <ScrollableTagsRow
              tags={tags.map((t) => t.tag)}
              selectedTags={selectedTags}
              onTagToggle={handleTagToggle}
              maxVisible={15}
              formatLabel={formatTag}
            />
          </div>

          {/* Character cards rendered dynamically */}
          <div id="cards-row-dynamic" className="cards-row" />
        </div>
      </div>

      <CharacterProfilePopup
        character={selectedChar}
        onClose={() => setSelectedChar(null)}
        onLikeChange={(charId, liked, count) =>
          setLikeStatuses((prev) => ({ ...prev, [charId]: { liked, count } }))
        }
      />

      {shareCharId && (
        <ShareModal
          url={`${window.location.origin}/?character=${shareCharId}`}
          onClose={() => setShareCharId(null)}
        />
      )}

      {reportCharId && (
        <ReportModal
          characterId={reportCharId}
          onClose={() => setReportCharId(null)}
        />
      )}
    </>
  );
}
