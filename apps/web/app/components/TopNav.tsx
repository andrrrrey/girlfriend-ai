"use client";

import React from "react";

export default function TopNav({ onMenuToggle }: { onMenuToggle?: () => void }) {
  return (
    <header className="topnav">
      <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div className="search-box">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
        <span>Search</span>
      </div>
      <nav className="topnav-links">
        <a href="#">Blog</a>
        <a href="#">Guide</a>
        <a href="#">Subscription</a>
      </nav>
      <div className="topnav-buttons">
        <button className="btn-primary">Create Free Account</button>
        <button className="btn-secondary">Log in <span className="green-dot-wrap" style={{width:6,height:6,borderRadius:'50%',background:'#4ade80',display:'inline-block',marginLeft:4,boxShadow:'0 0 8px 3px rgba(74,222,128,0.6)'}}></span></button>
      </div>
    </header>
  );
}
