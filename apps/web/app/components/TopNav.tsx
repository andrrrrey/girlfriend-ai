"use client";

import React from "react";
import { useAuth } from "../../context/auth";
import { useGeneration } from "../../context/generation";

export default function TopNav({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { user, logout } = useAuth();
  const { completedCount, dismissAllNotifications } = useGeneration();

  function handleLogout() {
    logout();
    window.location.href = "/login";
  }

  return (
    <header className="topnav">
      <button className="hamburger-btn" onClick={onMenuToggle} aria-label="Menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Mobile logo mark */}
      <div className="topnav-logo-mobile">
        <svg width="24" height="22" viewBox="0 0 34 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M31.5811 7.79102C31.581 7.26023 31.4766 6.73451 31.2734 6.24414C31.0957 5.81514 30.8454 5.42049 30.5342 5.07715L30.3965 4.93262C30.0212 4.55711 29.5754 4.2589 29.085 4.05566C28.5946 3.85248 28.0689 3.74809 27.5381 3.74805C27.0072 3.74805 26.4807 3.85243 25.9902 4.05566C25.4999 4.25886 25.0549 4.55727 24.6797 4.93262L23 6.61133L21.3213 4.93262C20.5631 4.17454 19.535 3.74905 18.4629 3.74902C17.3908 3.74902 16.3626 4.17459 15.6045 4.93262C14.8464 5.69071 14.42 6.71892 14.4199 7.79102C14.4199 8.86325 14.8463 9.89221 15.6045 10.6504L14.1895 12.0645C13.0563 10.9312 12.4199 9.39362 12.4199 7.79102C12.42 6.1886 13.0564 4.6517 14.1895 3.51855C15.3227 2.3853 16.8602 1.74902 18.4629 1.74902C20.0655 1.74906 21.6021 2.38541 22.7354 3.51855L23 3.7832L23.2646 3.51855L23.4795 3.31348C23.9928 2.84806 24.5831 2.47385 25.2246 2.20801C25.9578 1.90421 26.7444 1.74805 27.5381 1.74805C28.3316 1.74809 29.1175 1.90425 29.8506 2.20801C30.5837 2.51177 31.2495 2.95733 31.8105 3.51855L32.0156 3.7334C32.481 4.24678 32.8553 4.83699 33.1211 5.47852C33.4248 6.21159 33.581 6.9975 33.5811 7.79102C33.5811 8.58466 33.4249 9.3713 33.1211 10.1045C32.8552 10.746 32.481 11.3363 32.0156 11.8496L31.8105 12.0645L23.707 20.168L22.293 18.7539L30.3965 10.6504C30.7719 10.2751 31.0702 9.82925 31.2734 9.33887C31.4767 8.84838 31.5811 8.32193 31.5811 7.79102Z" fill="white"/>
          <path d="M23.207 14.707L17.707 20.207L16.293 18.793L21.793 13.293L23.207 14.707Z" fill="white"/>
          <path d="M20.207 11.707L14.707 17.207L13.293 15.793L18.793 10.293L20.207 11.707Z" fill="white"/>
        </svg>
      </div>

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
        <button className="topnav-search-icon-btn" aria-label="Search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
        </button>
        {user && completedCount > 0 && (
          <button
            className="topnav-bell-btn"
            onClick={() => { dismissAllNotifications(); window.location.href = "/gallery"; }}
            aria-label="Notifications"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="topnav-bell-badge">{completedCount}</span>
          </button>
        )}
        {!user && <button className="btn-primary" onClick={() => { window.location.href = "/register"; }}>Create Free Account</button>}
        {user ? (
          <button className="btn-secondary" onClick={handleLogout}>Log out <span style={{width:6,height:6,borderRadius:'50%',background:'#E36466',display:'inline-block',marginLeft:4,boxShadow:'0 0 8px 3px rgba(227,100,102,0.6)'}}></span></button>
        ) : (
          <button className="btn-secondary" onClick={() => { window.location.href = "/login"; }}>Log in <span style={{width:6,height:6,borderRadius:'50%',background:'#4ade80',display:'inline-block',marginLeft:4,boxShadow:'0 0 8px 3px rgba(74,222,128,0.6)'}}></span></button>
        )}
      </div>
    </header>
  );
}
