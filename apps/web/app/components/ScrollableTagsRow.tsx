"use client";
import { useRef, useState, useEffect } from "react";

interface Props {
  tags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  maxVisible?: number;
}

export default function ScrollableTagsRow({
  tags,
  selectedTags,
  onTagToggle,
  maxVisible = 15,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const visibleTags = tags.slice(0, maxVisible);

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
  }, [tags]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  const isAllActive = selectedTags.length === 0;

  return (
    <div style={s.wrapper}>
      {showLeft && (
        <button style={{ ...s.arrow, ...s.arrowLeft }} onClick={() => scroll(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      <div ref={scrollRef} style={s.scroll}>
        <button
          style={isAllActive ? { ...s.tag, ...s.tagActive } : s.tag}
          onClick={() => onTagToggle("__ALL__")}
        >
          All
          {isAllActive && <span style={s.underline} />}
        </button>
        {visibleTags.map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              style={active ? { ...s.tag, ...s.tagActive } : s.tag}
              onClick={() => onTagToggle(tag)}
            >
              {tag}
              {active && <span style={s.underline} />}
            </button>
          );
        })}
      </div>
      {showRight && (
        <button style={{ ...s.arrow, ...s.arrowRight }} onClick={() => scroll(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    width: "100%",
    marginBottom: 12,
  },
  scroll: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    scrollbarWidth: "none",
    padding: "4px 0",
  },
  tag: {
    position: "relative",
    whiteSpace: "nowrap",
    padding: "7px 12px",
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#313131",
    background: "transparent",
    color: "#bbb",
    fontSize: 13,
    fontFamily: "'Syne', sans-serif",
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    transition: "color 0.2s, border-color 0.2s",
  },
  tagActive: {
    color: "#fff",
    borderColor: "#f95bad",
  },
  underline: {
    position: "absolute",
    bottom: -2,
    left: "50%",
    transform: "translateX(-50%)",
    width: "60%",
    height: 2,
    borderRadius: 1,
    background: "#f95bad",
    boxShadow: "0px 0px 5px 1px rgba(249,91,173,0.6)",
  },
  arrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "none",
    background: "rgba(30,30,30,0.9)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
  },
  arrowLeft: { left: 0 },
  arrowRight: { right: 0 },
};
