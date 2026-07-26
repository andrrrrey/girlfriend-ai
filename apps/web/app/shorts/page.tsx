"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/auth";
import { getPublicShorts, likes, comments as commentsApi, resizedMediaUrl } from "../../lib/api";
import type { GalleryItem } from "../../lib/api";
import AuthRequiredOverlay from "../components/AuthRequiredOverlay";
import LikeButton from "../components/LikeButton";
import ShareModal from "../components/ShareModal";
import ReportModal from "../components/ReportModal";
import ShortsCommentsModal from "../components/ShortsCommentsModal";
import { useT } from "../../context/language";

const PAGE_CSS = `
  .shorts-feed-wrapper {
    position: fixed; top: 0; bottom: 0; left: 196px; right: 0;
    overflow-y: scroll; scroll-snap-type: y mandatory; background: #090909;
  }
  .shorts-feed-wrapper::-webkit-scrollbar { display: none; }
  .shorts-feed-wrapper { -ms-overflow-style: none; scrollbar-width: none; }
  .shorts-card-wrap {
    scroll-snap-align: start; scroll-snap-stop: always; width: 100%;
    height: 100dvh; display: flex; align-items: center; justify-content: center;
    padding: 16px 0; box-sizing: border-box;
  }
  .shorts-card {
    position: relative; width: 100%; max-width: 520px; height: 100%;
    border-radius: 8px; overflow: hidden; background: #1e1e1e;
    border: 1px solid #313131; flex-shrink: 0;
  }
  /* contain — горизонтальные видео показываем целиком (с полями), не обрезая и не растягивая по высоте; вертикальные при этом заполняют карточку. */
  .shorts-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
  .shorts-gradient {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 44%, rgba(9,9,9,0.82) 100%);
    pointer-events: none;
  }
  .shorts-bottom {
    position: absolute; bottom: 0; left: 0; right: 56px; padding: 16px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .shorts-profile { display: flex; align-items: center; gap: 10px; }
  .shorts-avatar {
    width: 40px; height: 40px; border-radius: 10px;
    background: linear-gradient(135deg, #f95bad 0%, #c1f0aa 100%);
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff; overflow: hidden;
  }
  .shorts-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .shorts-name {
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 18px;
    line-height: 1.2; color: #fff;
  }
  .shorts-prompt {
    font-family: 'Syne', sans-serif; font-weight: 500; font-size: 12px; line-height: 1.4;
    background: linear-gradient(to right, #fff 0%, rgba(255,255,255,0.5) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .shorts-actions {
    position: absolute; right: 12px; bottom: 16px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .shorts-btn {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(48,39,43,0.4); backdrop-filter: blur(2px);
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: #fff; transition: background 0.15s ease, transform 0.1s ease;
    flex-shrink: 0; padding: 0;
  }
  .shorts-btn:hover { background: rgba(249,91,173,0.35); transform: scale(1.08); }
  .shorts-btn-label {
    font-size: 10px; color: rgba(255,255,255,0.7);
    font-family: 'Syne', sans-serif; font-weight: 500; margin-top: 1px;
  }
  .shorts-btn-group { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .shorts-empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; gap: 16px; color: #969696; font-size: 14px; font-family: 'Syne', sans-serif;
  }
  .shorts-skeleton {
    scroll-snap-align: start; scroll-snap-stop: always; width: 100%; height: 100dvh;
    display: flex; align-items: center; justify-content: center; padding: 16px 0; box-sizing: border-box;
  }
  .shorts-skeleton-inner {
    width: 100%; max-width: 520px; height: 100%; border-radius: 8px;
    background: #1e1e1e; border: 1px solid #313131; position: relative; overflow: hidden;
  }
  .shorts-skeleton-inner::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
    animation: sk-shimmer 1.4s infinite;
  }
  @keyframes sk-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
  @media (max-width: 900px) { .shorts-feed-wrapper { left: 0; } .shorts-card { max-width: 420px; } }
  @media (max-width: 600px) {
    .shorts-feed-wrapper { left: 0; }
    .shorts-card-wrap { padding: 0; border-radius: 0; }
    .shorts-card { max-width: 100%; width: 100%; border-radius: 0; border: none; }
  }
`;

