"use client";

import React, { useState } from "react";
import { useT } from "../../context/language";
import { useAuth } from "../../context/auth";
import { reports } from "../../lib/api";
import type { TKey } from "../../lib/i18n";

interface Props {
  characterId: string;
  onClose: () => void;
}

const REASON_KEYS = [
  "underage_porn",
  "real_people_porn",
  "character_plagiarism",
  "wrong_classification",
  "violence_gore",
  "hate_speech",
  "horror_dangerous",
  "low_quality_spam",
] as const;

const MAX_DETAILS = 1000;

export default function ReportModal({ characterId, onClose }: Props) {
  const { t } = useT();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const toggleReason = (key: string) => {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const canSend = !sending && (selected.length > 0 || details.trim().length > 0);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError("");
    try {
      await reports.create({
        characterId,
        reasons: selected,
        details: details.trim() || undefined,
      });
      setSent(true);
    } catch {
      setError(t("common.error"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <button style={s.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#cfd3e6" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>

        <h2 style={s.title}>{t("report.title")}</h2>

        {!user ? (
          <div style={s.centerBlock}>
            <p style={s.subtitle}>{t("report.loginRequired")}</p>
            <a href="/login" style={s.sendBtn}>{t("report.login")}</a>
          </div>
        ) : sent ? (
          <div style={s.centerBlock}>
            <p style={s.subtitle}>{t("report.sent")}</p>
            <button style={s.sendBtn} onClick={onClose}>OK</button>
          </div>
        ) : (
          <>
            <p style={s.subtitle}>{t("report.subtitle")}</p>

            <div style={s.sectionLabel}>{t("report.selectReason")}</div>
            <div style={s.reasonList}>
              {REASON_KEYS.map((key) => {
                const active = selected.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleReason(key)}
                    style={{ ...s.reasonPill, ...(active ? s.reasonPillActive : {}) }}
                  >
                    {t(`report.reason.${key}` as TKey)}
                  </button>
                );
              })}
            </div>

            <div style={s.sectionLabel}>{t("report.others")}</div>
            <textarea
              style={s.textarea}
              placeholder={t("report.placeholder")}
              value={details}
              maxLength={MAX_DETAILS}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div style={s.charCount}>{t("report.charCount", { n: details.length })}</div>

            {error && <div style={s.error}>{error}</div>}

            <div style={s.actions}>
              <button style={s.cancelBtn} onClick={onClose}>{t("report.cancel")}</button>
              <button
                style={{ ...s.sendBtn, ...(canSend ? {} : s.sendBtnDisabled) }}
                onClick={handleSend}
                disabled={!canSend}
              >
                {t("report.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { position: "relative", background: "#14132e", borderRadius: 18, border: "1px solid #2a2950", width: "min(560px, 96vw)", maxHeight: "90vh", overflowY: "auto", padding: "36px 40px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", textAlign: "center" },
  closeBtn: { position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  title: { margin: 0, color: "#f95bad", fontSize: 26, fontWeight: 800 },
  subtitle: { margin: "12px 0 20px", color: "#9aa0bd", fontSize: 15, fontWeight: 500, lineHeight: 1.5 },
  centerBlock: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0 6px" },
  sectionLabel: { color: "#f95bad", fontSize: 14, fontWeight: 700, textAlign: "center", margin: "16px 0 10px" },
  reasonList: { display: "flex", flexDirection: "column", gap: 10 },
  reasonPill: { width: "100%", padding: "13px 16px", borderRadius: 999, border: "1px solid #2f2e58", background: "rgba(255,255,255,0.03)", color: "#dfe2f2", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "center" },
  reasonPillActive: { border: "1px solid #f95bad", background: "rgba(249,91,173,0.18)", color: "#fff" },
  textarea: { width: "100%", minHeight: 96, background: "rgba(255,255,255,0.03)", border: "1px solid #2f2e58", borderRadius: 14, padding: "14px 16px", color: "#dfe2f2", fontSize: 15, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  charCount: { color: "#6f7496", fontSize: 13, textAlign: "left", margin: "8px 2px 0" },
  error: { color: "#e36466", fontSize: 14, marginTop: 12 },
  actions: { display: "flex", gap: 14, marginTop: 24, justifyContent: "center" },
  cancelBtn: { flex: 1, maxWidth: 220, padding: "14px 28px", borderRadius: 999, border: "none", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  sendBtn: { flex: 1, maxWidth: 220, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 28px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #f95bad, #ff0084)", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" },
  sendBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
};
