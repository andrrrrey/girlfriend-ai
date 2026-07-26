"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/language";
import { useAuth } from "../../context/auth";
import { comments as commentsApi, resizedMediaUrl } from "../../lib/api";
import type { CommentItem } from "../../lib/api";
import LikeButton from "./LikeButton";

interface Props {
  /** jobId шорта (targetId для targetType="short"). */
  jobId: string;
  onClose: () => void;
  /** Коллбэк при изменении количества комментариев (для обновления счётчика). */
  onCountChange?: (count: number) => void;
}

/**
 * Попап комментариев к короткому видео (Shorts). Использует полиморфный
 * comments API (targetType="short"). По структуре повторяет вкладку комментариев
 * персонажа, но самодостаточен и не завязан на CharacterProfilePopup.
 */
export default function ShortsCommentsModal({ jobId, onClose, onCountChange }: Props) {
  const { t } = useT();
  const { user } = useAuth();
  const [items, setItems] = useState<CommentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    try {
      const res = await commentsApi.listFor("short", jobId, cursor);
      setItems((prev) => (cursor ? [...prev, ...res.items] : res.items));
      setNextCursor(res.nextCursor);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleSend = async () => {
    if (!user || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.createFor("short", jobId, text.trim());
      setItems((prev) => [created, ...prev]);
      setText("");
      onCountChange?.(items.length + 1);
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>{t("comments.title")}</span>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#cfd3e6" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={s.list}>
          {loading ? (
            <p style={s.empty}>…</p>
          ) : items.length === 0 ? (
            <p style={s.empty}>{t("comments.empty")}</p>
          ) : (
            <>
              {items.map((c) => (
                <div key={c.id} style={s.row}>
                  <div style={s.avatar}>
                    {c.user.avatarUrl
                      ? <img src={resizedMediaUrl(c.user.avatarUrl, { w: 72 }) ?? c.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (c.user.nickname || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.name}>{c.user.nickname || t("comments.anon")}</div>
                    <div style={s.text}>{c.content}</div>
                  </div>
                  <LikeButton targetType="comment" targetId={c.id} size="sm" showCount initialLiked={c.liked} initialCount={c.likeCount} />
                </div>
              ))}
              {nextCursor && (
                <button style={s.loadMore} onClick={() => load(nextCursor)}>{t("comments.loadMore")}</button>
              )}
            </>
          )}
        </div>

        {user ? (
          <div style={s.footer}>
            <input
              style={s.input}
              placeholder={t("comments.placeholder")}
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            />
            <button style={{ ...s.sendBtn, opacity: text.trim() && !submitting ? 1 : 0.5 }} onClick={handleSend} disabled={!text.trim() || submitting}>
              {t("comments.send")}
            </button>
          </div>
        ) : (
          <div style={s.footer}>
            <a href="/login" style={s.sendBtn}>{t("report.login")}</a>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 10000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0 },
  modal: { position: "relative", background: "#14132e", borderRadius: "18px 18px 0 0", border: "1px solid #2a2950", width: "min(560px, 100vw)", height: "70vh", display: "flex", flexDirection: "column", boxShadow: "0 -20px 60px rgba(0,0,0,0.5)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #2a2950" },
  title: { color: "#fff", fontSize: 16, fontWeight: 700 },
  closeBtn: { width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  list: { flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 14 },
  empty: { color: "#6f7496", fontSize: 14, textAlign: "center", padding: "30px 0" },
  row: { display: "flex", alignItems: "flex-start", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #f95bad, #c1f0aa)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden" },
  name: { color: "#cfd3e6", fontSize: 13, fontWeight: 700 },
  text: { color: "#dfe2f2", fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" },
  loadMore: { background: "transparent", border: "none", color: "#f95bad", fontSize: 13, cursor: "pointer", padding: "8px 0" },
  footer: { display: "flex", gap: 10, padding: "14px 20px", borderTop: "1px solid #2a2950" },
  input: { flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #2f2e58", borderRadius: 999, padding: "10px 16px", color: "#fff", fontSize: 14, outline: "none", fontFamily: "inherit" },
  sendBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 22px", borderRadius: 999, border: "none", background: "linear-gradient(90deg, #f95bad, #ff0084)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none" },
};
