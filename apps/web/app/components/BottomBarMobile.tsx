"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function BottomBarMobile() {
  const pathname = usePathname();

  if (pathname.startsWith("/shorts")) return null;

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav className="bottom-bar-mobile">
      <a href="/" className={`bb-tab${isActive("/") ? " bb-active" : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </a>
      <a href="/gallery" className={`bb-tab${isActive("/gallery") ? " bb-active" : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span>Gallery</span>
      </a>
      <a href="/create" className={`bb-tab bb-tab-create${isActive("/create") ? " bb-active" : ""}`}>
        <div className="bb-create-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <span>Create</span>
      </a>
      <a href="/chat" className={`bb-tab${isActive("/chat") ? " bb-active" : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span>Chat</span>
      </a>
      <a href="#" className={`bb-tab${false ? " bb-active" : ""}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 3 18 3 22 9 12 22 2 9"/>
          <line x1="2" y1="9" x2="22" y2="9"/>
          <line x1="12" y1="22" x2="8" y2="9"/>
          <line x1="12" y1="22" x2="16" y2="9"/>
        </svg>
        <span>Premium</span>
      </a>
    </nav>
  );
}
