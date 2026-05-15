"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../../../context/auth";
import { admin } from "../../../lib/api";
import { adminStyles } from "../admin-styles";

const LIMIT = 50;

const pageStyles: Record<string, React.CSSProperties> = {
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterBtn: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "6px 14px",
    color: "#969696",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    fontWeight: 500,
  },
  filterBtnActive: {
    background: "linear-gradient(to right, #f95bad, #ff0084)",
    border: "1px solid transparent",
    color: "#fff",
  },
  searchInput: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    width: 260,
    fontFamily: "'Syne', sans-serif",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 8,
    overflow: "hidden",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  thumbWrap: {
    position: "relative",
    width: "100%",
    paddingTop: "100%",
    background: "#0a0a0a",
    overflow: "hidden",
  },
  thumbMedia: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  typeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    background: "rgba(0,0,0,0.7)",
    color: "#f95bad",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 4,
  },
  sourceBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    background: "rgba(0,0,0,0.7)",
    color: "#fdcb6e",
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 4,
  },
  cardBody: {
    padding: "10px 12px",
  },
  promptText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: "1.3",
    marginBottom: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  userText: {
    color: "#969696",
    fontSize: 11,
    marginBottom: 2,
  },
  dateText: {
    color: "#848484",
    fontSize: 10,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 24,
  },
  pageBtn: {
    background: "transparent",
    border: "1px solid #313131",
    color: "#aaa",
    padding: "7px 18px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
  },
  pageInfo: { color: "#888", fontSize: 13 },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.9)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modal: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 12,
    maxWidth: 900,
    width: "100%",
    maxHeight: "90vh",
    overflow: "auto",
    position: "relative",
  },
  modalClose: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "#fff",
    fontSize: 20,
    width: 36,
    height: 36,
    borderRadius: "50%",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  modalMedia: {
    width: "100%",
    maxHeight: 500,
    objectFit: "contain",
    background: "#0a0a0a",
    display: "block",
  },
  modalBody: {
    padding: "20px 24px",
  },
  modalLabel: {
    color: "#848484",
    fontSize: 11,
    marginBottom: 4,
    fontWeight: 500,
  },
  modalValue: {
    color: "#fff",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: "1.5",
    wordBreak: "break-word",
  },
  badge: {
    background: "rgba(249,91,173,0.2)",
    color: "#f95bad",
    fontSize: 13,
    padding: "2px 10px",
    borderRadius: 12,
    fontWeight: "normal",
  },
};

function detectSource(item: any): string {
  if (!item.input) return "Generation";
  const input = item.input;
  if (input.chatId || input.messageId || input.chatContext) return "Chat";
  if (input.generationStyle || input.prompt) return "Generation";
  return "Generation";
}

function getMediaUrl(item: any): string | null {
  return item.output?.url || null;
}

function isVideo(item: any): boolean {
  return item.type === "video";
}

