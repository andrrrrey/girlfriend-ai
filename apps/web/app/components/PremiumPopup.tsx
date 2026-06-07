"use client";

import React, { useEffect } from "react";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";

export type PremiumLimitType =
  | "characters"
  | "chatSessions"
  | "messagesPerChat"
  | "imageGenerations"
  | "videoGenerations";

interface Props {
  limitType: PremiumLimitType;
  limit: number;
  used: number;
  onClose: () => void;
}

const LIMIT_KEYS: Record<PremiumLimitType, { title: TKey; description: TKey }> = {
  characters: { title: "premium.charactersTitle", description: "premium.charactersDesc" },
  chatSessions: { title: "premium.chatSessionsTitle", description: "premium.chatSessionsDesc" },
  messagesPerChat: { title: "premium.messagesTitle", description: "premium.messagesDesc" },
  imageGenerations: { title: "premium.imageTitle", description: "premium.imageDesc" },
  videoGenerations: { title: "premium.videoTitle", description: "premium.videoDesc" },
};

export default function PremiumPopup({ limitType, limit, used, onClose }: Props) {
  const { t } = useT();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const msg = LIMIT_KEYS[limitType];

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <button style={s.closeBtn} onClick={onClose} aria-label={t("common.close")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#848484" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div style={s.icon}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
              fill="#f95bad"
              stroke="#f95bad"
              strokeWidth="1"
            />
          </svg>
        </div>

        <h2 style={s.title}>{t(msg.title)}</h2>
        <p style={s.subtitle}>{t(msg.description)}</p>

        <div style={s.counter}>
          <span style={s.counterUsed}>{used}</span>
          <span style={s.counterSep}>/</span>
          <span style={s.counterLimit}>{limit}</span>
        </div>

        <div style={s.buttons}>
          <button style={s.primaryBtn} onClick={() => { /* TODO: navigate to payment */ }}>
            {t("premium.getPremium")}
          </button>
          <button style={s.secondaryBtn} onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <p style={s.hint}>
          {t("premium.hint")}
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(8px)",
  },
  card: {
    position: "relative",
    background: "#1a1a1a",
    borderRadius: 16,
    padding: "40px 32px 32px",
    textAlign: "center" as const,
    maxWidth: 400,
    width: "90%",
    border: "1px solid #313131",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    margin: "0 0 8px",
  },
  subtitle: {
    color: "#969696",
    fontSize: 14,
    fontFamily: "'Syne', sans-serif",
    margin: "0 0 20px",
    lineHeight: 1.5,
  },
  counter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 24,
  },
  counterUsed: {
    color: "#f95bad",
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
  },
  counterSep: {
    color: "#555",
    fontSize: 22,
    fontWeight: 400,
  },
  counterLimit: {
    color: "#848484",
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
  },
  buttons: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  primaryBtn: {
    width: "100%",
    padding: "14px 0",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #f95bad, #e0004e)",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'Syne', sans-serif",
    cursor: "pointer",
  },
  secondaryBtn: {
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "1px solid #313131",
    background: "transparent",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Syne', sans-serif",
    cursor: "pointer",
  },
  hint: {
    color: "#555",
    fontSize: 12,
    fontFamily: "'Syne', sans-serif",
    marginTop: 16,
    lineHeight: 1.4,
  },
};
