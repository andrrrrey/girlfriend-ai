"use client";

import React, { useEffect, useRef, useState } from "react";
import { characters as charactersApi, resizedMediaUrl } from "../../lib/api";
import type { StoryCharacter } from "../../lib/api";
import StoryViewer from "./StoryViewer";
import { useT } from "../../context/language";

interface Props {
  /** Открыть профиль персонажа без активной истории (reuse CharacterProfilePopup) */
  onOpenProfile: (characterId: string) => void;
  /** Сообщает родителю, есть ли активные истории (для лейаута главной). */
  onActiveChange?: (hasActive: boolean) => void;
}

export default function StoriesRail({ onOpenProfile, onActiveChange }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<StoryCharacter[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  useEffect(() => {
    charactersApi
      .getStories()
      .then((res) => setItems(res.items || []))
      .catch(() => {});
  }, []);

  const activeStories = items.filter((c) => c.hasActiveStory);

  // Сообщаем родителю о наличии активных историй (для подъёма блока персонажей).
  useEffect(() => {
    onActiveChange?.(activeStories.length > 0);
  }, [activeStories.length, onActiveChange]);

  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [items]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  };

  const handleClick = (c: StoryCharacter) => {
    if (c.hasActiveStory) {
      const idx = activeStories.findIndex((a) => a.id === c.id);
      setViewerIndex(idx >= 0 ? idx : 0);
    } else {
      onOpenProfile(c.id);
    }
  };

  // Скрываем блок целиком, если нет ни одного персонажа с активной историей.
  if (activeStories.length === 0) return null;

  return (
    <div className="stories-section">
      <style>{STORIES_CSS}</style>
      <div className="stories-label">{t("stories.label")}</div>
      <div className="stories-rail-wrap">
        {showLeft && (
          <button className="stories-arrow stories-arrow-left" onClick={() => scroll(-1)} aria-label={t("stories.scrollLeft")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div className="stories-rail" ref={scrollRef}>
          {activeStories.map((c) => (
            <button
              key={c.id}
              className="story-item"
              onClick={() => handleClick(c)}
              title={c.name}
            >
              <span className={c.hasActiveStory ? "story-ring active" : "story-ring"}>
                <span className="story-avatar">
                  {c.avatarUrl ? (
                    <img
                      src={resizedMediaUrl(c.avatarUrl, { w: 256 }) ?? c.avatarUrl}
                      alt={c.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="story-avatar-fallback" />
                  )}
                </span>
              </span>
              <span className="story-name">{c.name}</span>
            </button>
          ))}
        </div>
        {showRight && (
          <button className="stories-arrow stories-arrow-right" onClick={() => scroll(1)} aria-label={t("stories.scrollRight")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        )}
      </div>

      {viewerIndex !== null && activeStories.length > 0 && (
        <StoryViewer
          stories={activeStories}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}

const STORIES_CSS = `
  @keyframes story-spin { to { transform: rotate(360deg); } }
  .stories-section {
    position: absolute; left: 36px; right: 36px; top: 184px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .stories-label { font-size: 10px; font-weight: 500; text-transform: uppercase; color: #969696; }
  .stories-rail-wrap { position: relative; width: 100%; }
  .stories-rail {
    display: flex; gap: 14px; overflow-x: auto; scrollbar-width: none; padding: 2px 0;
  }
  .stories-rail::-webkit-scrollbar { display: none; }
  .story-item {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    background: none; border: none; padding: 0; cursor: pointer; flex-shrink: 0; width: 76px;
  }
  .story-ring {
    display: block; width: 72px; height: 72px; border-radius: 50%; padding: 2.5px;
    background: #313131;
  }
  .story-ring.active {
    background: linear-gradient(135deg, #f95bad 0%, #ff0084 50%, #ff99ce 100%);
    box-shadow: 0 0 8px 1px rgba(249,91,173,0.45);
  }
  .story-avatar {
    display: block; width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
    border: 2px solid #090909; background: #1a1a1a;
  }
  .story-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .story-avatar-fallback {
    display: block; width: 100%; height: 100%;
    background: linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%);
  }
  .story-name {
    font-size: 11px; font-weight: 500; color: #c9c9c9; max-width: 76px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: 'Syne', sans-serif;
  }
  .stories-arrow {
    position: absolute; top: 36px; transform: translateY(-50%); z-index: 2;
    width: 28px; height: 28px; border-radius: 50%; border: none;
    background: rgba(30,30,30,0.9); display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }
  .stories-arrow-left { left: 0; }
  .stories-arrow-right { right: 0; }
  @media (max-width: 768px) {
    .stories-section { left: 16px; right: 16px; top: 150px; }
    .story-ring { width: 60px; height: 60px; }
    .story-item { width: 64px; }
    .story-name { font-size: 10px; max-width: 64px; }
    .stories-arrow { top: 30px; }
  }
`;
