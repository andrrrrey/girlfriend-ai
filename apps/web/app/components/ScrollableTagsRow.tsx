"use client";
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useT } from "../../context/language";
import AllFiltersModal from "./AllFiltersModal";

interface Props {
  tags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  maxVisible?: number;
  /** Преобразует значение тега в отображаемую подпись (по умолчанию — как есть). */
  formatLabel?: (tag: string) => string;
  /**
   * "scroll" — одна строка с прокруткой (по умолчанию);
   * "rows" — не больше двух рядов и кнопка «Показать все» с попапом всех тегов.
   */
  layout?: "scroll" | "rows";
}

const ROWS = 2;
const GAP = 8;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Раскладка «как flex-wrap»: сколько элементов (по порядку) помещается в rows
 * рядов шириной width, если в последнем ряду нужно оставить место под кнопку
 * шириной reserve. Возвращает число помещающихся элементов.
 */
export function fitInRows(widths: number[], width: number, rows: number, gap: number, reserve: number): number {
  const place = (count: number, reserveLast: number) => {
    let row = 1;
    let x = 0;
    for (let i = 0; i < count; i++) {
      const w = Math.min(widths[i]!, width);
      const need = x === 0 ? w : x + gap + w;
      if (need <= width) { x = need; continue; }
      row++;
      x = w;
    }
    if (reserveLast > 0) {
      const need = x === 0 ? reserveLast : x + gap + reserveLast;
      if (need > width) { row++; }
    }
    return row <= rows;
  };
  if (place(widths.length, 0)) return widths.length;
  let n = widths.length;
  while (n > 0 && !place(n, reserve)) n--;
  return n;
}

export default function ScrollableTagsRow({
  tags,
  selectedTags,
  onTagToggle,
  maxVisible = 15,
  formatLabel = (tag) => tag,
  layout = "scroll",
}: Props) {
  if (layout === "rows") {
    return <TagsRows tags={tags} selectedTags={selectedTags} onTagToggle={onTagToggle} formatLabel={formatLabel} />;
  }
  return <TagsScroll tags={tags} selectedTags={selectedTags} onTagToggle={onTagToggle} maxVisible={maxVisible} formatLabel={formatLabel} />;
}

/** Два ряда тегов + «Показать все (N)» → попап со всеми тегами. */
function TagsRows({ tags, selectedTags, onTagToggle, formatLabel }: Required<Pick<Props, "tags" | "selectedTags" | "onTagToggle" | "formatLabel">>) {
  const { t } = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Элементы раскладки: «Все», затем теги; кнопка «Показать все» — резерв.
  const allLabel = t("common.all");
  const labelsKey = tags.map(formatLabel).join("\u0001") + "\u0002" + allLabel;

  useIsoLayoutEffect(() => {
    const m = measureRef.current;
    if (!m) return;
    setWidths(Array.from(m.children).map((el) => Math.ceil((el as HTMLElement).getBoundingClientRect().width)));
  }, [labelsKey]);

  useIsoLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // widths: [All, ...tags, showAllButton]
  const { order, visible } = useMemo(() => {
    const n = tags.length;
    if (!width || widths.length !== n + 2) return { order: tags, visible: n };
    const btnW = widths[n + 1]!;
    const fit = (list: string[]) => {
      const w = [widths[0]!, ...list.map((tag) => widths[tags.indexOf(tag) + 1]!)];
      return Math.max(0, fitInRows(w, width, ROWS, GAP, btnW) - 1);
    };
    let ordered = tags;
    let count = fit(ordered);
    // Выбранные теги, не попавшие в два ряда, переносим в начало — чтобы активный фильтр был виден.
    const hiddenSelected = ordered.slice(count).filter((tag) => selectedTags.includes(tag));
    if (hiddenSelected.length) {
      ordered = [...hiddenSelected, ...ordered.filter((tag) => !hiddenSelected.includes(tag))];
      count = fit(ordered);
    }
    return { order: ordered, visible: count };
  }, [tags, widths, width, selectedTags]);

  const hiddenCount = tags.length - visible;
  const isAllActive = selectedTags.length === 0;

  return (
    <div ref={boxRef} style={s.rowsWrapper}>
      {/* Невидимый замер ширины чипов */}
      <div ref={measureRef} style={s.measure} aria-hidden="true">
        <span style={s.tag}>{allLabel}</span>
        {tags.map((tag) => <span key={tag} style={s.tag}>{formatLabel(tag)}</span>)}
        <span style={{ ...s.tag, ...s.showAll }}>{t("filters.showAll")} ({tags.length})</span>
      </div>
      <div style={s.rows}>
        <button style={isAllActive ? { ...s.tag, ...s.tagActive } : s.tag} onClick={() => onTagToggle("__ALL__")}>
          {allLabel}
          {isAllActive && <span style={s.underline} />}
        </button>
        {order.slice(0, visible).map((tag) => {
          const active = selectedTags.includes(tag);
          return (
            <button key={tag} style={active ? { ...s.tag, ...s.tagActive } : s.tag} onClick={() => onTagToggle(tag)}>
              {formatLabel(tag)}
              {active && <span style={s.underline} />}
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button type="button" style={{ ...s.tag, ...s.showAll }} onClick={() => setModalOpen(true)}>
            {t("filters.showAll")} ({tags.length})
          </button>
        )}
      </div>
      <AllFiltersModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tags={tags}
        selectedTags={selectedTags}
        onTagToggle={onTagToggle}
        formatLabel={formatLabel}
      />
    </div>
  );
}

function TagsScroll({
  tags,
  selectedTags,
  onTagToggle,
  maxVisible = 15,
  formatLabel = (tag: string) => tag,
}: Omit<Props, "layout">) {
  const { t } = useT();
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
          {t("common.all")}
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
              {formatLabel(tag)}
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
  rowsWrapper: { position: "relative", width: "100%", marginBottom: 12 },
  rows: { display: "flex", flexWrap: "wrap", gap: GAP, padding: "4px 0" },
  measure: { position: "absolute", visibility: "hidden", pointerEvents: "none", display: "flex", gap: GAP, whiteSpace: "nowrap", height: 0, overflow: "hidden", left: 0, top: 0 },
  showAll: { color: "#f95bad", borderColor: "rgba(249,91,173,0.4)", gap: 6 },
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
    fontFamily: "var(--font-main)",
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
