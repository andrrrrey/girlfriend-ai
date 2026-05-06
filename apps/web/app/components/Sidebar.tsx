"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/auth";
import { chats } from "../../lib/api";
import Logo from "./Logo";

type ActivePage = "home" | "shorts" | "chat" | "gallery" | "generate" | "create-character" | "my-ai" | "admin" | "profile";

export default function Sidebar({
  activePage,
  mobileOpen,
  onClose,
}: {
  activePage?: ActivePage;
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const { user, logout } = useAuth();
  // Read token synchronously so the label is correct on the very first render
  // (avoids flicker while useAuth's async profile fetch is in-flight)
  const [hasToken] = useState(() =>
    typeof window !== "undefined" && !!localStorage.getItem("accessToken")
  );
  const isLoggedIn = user != null || hasToken;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    chats.list().then((res) => {
      const count = res.items.filter((c) => {
        if (!c.lastMessage || c.lastMessage.role !== "assistant") return false;
        const lastRead = localStorage.getItem(`chat-read-${c.id}`);
        if (!lastRead) return true;
        return c.lastMessage.createdAt > lastRead;
      }).length;
      setUnreadCount(count);
    }).catch(() => {});
  }, [user]);

  const navLinkClass = (page: ActivePage) =>
    `nav-link${activePage === page ? " active" : ""}`;

  return (
    <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
      <div className="sidebar-logo">
        <Logo />
      </div>

      <div className="sidebar-separator"></div>

      {/* Main nav */}
      <nav className="nav-section">
        <div className="nav-title">Main</div>
        <a href="/" className={navLinkClass("home")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span className="label">Home</span>
        </a>
        <a href="/shorts" className={navLinkClass("shorts")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
          <span className="label">Shorts</span>
        </a>
        <a href="/chat" className={navLinkClass("chat")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="8" cy="10" r="0.5" fill="currentColor"/><circle cx="12" cy="10" r="0.5" fill="currentColor"/><circle cx="16" cy="10" r="0.5" fill="currentColor"/></svg>
          <span className="label">Chat</span>
          {unreadCount > 0 && (
            <span className="nav-badge">{unreadCount} <span className="badge-dot" style={{width:5,height:5,borderRadius:'50%',background:'#4ade80',display:'inline-block',boxShadow:'0 0 6px 2px rgba(74,222,128,0.6)'}}></span></span>
          )}
        </a>
        <a href="/gallery" className={navLinkClass("gallery")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span className="label">Gallery</span>
        </a>
        <a href="/generation" className={navLinkClass("generate")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span className="label">Generate Content</span>
        </a>
        <a href="/create" className={navLinkClass("create-character")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          <span className="label">Create Character</span>
        </a>
        <a href="/my-ai" className={navLinkClass("my-ai")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span className="label">My AI</span>
        </a>
        <a className="nav-link premium">
          <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><polygon points="6 3 18 3 22 9 12 22 2 9"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="22" x2="8" y2="9"/><line x1="12" y1="22" x2="16" y2="9"/><line x1="6" y1="3" x2="8" y2="9"/><line x1="18" y1="3" x2="16" y2="9"/><line x1="12" y1="3" x2="12" y2="9"/></svg>
          <span className="label">Become Premium</span>
        </a>
      </nav>

      <div className="sidebar-separator"></div>

      {/* Settings nav */}
      <nav className="nav-section settings-nav">
        <div className="nav-title">Settings</div>
        <a href="/profile" className={navLinkClass(isLoggedIn ? "profile" : "admin")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M6.168 18.849A4 4 0 0 1 10 16h4a4 4 0 0 1 3.834 2.855"/></svg>
          <span className="label">{isLoggedIn ? "My account" : "Creator account"}</span>
        </a>
        <a className="nav-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          <span className="label">Settings</span>
          <svg className="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </nav>

      {/* Bottom links */}
      <nav className="nav-section">
        <a className="nav-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          <span className="label">English</span>
          <svg className="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
        <a className="nav-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span className="label">Help center</span>
        </a>
        <a className="nav-link logout" onClick={() => { logout(); window.location.href = "/login"; }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span className="label">Logout Account</span>
        </a>
      </nav>

      <div className="sidebar-bottom-text">PRIVACY NOTICE &bull; LEGAL INFORMATION</div>
    </aside>
  );
}
