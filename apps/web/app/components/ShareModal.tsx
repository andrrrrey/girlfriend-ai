"use client";

import React, { useState } from "react";
import { useT } from "../../context/language";

interface Props {
  url: string;
  title?: string;
  onClose: () => void;
}

export default function ShareModal({ url, title, onClose }: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <button style={s.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#cfd3e6" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>

        <h2 style={s.title}>{title || t("share.title")}</h2>
        <p style={s.subtitle}>{t("share.subtitle")}</p>

        <div style={s.linkPill}>
          <input style={s.linkInput} value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
        </div>

        <button style={s.copyBtn} onClick={handleCopy}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="#fff" strokeWidth="1.4" />
            <path d="M11 5V3.5A1.5 1.5 0 009.5 2H4a2 2 0 00-2 2v6.5A1.5 1.5 0 003.5 11H5" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {copied ? t("share.copied") : t("share.copy")}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { position: "relative", background: "#14132e", borderRadius: 18, border: "1px solid #2a2950", width: "min(560px, 96vw)", padding: "36px 40px 40px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", textAlign: "center" },
  closeBtn: { position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  title: { margin: 0, color: "#f95bad", fontSize: 26, fontWeight: 800 },
  subtitle: { margin: "12px 0 24px", color: "#9aa0bd", fontSize: 16, fontWeight: 500 },
  linkPill: { background: "rgba(255,255,255,0.04)", border: "1px solid #2f2e58", borderRadius: 999, padding: "4px 8px", marginBottom: 28 },
  linkInput: { width: "100%", background: "transparent", border: "none", outline: "none", color: "#b9bdd6", fontSize: 16, textAlign: "center", padding: "12px 8px", fontFamily: "inherit" },
  copyBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 200, padding: "14px 36px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #f95bad, #ff0084)", color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
