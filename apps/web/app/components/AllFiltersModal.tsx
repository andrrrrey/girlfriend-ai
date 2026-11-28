"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useT } from "../../context/language";

interface Props {
  open: boolean;
  onClose: () => void;
  tags: string[];
  selectedTags: string[];
  /** То же, что у строки тегов: тег или "__ALL__" (сброс). */
  onTagToggle: (tag: string) => void;
  formatLabel: (tag: string) => string;
}

/** Попап «Показать все»: все фильтры-теги с поиском; выбор применяется сразу. */
export default function AllFiltersModal({ open, onClose, tags, selectedTags, onTagToggle, formatLabel }: Props) {
  const { t } = useT();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => formatLabel(tag).toLowerCase().includes(q) || tag.toLowerCase().includes(q));
  }, [tags, query, formatLabel]);

  if (!open) return null;

  return (
    <div style={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={t("filters.title")}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>
            {t("filters.title")}
            {selectedTags.length > 0 && <span style={s.count}>{selectedTags.length}</span>}
          </span>
          <button type="button" style={s.closeBtn} onClick={onClose} aria-label={t("filters.done")}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={s.searchWrap}>
          <input
            style={s.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filters.search")}
            autoFocus
          />
        </div>
        <div style={s.body}>
          {filtered.length === 0 ? (
            <div style={s.empty}>{t("filters.nothingFound")}</div>
          ) : (
            <div style={s.chips}>
              {filtered.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    style={active ? { ...s.chip, ...s.chipActive } : s.chip}
                    onClick={() => onTagToggle(tag)}
                    aria-pressed={active}
                  >
                    {formatLabel(tag)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div style={s.footer}>
          <button type="button" style={s.resetBtn} onClick={() => onTagToggle("__ALL__")} disabled={selectedTags.length === 0}>
            {t("filters.reset")}
          </button>
          <button type="button" style={s.doneBtn} onClick={onClose}>{t("filters.done")}</button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { background: "#111", borderRadius: 16, width: "min(640px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #2a2a2a" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 12px", flexShrink: 0 },
  title: { color: "#fff", fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 },
  count: { minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, background: "#f95bad", color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #3a3a3a", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  searchWrap: { padding: "0 20px 12px", borderBottom: "1px solid #2a2a2a", flexShrink: 0 },
  search: { width: "100%", boxSizing: "border-box", height: 38, padding: "0 12px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" },
  body: { flex: 1, overflowY: "auto", padding: 20 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { padding: "7px 12px", borderRadius: 8, border: "1px solid #313131", background: "transparent", color: "#bbb", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-main)" },
  chipActive: { color: "#f95bad", borderColor: "#f95bad", background: "rgba(249,91,173,0.12)" },
  empty: { color: "#666", fontSize: 14, textAlign: "center", padding: "24px 0" },
  footer: { display: "flex", gap: 12, padding: "14px 20px", borderTop: "1px solid #2a2a2a", flexShrink: 0 },
  resetBtn: { flex: 1, height: 42, borderRadius: 10, border: "1px solid #3a3a3a", background: "transparent", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  doneBtn: { flex: 2, height: 42, borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f95bad, #c940a0)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