function ShortCard({ item, likeStatus }: { item: GalleryItem; likeStatus?: { liked: boolean; count: number } }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Монтируем <video src> только когда карточка близко к вьюпорту. Иначе браузер
  // начинает качать сразу все видео ленты.
  const [shouldLoad, setShouldLoad] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);

  const url = item.output?.url;
  const prompt = item.input?.prompt || "";
  const creatorName = item.user?.nickname || t("shorts.aiGenerated");
  const creatorAvatar = item.user?.avatarUrl;

  // Ссылка для шеринга шорта (аналогично главной/галерее).
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/shorts?job=${item.jobId}`
    : "";

  // Подгружаем количество комментариев для счётчика под иконкой.
  useEffect(() => {
    let alive = true;
    commentsApi.getCountFor("short", item.jobId)
      .then((r) => { if (alive) setCommentCount(r.count); })
      .catch(() => {});
    return () => { alive = false; };
  }, [item.jobId]);

  // Грузим/выгружаем видео в пределах ~2 экранов от вьюпорта. Выгрузка безопасна:
  // ответы /media/stream кешируются service worker'ом, поэтому скролл назад дешёвый.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShouldLoad(entry.isIntersecting),
      { rootMargin: "200% 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Играем только когда карточка реально в кадре. Эффект перезапускается после
  // монтирования <video> (зависит от shouldLoad), чтобы получить актуальный ref.
  useEffect(() => {
    const video = videoRef.current;
    const card = cardRef.current;
    if (!video || !card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div className="shorts-card-wrap">
      <div className="shorts-card" ref={cardRef}>
        {url && shouldLoad ? (
          <video ref={videoRef} className="shorts-video" src={url} muted loop playsInline preload="metadata" />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)" }} />
        )}

        <div className="shorts-gradient" />

        <div className="shorts-bottom">
          <div className="shorts-profile">
            <div className="shorts-avatar">
              {creatorAvatar
                ? <img src={resizedMediaUrl(creatorAvatar, { w: 96 }) ?? creatorAvatar} alt="" loading="lazy" decoding="async" />
                : creatorName.slice(0, 2).toUpperCase()
              }
            </div>
            <div className="shorts-name">@{creatorName}</div>
          </div>
          {prompt && <div className="shorts-prompt">{prompt}</div>}
        </div>

        <div className="shorts-actions">
          <div className="shorts-btn-group">
            <LikeButton targetType="short" targetId={item.jobId} size="md" showCount={true} initialLiked={likeStatus?.liked || false} initialCount={likeStatus?.count || 0} />
          </div>

          <div className="shorts-btn-group">
            <button className="shorts-btn" onClick={() => setShowComments(true)} aria-label="Comments">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </button>
            <span className="shorts-btn-label">{commentCount ?? 0}</span>
          </div>

          <div className="shorts-btn-group">
            <button className="shorts-btn" onClick={() => setShowShare(true)} aria-label="Share">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>

          <div className="shorts-btn-group" style={{ position: "relative" }}>
            <button className="shorts-btn" onClick={() => setShowMenu((v) => !v)} aria-label="More">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            {showMenu && (
              <div style={{ position: "absolute", right: 44, bottom: 0, background: "#1e1e2e", border: "1px solid #313150", borderRadius: 8, padding: 4, zIndex: 50 }}>
                <button
                  style={{ background: "transparent", border: "none", color: "#e36466", fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  onClick={() => { setShowMenu(false); setShowReport(true); }}
                >
                  {t("home.report")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showComments && (
        <ShortsCommentsModal jobId={item.jobId} onClose={() => setShowComments(false)} onCountChange={setCommentCount} />
      )}
      {showShare && <ShareModal url={shareUrl} onClose={() => setShowShare(false)} />}
      {showReport && <ReportModal targetType="short" targetId={item.jobId} onClose={() => setShowReport(false)} />}
    </div>
  );
}

const SHORTS_PAGE_SIZE = 5;

export default function ShortsPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [likeStatuses, setLikeStatuses] = useState<Record<string, { liked: boolean; count: number }>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback((pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true); else setFetching(true);
    getPublicShorts({ page: pageNum, limit: SHORTS_PAGE_SIZE })
      .then((data) => {
        const newItems = data.items || [];
        if (append) setItems((prev) => [...prev, ...newItems]);
        else setItems(newItems);
        setHasMore(newItems.length >= SHORTS_PAGE_SIZE);
      })
      .catch(() => { if (!append) setItems([]); })
      .finally(() => { setFetching(false); setLoadingMore(false); });
  }, []);

  useEffect(() => {
    if (loading) return;
    setPage(1);
    setHasMore(true);
    fetchItems(1, false);
  }, [loading, fetchItems]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || fetching || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchItems(nextPage, true);
      }
    }, { rootMargin: "100% 0px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, fetching, loadingMore, page, fetchItems]);

  useEffect(() => {
    if (items.length === 0) return;
    const jobIds = items.map((i) => i.jobId);
    likes.batchStatus("short", jobIds)
      .then(setLikeStatuses)
      .catch(() => {});
  }, [items]);

  if (loading) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="shorts-feed-wrapper">
        {!user && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99, pointerEvents: "none" }}>
              <div style={{ position: "absolute", inset: 0, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", pointerEvents: "auto" }} />
            </div>
            <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
              <AuthRequiredOverlay title={t("shorts.signInTitle")} subtitle={t("shorts.signInSubtitle")} />
            </div>
          </>
        )}
        {fetching ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div className="shorts-skeleton" key={i}><div className="shorts-skeleton-inner" /></div>
          ))
        ) : items.length === 0 ? (
          <div className="shorts-card-wrap">
            <div className="shorts-card">
              <div className="shorts-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14"/>
                  <rect x="2" y="6" width="13" height="12" rx="2"/>
                </svg>
                <span>{t("shorts.empty")}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {items.map((item) => <ShortCard key={item.jobId} item={item} likeStatus={likeStatuses[item.jobId]} />)}
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
          </>
        )}
      </div>
    </>
  );
}
