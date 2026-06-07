"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { characters as charactersApi, resizedMediaUrl } from "../../lib/api";
import type { StoryCharacter, StoryImage } from "../../lib/api";
import { useT } from "../../context/language";

const SLIDE_MS = 5000;

interface Props {
  /** Список персонажей с активными историями (только hasActiveStory) */
  stories: StoryCharacter[];
  /** Индекс персонажа, с которого открыли просмотр */
  startIndex: number;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(diff / 60_000);
  return m >= 1 ? `${m}m` : "now";
}

export default function StoryViewer({ stories, startIndex, onClose }: Props) {
  const router = useRouter();
  const { t } = useT();
  const [charIdx, setCharIdx] = useState(startIndex);
  const [slideIdx, setSlideIdx] = useState(0);
  const [images, setImages] = useState<StoryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 текущего слайда

  const current = stories[charIdx];
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const goToChar = useCallback(
    (idx: number) => {
      if (idx < 0) return; // уже на первом — игнор
      if (idx >= stories.length) {
        onClose();
        return;
      }
      setCharIdx(idx);
      setSlideIdx(0);
    },
    [stories.length, onClose],
  );

  // Загрузка кадров истории при смене персонажа
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setLoading(true);
    setImages([]);
    setSlideIdx(0);
    charactersApi
      .getStory(current.id)
      .then((res) => {
        if (cancelled) return;
        if (!res.items || res.items.length === 0) {
          // нет кадров — пропускаем персонажа
          goToChar(charIdx + 1);
          return;
        }
        setImages(res.items);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) goToChar(charIdx + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextSlide = useCallback(() => {
    if (slideIdx + 1 < images.length) {
      setSlideIdx((i) => i + 1);
    } else {
      goToChar(charIdx + 1);
    }
  }, [slideIdx, images.length, charIdx, goToChar]);

  const prevSlide = useCallback(() => {
    if (slideIdx > 0) {
      setSlideIdx((i) => i - 1);
    } else {
      goToChar(charIdx - 1);
    }
  }, [slideIdx, charIdx, goToChar]);

  // Таймер автопереключения слайда
  useEffect(() => {
    if (loading || images.length === 0) return;
    elapsedRef.current = 0;
    setProgress(0);

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      if (!paused) {
        const elapsed = elapsedRef.current + (ts - startRef.current);
        const p = Math.min(elapsed / SLIDE_MS, 1);
        setProgress(p);
        if (p >= 1) {
          nextSlide();
          return;
        }
      } else {
        // во время паузы сдвигаем точку отсчёта, чтобы не «доганять»
        startRef.current = ts;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    startRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      startRef.current = 0;
    };
  }, [slideIdx, loading, images.length, paused, nextSlide]);

  // Esc / стрелки
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") nextSlide();
      else if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", fn);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", fn);
    };
  }, [onClose, nextSlide, prevSlide]);

  if (!current) return null;

  const slide = images[slideIdx];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.stage} onClick={(e) => e.stopPropagation()}>
        {/* Сегментированный прогресс */}
        <div style={s.progressRow}>
          {images.map((_, i) => (
            <div key={i} style={s.progressTrack}>
              <div
                style={{
                  ...s.progressFill,
                  width: i < slideIdx ? "100%" : i === slideIdx ? `${progress * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Шапка: аватар, имя, время, закрыть */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            {current.avatarUrl ? (
              <img
                src={resizedMediaUrl(current.avatarUrl, { w: 96 }) ?? current.avatarUrl}
                alt=""
                style={s.headerAvatar}
                decoding="async"
              />
            ) : (
              <div style={{ ...s.headerAvatar, background: "linear-gradient(135deg,#2d1b3d,#0d0d1a)" }} />
            )}
            <span style={s.headerName}>{current.name}</span>
            {slide && <span style={s.headerTime}>{timeAgo(slide.createdAt)}</span>}
          </div>
          <button style={s.closeBtn} onClick={onClose} aria-label={t("common.close")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Кадр */}
        <div
          style={s.imageWrap}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          {loading || !slide ? (
            <div style={s.spinner} />
          ) : (
            <img
              src={resizedMediaUrl(slide.url, { w: 1080 }) ?? slide.url}
              alt={slide.label}
              style={s.image}
              draggable={false}
              decoding="async"
            />
          )}

          {/* Зоны тапа: левая — назад, правая — вперёд */}
          <div style={s.tapLeft} onClick={prevSlide} />
          <div style={s.tapRight} onClick={nextSlide} />
        </div>

        {/* Перейти в чат с персонажем */}
        <button
          style={s.chatBtn}
          onClick={() => router.push(`/chat?characterId=${current.id}`)}
        >
          Message {current.name}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.92)",
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stage: {
    position: "relative",
    width: "min(420px, 100vw)",
    height: "min(92vh, 760px)",
    display: "flex",
    flexDirection: "column",
    borderRadius: 12,
    overflow: "hidden",
    background: "#0d0d0d",
  },
  progressRow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    zIndex: 5,
    display: "flex",
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    background: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#fff",
    borderRadius: 2,
  },
  header: {
    position: "absolute",
    top: 22,
    left: 12,
    right: 12,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    objectFit: "cover",
    border: "1.5px solid rgba(255,255,255,0.6)",
  },
  headerName: { color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "'Syne', sans-serif" },
  headerTime: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 500 },
  closeBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
  },
  imageWrap: {
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    userSelect: "none",
  },
  image: { width: "100%", height: "100%", objectFit: "contain" },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.25)",
    borderTopColor: "#fff",
    animation: "story-spin 0.8s linear infinite",
  },
  tapLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: "33%", cursor: "pointer" },
  tapRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: "67%", cursor: "pointer" },
  chatBtn: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 5,
    padding: "10px 22px",
    borderRadius: 24,
    border: "none",
    background: "linear-gradient(90deg, #f95bad, #ff0084)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
