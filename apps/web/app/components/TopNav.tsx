"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { useGeneration } from "../../context/generation";
import { useT } from "../../context/language";
import { useContentMode } from "../../context/contentMode";
import Logo from "./Logo";

/**
 * Сегментный переключатель режима контента SFW / NSFW в хедере.
 * Несовершеннолетним (canToggle === false) NSFW заблокирован.
 */
function ContentModeToggle() {
  const { mode, setMode, canToggle } = useContentMode();
  return (
    <div className="content-mode-toggle" role="group" aria-label="Content mode">
      <button
        type="button"
        className={`cmt-seg${mode === "sfw" ? " active" : ""}`}
        aria-pressed={mode === "sfw"}
        onClick={() => setMode("sfw")}
      >
        SFW
      </button>
      <button
        type="button"
        className={`cmt-seg${mode === "nsfw" ? " active" : ""}${!canToggle ? " disabled" : ""}`}
        aria-pressed={mode === "nsfw"}
        disabled={!canToggle}
        title={!canToggle ? "NSFW недоступен для аккаунтов младше 18" : undefined}
        onClick={() => setMode("nsfw")}
      >
        NSFW
      </button>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function TopNav({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { t } = useT();
  // Human label for a generation notification based on its source/type.
  const sourceLabel = (source?: string, type?: string) =>
    source === "character-creation" ? t("notif.character")
    : source === "chat" ? t("notif.chatImage")
    : type === "video" ? t("notif.video") : t("notif.image");
  const {
    activeJobs, notificationHistory,
    dismissAllNotifications, dismissHistoryItem, clearNotificationHistory,
  } = useGeneration();
  const isGenerating = activeJobs.length > 0;
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Откладываем чтение localStorage до маунта (после гидрации), чтобы серверная
  // и первая клиентская отрисовка совпали (иначе hydration mismatch). Это
  // позволяет сразу знать, что пользователь залогинен, и не мигать гостевыми
  // кнопками, пока профиль подтягивается через GET /users/me.
  const [hasToken, setHasToken] = useState(false);
  useEffect(() => {
    setHasToken(!!localStorage.getItem("accessToken"));
  }, []);
  // Токен есть, но профиль ещё не подтверждён первым запросом — показываем
  // нейтральный плейсхолдер вместо «Create account / Log in».
  const authPending = loading && hasToken;
  // После завершения проверки опираемся на профиль: если токен оказался
  // невалидным (refresh не удался), user будет null → покажем гостевые кнопки.
  const isLoggedIn = user != null;

  // Close dropdown on click outside
  useEffect(() => {
    if (!bellOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [bellOpen]);

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  const historyCount = notificationHistory.length + activeJobs.length;

  return (
    <header className="topnav">
      <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Mobile logo — полный логотип с текстом рядом с гамбургером */}
      <div className="topnav-logo-mobile" onClick={() => router.push("/")} role="link" aria-label="virtflirt.ai">
        <Logo />
      </div>

      <div className="search-box">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
        <span>{t("topnav.search")}</span>
      </div>
      <nav className="topnav-links">
        <a href="/blog">{t("topnav.blog")}</a>
        <a href="/guide">{t("topnav.guide")}</a>
        <a href="/subscription">{t("topnav.subscription")}</a>
        <a href="/characters">{t("topnav.characters")}</a>
      </nav>
      <div className="topnav-buttons">
        <ContentModeToggle />
        <button className="topnav-search-icon-btn" aria-label={t("topnav.search")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
        {user && (
          <div className="topnav-bell-wrap" ref={bellRef}>
            <button
              className={`topnav-bell-btn${isGenerating ? " generating" : ""}`}
              onClick={() => setBellOpen((prev) => !prev)}
              aria-label={t("topnav.notifications")}
            >
              {isGenerating && (
                <svg className="topnav-bell-spinner" width="38" height="38" viewBox="0 0 38 38">
                  <circle cx="19" cy="19" r="17" fill="none" stroke="url(#bell-grad)" strokeWidth="2" strokeDasharray="80 27" strokeLinecap="round"/>
                  <defs><linearGradient id="bell-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f95bad"/><stop offset="100%" stopColor="#ff0084"/></linearGradient></defs>
                </svg>
              )}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {historyCount > 0 && (
                <span className="topnav-bell-badge">{historyCount}</span>
              )}
            </button>

            {bellOpen && (
              <div className="bell-dropdown">
                <div className="bell-dropdown-header">
                  <span className="bell-dropdown-title">{t("topnav.notifications")}</span>
                  {(notificationHistory.length > 0 || activeJobs.length > 0) && (
                    <button
                      className="bell-clear-btn"
                      onClick={(e) => { e.stopPropagation(); clearNotificationHistory(); dismissAllNotifications(); }}
                    >
                      {t("topnav.clearAll")}
                    </button>
                  )}
                </div>
                <div className="bell-dropdown-list">
                  {activeJobs.length === 0 && notificationHistory.length === 0 && (
                    <div className="bell-dropdown-empty">{t("topnav.noNotifications")}</div>
                  )}
                  {activeJobs.map((job) => (
                    <div key={job.jobId} className="bell-dropdown-item started">
                      <div className="bell-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                      </div>
                      <div className="bell-item-body">
                        <div className="bell-item-title">
                          {t("notif.generating", { label: sourceLabel(job.source, job.type) })}
                        </div>
                        <div className="bell-item-time">{formatTimeAgo(new Date(job.startedAt).getTime())}</div>
                      </div>
                    </div>
                  ))}
                  {[...notificationHistory].reverse().map((n) => (
                    <div
                      key={n.id}
                      className={`bell-dropdown-item ${n.status}${n.status === "completed" ? " clickable" : ""}`}
                      onClick={n.status === "completed" ? () => {
                        dismissHistoryItem(n.id);
                        setBellOpen(false);
                        if (n.source === "character-creation") router.push("/create");
                        else if (n.source === "chat" && n.metadata?.chatId) router.push(`/chat?sessionId=${n.metadata.chatId}`);
                        else router.push("/gallery");
                      } : undefined}
                    >
                      <div className="bell-item-icon">
                        {n.status === "completed" && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                        {n.status === "failed" && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e36466" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                          </svg>
                        )}
                      </div>
                      <div className="bell-item-body">
                        <div className="bell-item-title">
                          {n.status === "completed"
                            ? t("notif.ready", { label: sourceLabel(n.source, n.type) })
                            : t("notif.failed", { label: sourceLabel(n.source, n.type) })}
                        </div>
                        <div className="bell-item-time">{formatTimeAgo(n.timestamp)}</div>
                      </div>
                      <button
                        className="bell-item-dismiss"
                        onClick={(e) => { e.stopPropagation(); dismissHistoryItem(n.id); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {authPending ? (
          // Плейсхолдер, пока подтверждается авторизация — без мигания кнопок.
          <span aria-hidden style={{width:92,height:36,borderRadius:8,background:'rgba(255,255,255,0.06)',display:'inline-block'}} />
        ) : isLoggedIn ? (
          <button className="btn-secondary" onClick={handleLogout}>{t("topnav.logout")} <span style={{width:6,height:6,borderRadius:'50%',background:'#E36466',display:'inline-block',marginLeft:4,boxShadow:'0 0 8px 3px rgba(227,100,102,0.6)'}}></span></button>
        ) : (
          <>
            <button className="btn-primary" onClick={() => router.push("/register")}>{t("topnav.createAccount")}</button>
            <button className="btn-secondary" onClick={() => router.push("/login")}>{t("topnav.login")} <span style={{width:6,height:6,borderRadius:'50%',background:'#4ade80',display:'inline-block',marginLeft:4,boxShadow:'0 0 8px 3px rgba(74,222,128,0.6)'}}></span></button>
          </>
        )}
      </div>
    </header>
  );
}