function CardThumbnail({ item }: { item: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const url = getMediaUrl(item);
  const video = isVideo(item);

  if (!url) {
    return (
      <div style={pageStyles.thumbWrap}>
        <div style={{ ...pageStyles.thumbMedia, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 12 }}>
          No media
        </div>
      </div>
    );
  }

  return (
    <div
      style={pageStyles.thumbWrap}
      onMouseEnter={() => { if (video && videoRef.current) videoRef.current.play().catch(() => {}); }}
      onMouseLeave={() => { if (video && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; } }}
    >
      {video ? (
        <video
          ref={videoRef}
          src={url}
          muted
          loop
          playsInline
          preload="metadata"
          style={pageStyles.thumbMedia as React.CSSProperties}
        />
      ) : (
        <img src={url} alt="" style={pageStyles.thumbMedia as React.CSSProperties} loading="lazy" />
      )}
      <span style={pageStyles.typeBadge as React.CSSProperties}>
        {video ? "Video" : "Image"}
      </span>
      <span style={pageStyles.sourceBadge as React.CSSProperties}>
        {detectSource(item)}
      </span>
    </div>
  );
}

function FullscreenModal({ item, onClose }: { item: any; onClose: () => void }) {
  const url = getMediaUrl(item);
  const video = isVideo(item);
  const prompt = item.input?.prompt || item.input?.originalPrompt || "";
  const model = item.input?.model || "";
  const userDisplay = item.user?.nickname || item.user?.email || item.userId || "Unknown";
  const date = item.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div style={pageStyles.overlay as React.CSSProperties} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={pageStyles.modal as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <button style={pageStyles.modalClose as React.CSSProperties} onClick={onClose}>X</button>
        {url && (
          video ? (
            <video src={url} controls autoPlay style={pageStyles.modalMedia as React.CSSProperties} />
          ) : (
            <img src={url} alt="" style={pageStyles.modalMedia as React.CSSProperties} />
          )
        )}
        <div style={pageStyles.modalBody}>
          <div style={pageStyles.modalLabel}>Prompt</div>
          <div style={pageStyles.modalValue}>{prompt || "N/A"}</div>
          <div style={pageStyles.modalLabel}>Model</div>
          <div style={pageStyles.modalValue}>{model || "N/A"}</div>
          <div style={pageStyles.modalLabel}>User</div>
          <div style={pageStyles.modalValue}>{userDisplay}</div>
          <div style={pageStyles.modalLabel}>Date</div>
          <div style={pageStyles.modalValue}>{date || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdminGenerationsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<any | null>(null);

  const loadData = useCallback(async (type: string, s: string, off: number) => {
    setFetching(true);
    setError("");
    try {
      const res = await admin.getGenerations({
        type: type || undefined,
        search: s || undefined,
        limit: LIMIT,
        offset: off,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && user?.role === "admin") {
      loadData(typeFilter, search, offset);
    }
  }, [loading, user, typeFilter, search, offset, loadData]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <a href="/" style={adminStyles.link}>На главную</a>
        </div>
      </div>
    );
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  };

  const handleTypeFilter = (t: string) => {
    setTypeFilter(t);
    setOffset(0);
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + LIMIT, total);

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <div style={adminStyles.tabs}>
          <a href="/admin" style={adminStyles.tab}>Настройки</a>
          <a href="/admin/characters" style={adminStyles.tab}>Персонажи</a>
          <a href="/admin/users" style={adminStyles.tab}>Пользователи</a>
          <a href="/admin/character-options" style={adminStyles.tab}>Опции персонажа</a>
          <a href="/admin/appearance-options" style={adminStyles.tab}>Appearance</a>
          <a href="/admin/pose-options" style={adminStyles.tab}>Pose</a>
          <a href="/admin/scene-options" style={adminStyles.tab}>Scene</a>
          <a href="/admin/camera-options" style={adminStyles.tab}>Camera</a>
          <a href="/admin/generations" style={{ ...adminStyles.tab, ...adminStyles.tabActive }}>Генерации</a>
        </div>

        {error && (
          <div style={{ background: "rgba(227,100,102,0.15)", border: "1px solid #e36466", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#e36466", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={adminStyles.card}>
          <div style={adminStyles.headerRow}>
            <h2 style={{ ...adminStyles.title, display: "flex", alignItems: "center", gap: 10 }}>
              Генерации
              <span style={pageStyles.badge}>{total}</span>
            </h2>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по prompt / user..."
                style={pageStyles.searchInput}
              />
              <button type="submit" style={adminStyles.button}>Найти</button>
            </form>
          </div>

          <div style={pageStyles.filterRow}>
            {[
              { label: "All", value: "" },
              { label: "Images", value: "image" },
              { label: "Videos", value: "video" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => handleTypeFilter(f.value)}
                style={
                  typeFilter === f.value
                    ? { ...pageStyles.filterBtn, ...pageStyles.filterBtnActive }
                    : pageStyles.filterBtn
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : items.length === 0 ? (
            <p style={{ color: "#888", padding: "20px 0" }}>Генерации не найдены.</p>
          ) : (
            <div style={pageStyles.grid}>
              {items.map((item) => {
                const prompt = item.input?.prompt || item.input?.originalPrompt || "";
                const truncated = prompt.length > 50 ? prompt.slice(0, 50) + "..." : prompt;
                const userDisplay = item.user?.nickname || item.user?.email || item.userId || "";
                const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString("ru-RU") : "";

                return (
                  <div
                    key={item.id || item.jobId}
                    style={pageStyles.card}
                    onClick={() => setSelected(item)}
                  >
                    <CardThumbnail item={item} />
                    <div style={pageStyles.cardBody}>
                      <div style={pageStyles.promptText} title={prompt}>{truncated || "No prompt"}</div>
                      <div style={pageStyles.userText}>{userDisplay}</div>
                      <div style={pageStyles.dateText}>{date}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {total > LIMIT && (
            <div style={pageStyles.pagination}>
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                style={pageStyles.pageBtn}
              >
                Previous
              </button>
              <span style={pageStyles.pageInfo}>
                {from}-{to} of {total}
              </span>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                style={pageStyles.pageBtn}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <FullscreenModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
