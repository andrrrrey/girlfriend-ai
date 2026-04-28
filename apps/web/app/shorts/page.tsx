"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { getPublicShorts } from "../../lib/api";

/* ── Types ─────────────────────────────────────────── */

interface ShortItem {
  jobId: string;
  type: string;
  output: { url?: string } | null;
  input: { prompt?: string; model?: string } | null;
  createdAt: string;
}

/* ── CSS ─────────────────────────────────────────── */

const PAGE_CSS = `
  .shorts-feed-wrapper {
    position: fixed;
    inset: 0 0 0 240px; /* offset for sidebar */
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    background: #090909;
  }

  .shorts-feed-wrapper::-webkit-scrollbar { display: none; }
  .shorts-feed-wrapper { -ms-overflow-style: none; scrollbar-width: none; }

  .shorts-card-wrap {
    scroll-snap-align: start;
    scroll-snap-stop: always;
    width: 100%;
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
    box-sizing: border-box;
  }

  .shorts-card {
    position: relative;
    width: 100%;
    max-width: 520px;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
    background: #1e1e1e;
    border: 1px solid #313131;
    flex-shrink: 0;
  }

  .shorts-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .shorts-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 44%, rgba(9,9,9,0.82) 100%);
    pointer-events: none;
  }

  /* Bottom info row */
  .shorts-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 56px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shorts-profile {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .shorts-avatar {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, #f95bad 0%, #c1f0aa 100%);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }

  .shorts-name {
    font-family: 'Syne', sans-serif;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.2;
    color: #fff;
  }

  .shorts-prompt {
    font-family: 'Syne', sans-serif;
    font-weight: 500;
    font-size: 12px;
    line-height: 1.4;
    background: linear-gradient(to right, #fff 0%, rgba(255,255,255,0.5) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Action buttons (right side) */
  .shorts-actions {
    position: absolute;
    right: 12px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .shorts-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(48,39,43,0.4);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: background 0.15s ease, transform 0.1s ease;
    flex-shrink: 0;
    padding: 0;
  }
  .shorts-btn:hover { background: rgba(249,91,173,0.35); transform: scale(1.08); }
  .shorts-btn.liked { color: #f95bad; }

  .shorts-btn-label {
    font-size: 10px;
    color: rgba(255,255,255,0.7);
    font-family: 'Syne', sans-serif;
    font-weight: 500;
    margin-top: 1px;
  }

  .shorts-btn-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  /* Empty / loading */
  .shorts-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 16px;
    color: #969696;
    font-size: 14px;
    font-family: 'Syne', sans-serif;
  }
  .shorts-empty svg { opacity: 0.3; }

  .shorts-skeleton {
    scroll-snap-align: start;
    scroll-snap-stop: always;
    width: 100%;
    height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 0;
    box-sizing: border-box;
  }
  .shorts-skeleton-inner {
    width: 100%;
    max-width: 520px;
    height: 100%;
    border-radius: 8px;
    background: #1e1e1e;
    border: 1px solid #313131;
    position: relative;
    overflow: hidden;
  }
  .shorts-skeleton-inner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
    animation: sk-shimmer 1.4s infinite;
  }
  @keyframes sk-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  /* Tablet ≤900px */
  @media (max-width: 900px) {
    .shorts-feed-wrapper { inset: 0; }
    .shorts-card { max-width: 420px; }
  }

  /* Mobile ≤600px */
  @media (max-width: 600px) {
    .shorts-feed-wrapper { inset: 0; }
    .shorts-card-wrap { padding: 0; border-radius: 0; }
    .shorts-card {
      max-width: 100%;
      width: 100%;
      border-radius: 0;
      border: none;
    }
    .shorts-card-wrap { padding: 0; }
  }
`;

/* ── SVG icons ─────────────────────────────────────── */

const HeartIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#f95bad" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);

const CommentIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
  </svg>
);

/* ── Card component ─────────────────────────────────── */

function ShortCard({ item, index }: { item: ShortItem; index: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount] = useState(Math.floor(Math.random() * 900) + 10);

  const url = item.output?.url;
  const prompt = item.input?.prompt || "";

  // Autoplay/pause via IntersectionObserver
  useEffect(() => {
    const video = videoRef.current;
    const card = cardRef.current;
    if (!video || !card) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  const initials = `AI`;

  return (
    <div className="shorts-card-wrap">
      <div className="shorts-card" ref={cardRef}>
        {url ? (
          <video
            ref={videoRef}
            className="shorts-video"
            src={url}
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%)" }} />
        )}

        <div className="shorts-gradient" />

        {/* Bottom info */}
        <div className="shorts-bottom">
          <div className="shorts-profile">
            <div className="shorts-avatar">{initials}</div>
            <div className="shorts-name">AI Generated</div>
          </div>
          {prompt && <div className="shorts-prompt">{prompt}</div>}
        </div>

        {/* Action buttons */}
        <div className="shorts-actions">
          <div className="shorts-btn-group">
            <button
              className={`shorts-btn${liked ? " liked" : ""}`}
              onClick={() => setLiked((v) => !v)}
            >
              <HeartIcon filled={liked} />
            </button>
            <span className="shorts-btn-label">{likeCount + (liked ? 1 : 0)}</span>
          </div>

          <div className="shorts-btn-group">
            <button className="shorts-btn">
              <CommentIcon />
            </button>
            <span className="shorts-btn-label">0</span>
          </div>

          <div className="shorts-btn-group">
            <button className="shorts-btn" onClick={() => {
              if (url && navigator.share) {
                navigator.share({ url }).catch(() => {});
              }
            }}>
              <ShareIcon />
            </button>
          </div>

          <div className="shorts-btn-group">
            <button className="shorts-btn">
              <DotsIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────── */

export default function ShortsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ShortItem[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    getPublicShorts()
      .then((data) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setFetching(false));
  }, [user, loading, router]);

  if (loading) return null;
  if (!user) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="shorts-feed-wrapper">
        {fetching ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div className="shorts-skeleton" key={i}>
              <div className="shorts-skeleton-inner" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="shorts-card-wrap">
            <div className="shorts-card">
              <div className="shorts-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#969696" strokeWidth="1.5">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14"/>
                  <rect x="2" y="6" width="13" height="12" rx="2"/>
                </svg>
                <span>No videos yet. Generate one first!</span>
              </div>
            </div>
          </div>
        ) : (
          items.map((item, i) => (
            <ShortCard key={item.jobId} item={item} index={i} />
          ))
        )}
      </div>
    </>
  );
}
