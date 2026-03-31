"use client";

import React from "react";

export default function TopNav() {
  return (
    <header className="topnav">
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
        <button className="btn-secondary">Log in <span className="green-dot-wrap"><img src="http://localhost:3845/assets/b136c23032446e3ea960eb3580e238f7bd9e8c54.svg" alt="" /></span></button>
      </div>
    </header>
  );
}
