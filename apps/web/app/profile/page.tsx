"use client";

import { useState } from "react";
import { useAuth } from "../../context/auth";
import { users } from "../../lib/api";

type Tab = "subscription" | "account" | "preferences" | "chat-profiles";

/* ═══════════════════════════════════════
   CSS  (pp- prefix)
═══════════════════════════════════════ */
const CSS = `
/* ── Page wrapper ── */
.pp-wrap {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: 'Syne', sans-serif;
  color: #fff;
}

/* ── Hero (user header) ── */
.pp-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 24px;
  border-bottom: 1px solid #252525;
  margin-bottom: 24px;
}
.pp-hero-ava-wrap { position: relative; flex-shrink: 0; }
.pp-hero-ava {
  width: 56px; height: 56px;
  border-radius: 8px; border: 1px solid #313131;
  overflow: hidden; background: #1e1e1e;
  display: flex; align-items: center; justify-content: center;
}
.pp-hero-ava img { width: 100%; height: 100%; object-fit: cover; }
.pp-hero-badge {
  position: absolute; bottom: -4px; left: -4px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #F95BAD; border: 2px solid #090909;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.pp-hero-info { display: flex; flex-direction: column; gap: 2px; }
.pp-hero-name {
  font-size: 28px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1.1; color: #fff;
}
.pp-hero-handle {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0;
}
.pp-hero-logout {
  margin-left: auto; flex-shrink: 0;
  display: flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 16px;
  background: transparent; border: 1px solid #313131; border-radius: 8px;
  color: #E36466; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  cursor: pointer; transition: border-color 0.2s;
}
.pp-hero-logout:hover { border-color: #E36466; }

/* ── Tabs ── */
.pp-tabs { display: flex; gap: 2px; width: 100%; margin-bottom: 24px; }
.pp-tab {
  flex: 1 0 0; min-width: 1px;
  display: flex; flex-direction: column; gap: 12px; align-items: center;
  cursor: pointer;
}
.pp-tab-label {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  text-align: center; width: 100%; color: #969696;
  line-height: 1; user-select: none;
}
.pp-tab-active .pp-tab-label { color: #fff; }
.pp-tab-line { height: 2px; border-radius: 1px; width: 100%; background: #30272b; }
.pp-tab-active .pp-tab-line {
  background: #f95bad;
  box-shadow: 0 0 5px 1px rgba(228,0,120,0.6);
  filter: blur(0.5px);
}

/* ── Admin link ── */
.pp-admin-link {
  display: inline-flex; align-items: center; gap: 8px;
  height: 30px; background: #1e1e1e; border: 1px solid rgba(228,0,120,0.3);
  border-radius: 4px; color: #f95bad; font-size: 12px; font-weight: 500;
  font-family: 'Syne', sans-serif; padding: 0 14px;
  text-decoration: none; margin-bottom: 16px; transition: border-color 0.2s;
}
.pp-admin-link:hover { border-color: #f95bad; }

/* ── Subscription ── */
.pp-sub { display: flex; gap: 8px; align-items: flex-start; max-width: 900px; }
.pp-sub-card {
  flex: 0 0 300px; width: 300px; min-height: 416px;
  border: 1px solid rgba(255,153,206,0.6); border-radius: 4px;
  padding: 20px 16px; display: flex; flex-direction: column; gap: 12px;
  align-items: center; text-align: center;
  background:
    radial-gradient(circle 160px at 50% 60%, rgba(200,40,110,0.55) 0%, rgba(100,15,60,0.25) 50%, transparent 72%),
    linear-gradient(180deg, #0d080e 0%, #120a12 100%);
}
.pp-sub-icon {
  width: 54px; height: 54px;
  background: #1e1e1e; border: 0.8px solid rgba(228,0,120,0.3);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
}
.pp-sub-title {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1; color: #fff;
}
.pp-sub-price { display: flex; gap: 6px; align-items: flex-end; justify-content: center; }
.pp-sub-amount {
  font-size: 32px; font-weight: 700; font-family: 'Syne', sans-serif;
  line-height: 1; color: #fff;
}
.pp-sub-period {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0; margin-bottom: 4px;
}
.pp-sub-charge {
  background: rgba(0,0,0,0.35); height: 28px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; padding: 0 12px;
  font-size: 11px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #d0d0d0; white-space: nowrap; width: 100%;
}
.pp-sub-spacer { flex: 1; }
.pp-sub-btns { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.pp-btn-grad {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-btn-grad:disabled { opacity: 0.6; cursor: not-allowed; }
.pp-btn-dark {
  display: flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px;
  background: #121212; border: 1px solid #313131; width: 100%; cursor: pointer;
  font-size: 14px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}

/* Feature cards + comparison */
.pp-sub-right { flex: 1; min-width: 0; display: flex; gap: 8px; }
.pp-feat-list { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.pp-feat-card {
  background: #252525; border: 1px solid #313131; border-radius: 4px;
  padding: 10px 12px; display: flex; gap: 10px; align-items: center;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-feat-ico {
  width: 26px; height: 26px; flex-shrink: 0;
  background: rgba(48,39,43,0.5); border-radius: 4px;
  display: flex; align-items: center; justify-content: center; font-size: 13px;
}
.pp-cmp-col {
  width: 90px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 6px;
}
.pp-cmp-head {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0;
  border: 1px solid #313131; border-radius: 4px; overflow: hidden; height: 46px;
}
.pp-cmp-head span {
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 600; color: #969696; font-family: 'Syne', sans-serif;
  background: #1e1e1e;
}
.pp-cmp-head span:first-child { border-right: 1px solid #313131; }
.pp-cmp-cell {
  display: grid; grid-template-columns: 1fr 1fr;
  background: #1e1e1e; border: 1px solid #313131; border-radius: 4px;
  height: 46px; /* matches .pp-feat-card height ~46px */
}
.pp-cmp-cell span {
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-family: 'Syne', sans-serif;
}
.pp-cmp-cell span:first-child { border-right: 1px solid #313131; color: #848484; }
.pp-cmp-cell span:last-child { color: #d0d0d0; }
.pp-chk { color: #C1F0AA; font-size: 13px; }
.pp-x { color: #E36466; font-size: 13px; }

/* ── Shared form primitives ── */
.pp-field { display: flex; flex-direction: column; gap: 8px; }
.pp-lbl {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #fff; display: flex; align-items: center; justify-content: space-between;
}
.pp-lbl-left { display: flex; align-items: center; gap: 6px; }
.pp-verified {
  font-size: 9px; font-weight: 500; color: #C1F0AA;
  border: 1px solid #C1F0AA; border-radius: 3px; padding: 1px 6px;
  background: rgba(193,240,170,0.08);
}
.pp-input {
  height: 38px; background: #121212; border: 1px solid #313131; border-radius: 4px;
  color: #fff; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  padding: 0 12px; outline: none; width: 100%; box-sizing: border-box;
  transition: border-color 0.2s;
}
.pp-input:focus { border-color: #f95bad; }
.pp-input:disabled { color: #848484; cursor: not-allowed; }
.pp-input::placeholder { color: #969696; }
.pp-textarea {
  min-height: 180px; background: #121212; border: 1px solid #313131; border-radius: 4px;
  color: #fff; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  padding: 10px 12px; outline: none; width: 100%; box-sizing: border-box;
  resize: vertical; line-height: 1.5; transition: border-color 0.2s;
}
.pp-textarea:focus { border-color: #f95bad; }
.pp-textarea::placeholder { color: #969696; }
.pp-feedback { font-size: 11px; font-family: 'Syne', sans-serif; }
.pp-feedback.ok { color: #C1F0AA; }
.pp-feedback.err { color: #E36466; }
.pp-save-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px; padding: 0 24px;
  background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; cursor: pointer;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pp-cancel-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 38px; border-radius: 4px; padding: 0 24px;
  background: #121212; border: 1px solid #313131; cursor: pointer;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-btn-sm {
  height: 30px; background: #121212; border: 1px solid #313131; border-radius: 4px;
  color: #fff; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  padding: 0 14px; cursor: pointer; display: flex; align-items: center; gap: 6px;
  justify-content: center; white-space: nowrap; transition: border-color 0.2s;
}
.pp-btn-sm:hover { border-color: #f95bad; }

/* ── Account Info ── */
.pp-acc-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px 32px; align-items: start;
}
@media (max-width: 768px) { .pp-acc-grid { grid-template-columns: 1fr; } }
.pp-acc-col { display: flex; flex-direction: column; gap: 20px; }
.pp-avatar-row { display: flex; gap: 12px; align-items: flex-start; }
.pp-avatar-box {
  width: 110px; height: 110px; flex-shrink: 0;
  border: 1px solid #313131; border-radius: 8px; overflow: hidden;
  position: relative; background: #1e1e1e;
}
.pp-avatar-box img { width: 100%; height: 100%; object-fit: cover; }
.pp-avatar-fade {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to bottom, rgba(9,9,9,0) 56%, rgba(9,9,9,0.8));
}
.pp-avatar-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.pp-avatar-right { display: flex; flex-direction: column; gap: 8px; }
.pp-avatar-btns { display: flex; flex-direction: column; gap: 8px; }
.pp-helper {
  font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif;
  color: #848484; line-height: 1.3; display: flex; flex-direction: column;
}

/* Social links */
.pp-social-row {
  display: flex; align-items: center; gap: 8px;
}
.pp-social-row .pp-input { flex: 1; }
.pp-social-del {
  width: 30px; height: 30px; flex-shrink: 0;
  background: #121212; border: 1px solid #313131; border-radius: 4px;
  color: #E36466; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: border-color 0.2s;
}
.pp-social-del:hover { border-color: #E36466; }
.pp-add-more {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 38px; background: #121212; border: 1px solid #313131; border-radius: 4px;
  color: #848484; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  cursor: pointer; transition: border-color 0.2s, color 0.2s; width: 100%;
}
.pp-add-more:hover { border-color: #f95bad; color: #fff; }
.pp-delete-acc {
  display: flex; align-items: center; gap: 8px;
  background: transparent; border: none;
  color: #E36466; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  cursor: pointer; padding: 0;
}

/* Password row */
.pp-pwd-row {
  display: flex; align-items: center; justify-content: space-between;
}
.pp-pwd-link {
  font-size: 11px; color: #f95bad; cursor: pointer; background: none; border: none;
  font-family: 'Syne', sans-serif; font-weight: 500; padding: 0;
}
.pp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
@media (max-width: 600px) { .pp-grid-2 { grid-template-columns: 1fr; } }

/* Save / cancel bar */
.pp-acc-bottom {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 16px; border-top: 1px solid #252525; margin-top: 8px;
  grid-column: 1 / -1;
}

/* ── Preferences ── */
.pp-pref { display: flex; flex-direction: column; gap: 24px; max-width: 800px; }
.pp-section { display: flex; flex-direction: column; gap: 12px; }
.pp-section-lbl {
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff;
}
.pp-style-grid { display: flex; gap: 10px; }
.pp-style-card {
  flex: 1 0 0; min-width: 0; height: 160px;
  border-radius: 8px; border: 1px dashed #969696;
  overflow: hidden; position: relative; cursor: pointer;
  display: flex; align-items: center; justify-content: center; padding: 12px;
  box-sizing: border-box;
}
.pp-style-card.pp-active { border: 1px solid #f95bad; }
.pp-style-bg { position: absolute; inset: 0; background-size: cover; background-position: center top; }
.pp-style-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); }
.pp-style-name {
  position: relative; z-index: 1;
  font-size: 16px; font-weight: 700; font-family: 'Syne', sans-serif;
  color: #fff; text-align: center; width: 100%;
  text-shadow: 0 1px 6px rgba(0,0,0,0.8);
}
.pp-drops { display: flex; flex-direction: column; gap: 8px; }
.pp-drop-row {
  display: flex; align-items: center; justify-content: space-between;
  background: #1e1e1e; height: 30px; border-radius: 4px;
  padding: 0 10px; position: relative; cursor: pointer;
}
.pp-drop-left { display: flex; align-items: center; gap: 4px; }
.pp-drop-lbl { font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif; color: #969696; }
.pp-drop-val { font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff; }
.pp-drop-sel { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

/* Tags */
.pp-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.pp-tag {
  padding: 6px 14px; border-radius: 20px;
  background: rgba(255,255,255,0.04); border: 0.8px solid #313131;
  color: #848484; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  cursor: pointer; transition: all 0.15s; user-select: none; white-space: nowrap;
}
.pp-tag:hover { border-color: rgba(249,91,173,0.4); color: #d0d0d0; }
.pp-tag.pp-tag-on {
  background: rgba(249,91,173,0.12); border-color: #f95bad; color: #f95bad;
}

/* ── Chat Profiles ── */
.pp-chats { display: flex; flex-direction: column; gap: 8px; max-width: 600px; }
.pp-chat-card {
  display: flex; gap: 8px; align-items: flex-start;
  background: #252525; padding: 6px; border-radius: 8px;
}
.pp-chat-ava {
  width: 40px; height: 40px; flex-shrink: 0;
  border-radius: 4px; background: #313131; overflow: hidden;
  display: flex; align-items: center; justify-content: center; color: #848484;
}
.pp-chat-ava img { width: 100%; height: 100%; object-fit: cover; }
.pp-chat-info { flex: 1 0 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-self: center; }
.pp-chat-name { font-size: 12px; font-weight: 600; font-family: 'Syne', sans-serif; color: #fff; }
.pp-chat-bio { font-size: 10px; font-weight: 500; font-family: 'Syne', sans-serif; color: #848484; line-height: 1.3; }
.pp-chat-btn {
  width: 24px; height: 24px; flex-shrink: 0; align-self: center;
  border-radius: 8px; background: transparent; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  padding: 6px; box-sizing: border-box; color: #848484; backdrop-filter: blur(2px);
}
.pp-chat-create {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  height: 30px; background: #121212; border: 1px solid #313131;
  border-radius: 4px; color: #fff; padding: 0 14px; cursor: pointer;
  font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif;
  transition: border-color 0.2s;
}
.pp-chat-create:hover { border-color: #f95bad; }

/* ── Unauthenticated ── */
.pp-unauth {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: calc(100vh - 200px); gap: 20px; text-align: center;
}
.pp-unauth-title { font-size: 22px; font-weight: 700; font-family: 'Syne', sans-serif; margin-bottom: 8px; }
.pp-unauth-sub { font-size: 13px; color: #848484; max-width: 320px; line-height: 1.6; font-family: 'Syne', sans-serif; }
.pp-unauth-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
.pp-unauth-p {
  padding: 10px 24px; background: linear-gradient(90deg, #f95bad, #ff0084);
  border: none; border-radius: 4px; color: #fff;
  font-size: 13px; font-weight: 600; font-family: 'Syne', sans-serif;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
}
.pp-unauth-s {
  padding: 10px 24px; background: transparent; border: 1px solid #313131;
  border-radius: 4px; color: #fff;
  font-size: 13px; font-weight: 600; font-family: 'Syne', sans-serif;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center;
}
@media (max-width: 768px) {
  .pp-wrap { padding: 16px; }
  .pp-sub { flex-direction: column; }
  .pp-sub-card { flex: none; width: 100%; }
  .pp-sub-right { flex-direction: column; }
  .pp-cmp-col { width: 100%; }
  .pp-style-grid { flex-wrap: wrap; }
  .pp-style-card { flex: 1 0 calc(50% - 5px); }
}
`;

/* ═══════════════════════════════════════
   Data
═══════════════════════════════════════ */
const FEATURES = [
  { icon: "💬", label: "Messages per day",   free: "10",  pro: "∞" },
  { icon: "🖼️", label: "Image generations",  free: "10",  pro: "∞" },
  { icon: "🎬", label: "Video content",       free: "✗",   pro: "✓" },
  { icon: "❤️", label: "AI relationships",    free: "1",   pro: "∞" },
  { icon: "⭐", label: "Premium characters",  free: "✗",   pro: "✓" },
  { icon: "🎭", label: "Custom personas",     free: "✗",   pro: "✓" },
  { icon: "📷", label: "NSFW content",        free: "✗",   pro: "✓" },
  { icon: "⚡", label: "Priority responses",  free: "✗",   pro: "✓" },
];

const STYLES = [
  { label: "Realistic", bg: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&h=240&fit=crop&crop=face" },
  { label: "Semi-real", bg: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=300&h=240&fit=crop&crop=face" },
  { label: "Anime",     bg: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=300&h=240&fit=crop" },
  { label: "2D",        bg: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=240&fit=crop" },
];

const TAG_GROUPS = [
  {
    label: "Appearance",
    tags: ["Romantic", "Athletic", "Caring", "Innocent", "College Student", "Anime", "Vintage", "Mysterious", "Playful"],
  },
  {
    label: "Hobbies",
    tags: ["Gaming", "Fitness", "Travel", "Music", "Cooking", "Art", "Reading", "Dancing"],
  },
];

const CHAT_DATA = [
  { name: "Artem, 25", bio: "Creative writer and hopeless romantic. Loves poetry, rainy days, and deep conversations about the meaning of life." },
  { name: "Boris, 40", bio: "Experienced and thoughtful. Great listener with a dry sense of humor and a passion for history." },
];

const TABS: { id: Tab; label: string }[] = [
  { id: "subscription",  label: "Subscription"  },
  { id: "account",       label: "Account Info"  },
  { id: "preferences",   label: "Preferences"   },
  { id: "chat-profiles", label: "Chat Profiles" },
];

/* ═══════════════════════════════════════
   Icons
═══════════════════════════════════════ */
function IcoPerson({ size = 24, stroke = "#848484" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function IcoLogout() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

function IcoDiamond() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M6 3h12l4 6-10 13L2 9z" fill="none" stroke="#F95BAD" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 9h20" stroke="#F95BAD" strokeWidth="1.5"/>
      <path d="M12 3 8 9m4-6 4 6" stroke="#FF99CE" strokeWidth="1" opacity="0.7"/>
    </svg>
  );
}

function IcoChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="#848484" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function IcoPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

/* ═══════════════════════════════════════
   Tabs
═══════════════════════════════════════ */
function SubscriptionTab() {
  return (
    <div className="pp-sub">
      <div className="pp-sub-card">
        <div className="pp-sub-icon"><IcoDiamond /></div>
        <div className="pp-sub-title">Pro</div>
        <div className="pp-sub-price">
          <span className="pp-sub-amount">$ 25</span>
          <span className="pp-sub-period">/ 6 month</span>
        </div>
        <div className="pp-sub-charge">We will charge your card on: 07/23/2026</div>
        <div className="pp-sub-spacer" />
        <div className="pp-sub-btns">
          <button className="pp-btn-grad">Upgrade</button>
          <button className="pp-btn-dark">Manage Subscription</button>
        </div>
      </div>

      <div className="pp-sub-right">
        <div className="pp-feat-list">
          {FEATURES.map((f) => (
            <div className="pp-feat-card" key={f.label}>
              <div className="pp-feat-ico">{f.icon}</div>
              {f.label}
            </div>
          ))}
        </div>
        <div className="pp-cmp-col">
          <div className="pp-cmp-head">
            <span>Free</span><span>Pro</span>
          </div>
          {FEATURES.map((f) => (
            <div className="pp-cmp-cell" key={f.label}>
              <span className={f.free === "✗" ? "pp-x" : f.free === "✓" ? "pp-chk" : ""}>{f.free}</span>
              <span className={f.pro === "✓" ? "pp-chk" : f.pro === "✗" ? "pp-x" : ""}>{f.pro}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountTab() {
  const { user, refreshProfile } = useAuth();
  const [avatarUrl, setAvatarUrl]   = useState(user?.avatarUrl ?? "");
  const [nickname, setNickname]     = useState(user?.nickname ?? "");
  const [bio, setBio]               = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(`bio-${user?.id}`) ?? "") : "");
  const [socialLinks, setSocialLinks] = useState<string[]>(() =>
    user?.socialLinks?.map((l) => l.url) ?? []);
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd]         = useState("");
  const [msg, setMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleSave() {
    setSaving(true); setMsg(null);
    try {
      await users.updateProfile({ nickname: nickname || null, avatarUrl: avatarUrl || null });
      if (typeof window !== "undefined") localStorage.setItem(`bio-${user?.id}`, bio);
      const nonEmpty = socialLinks.filter((u) => u.trim());
      await Promise.all(nonEmpty.map((url) => {
        const p = detectProvider(url);
        return users.upsertSocialLink(p, url);
      }));
      await refreshProfile();
      setMsg({ text: "Saved successfully", ok: true });
    } catch { setMsg({ text: "Failed to save", ok: false }); }
    finally { setSaving(false); }
  }

  async function handleChangePwd() {
    if (!currentPwd || !newPwd) { setPwdMsg({ text: "Fill both fields", ok: false }); return; }
    setSavingPwd(true); setPwdMsg(null);
    try {
      await users.changePassword(currentPwd, newPwd);
      setPwdMsg({ text: "Password changed", ok: true });
      setCurrentPwd(""); setNewPwd(""); setShowPwdForm(false);
    } catch { setPwdMsg({ text: "Incorrect current password", ok: false }); }
    finally { setSavingPwd(false); }
  }

  function detectProvider(url: string): string {
    if (url.includes("instagram.com")) return "instagram";
    if (url.includes("tiktok.com")) return "tiktok";
    if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
    if (url.includes("vk.com")) return "vk";
    if (url.includes("facebook.com")) return "facebook";
    return "other";
  }

  return (
    <div>
      <div className="pp-acc-grid">
        {/* ── Left column ── */}
        <div className="pp-acc-col">
          {/* Profile picture */}
          <div className="pp-field">
            <span className="pp-lbl"><span className="pp-lbl-left">Profile picture</span></span>
            <div className="pp-avatar-row">
              <div className="pp-avatar-box">
                {avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatarUrl} alt="avatar" />
                  : <div className="pp-avatar-ph"><IcoPerson size={40} stroke="#848484" /></div>}
                <div className="pp-avatar-fade" />
              </div>
              <div className="pp-avatar-right">
                <div className="pp-avatar-btns">
                  <button className="pp-btn-sm" onClick={() => {
                    const url = prompt("Enter image URL:"); if (url) setAvatarUrl(url);
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Replace picture
                  </button>
                  <button className="pp-btn-sm" onClick={() => setAvatarUrl("")}>Remove</button>
                </div>
                <div className="pp-helper">
                  <span>*.png, @.jpeg files up to 10MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* E-mail */}
          <div className="pp-field">
            <div className="pp-lbl">
              <span className="pp-lbl-left">E-mail</span>
              <span className="pp-verified" style={{ fontSize: 10, padding: "2px 8px" }}>Verified</span>
            </div>
            <div style={{ position: "relative" }}>
              <input className="pp-input" type="text" value={user?.email ?? ""} disabled style={{ paddingRight: 36 }} />
              <svg style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C1F0AA" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="16.24 7.76 10 14 7.76 11.76"/></svg>
            </div>
          </div>

          {/* Password */}
          <div className="pp-field">
            <div className="pp-lbl">
              <span className="pp-lbl-left">Password</span>
              <button className="pp-pwd-link" onClick={() => setShowPwdForm((v) => !v)}>
                {showPwdForm ? "Cancel" : "Change password"}
              </button>
            </div>
            {!showPwdForm
              ? <input className="pp-input" type="password" value="●●●●●●●●●●" disabled />
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input className="pp-input" type="password" placeholder="Current password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
                  <input className="pp-input" type="password" placeholder="New password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                  <button className="pp-save-btn" style={{ alignSelf: "flex-start" }} onClick={handleChangePwd} disabled={savingPwd}>
                    {savingPwd ? "Saving…" : "Confirm"}
                  </button>
                  {pwdMsg && <span className={`pp-feedback ${pwdMsg.ok ? "ok" : "err"}`}>{pwdMsg.text}</span>}
                </div>
            }
          </div>

          {/* Social media links */}
          <div className="pp-field">
            <span className="pp-lbl"><span className="pp-lbl-left">Social Media links</span></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {socialLinks.map((url, i) => (
                <div className="pp-social-row" key={i}>
                  <input className="pp-input" type="text" value={url} placeholder="https://"
                    onChange={e => { const a = [...socialLinks]; a[i] = e.target.value; setSocialLinks(a); }} />
                  <button className="pp-social-del" onClick={() => setSocialLinks(socialLinks.filter((_, j) => j !== i))}>
                    <IcoTrash />
                  </button>
                </div>
              ))}
              <button className="pp-add-more" onClick={() => setSocialLinks([...socialLinks, ""])}>
                <IcoPlus /> Add more
              </button>
            </div>
          </div>

          {/* Delete account */}
          <button className="pp-delete-acc" onClick={() => alert("To delete your account, please contact support.")}>
            <IcoTrash /> Delete account
          </button>
        </div>

        {/* ── Right column ── */}
        <div className="pp-acc-col">
          <div className="pp-field">
            <span className="pp-lbl"><span>Name</span></span>
            <input className="pp-input" type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Your name" />
          </div>

          <div className="pp-field">
            <span className="pp-lbl"><span>Nickname</span></span>
            <input className="pp-input" type="text" value={nickname ? `@${nickname.toLowerCase().replace(/\s+/g, "")}` : ""} disabled placeholder="@handle" />
          </div>

          <div className="pp-field">
            <span className="pp-lbl"><span>Bio</span></span>
            <textarea className="pp-textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell about yourself…" />
          </div>
        </div>

        {/* ── Bottom bar ── */}
        <div className="pp-acc-bottom">
          {msg && <span className={`pp-feedback ${msg.ok ? "ok" : "err"}`} style={{ marginRight: "auto", alignSelf: "center" }}>{msg.text}</span>}
          <button className="pp-cancel-btn" onClick={() => { setNickname(user?.nickname ?? ""); setAvatarUrl(user?.avatarUrl ?? ""); }}>Cancel</button>
          <button className="pp-save-btn" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [style,   setStyle]   = useState("Realistic");
  const [gender,  setGender]  = useState("Female");
  const [age,     setAge]     = useState("18–25");
  const [content, setContent] = useState("All");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set(["Romantic", "Athletic", "Gaming"]));

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const s = new Set(prev);
      s.has(tag) ? s.delete(tag) : s.add(tag);
      return s;
    });
  }

  const drops = [
    { label: "Preferred gender:", val: gender,  set: setGender,  opts: ["Female", "Male", "All"] },
    { label: "Age range:",        val: age,     set: setAge,     opts: ["18–25", "25–35", "35+", "Any"] },
    { label: "Content type:",     val: content, set: setContent, opts: ["All", "SFW only", "NSFW only"] },
  ];

  return (
    <div className="pp-pref">
      <div className="pp-section">
        <span className="pp-section-lbl">Graphic style</span>
        <div className="pp-style-grid">
          {STYLES.map((s) => (
            <div key={s.label} className={`pp-style-card${style === s.label ? " pp-active" : ""}`} onClick={() => setStyle(s.label)}>
              <div className="pp-style-bg" style={{ backgroundImage: `url(${s.bg})` }} />
              {style !== s.label && <div className="pp-style-overlay" />}
              <span className="pp-style-name">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pp-section">
        <span className="pp-section-lbl">Preferences</span>
        <div className="pp-drops">
          {drops.map((d) => (
            <div key={d.label} className="pp-drop-row">
              <div className="pp-drop-left">
                <span className="pp-drop-lbl">{d.label}</span>
                <span className="pp-drop-val">&nbsp;{d.val}</span>
              </div>
              <IcoChevron />
              <select className="pp-drop-sel" value={d.val} onChange={e => d.set(e.target.value)}>
                {d.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {TAG_GROUPS.map((g) => (
        <div className="pp-section" key={g.label}>
          <span className="pp-section-lbl">{g.label}</span>
          <div className="pp-tags">
            {g.tags.map((tag) => (
              <div key={tag} className={`pp-tag${activeTags.has(tag) ? " pp-tag-on" : ""}`} onClick={() => toggleTag(tag)}>
                {tag}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatProfilesTab() {
  return (
    <div className="pp-chats">
      {CHAT_DATA.map((p) => (
        <div className="pp-chat-card" key={p.name}>
          <div className="pp-chat-ava"><IcoPerson size={20} stroke="#848484" /></div>
          <div className="pp-chat-info">
            <div className="pp-chat-name">{p.name}</div>
            <div className="pp-chat-bio">{p.bio}</div>
          </div>
          <button className="pp-chat-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
        </div>
      ))}
      <button className="pp-chat-create">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/>
          <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
        </svg>
        Create New
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════
   Unauthenticated
═══════════════════════════════════════ */
function UnauthContent() {
  return (
    <div className="pp-unauth">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#313131" strokeWidth="1.5" strokeLinecap="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <div>
        <div className="pp-unauth-title">You&apos;re not logged in</div>
        <div className="pp-unauth-sub">Sign in or create an account to access your profile.</div>
      </div>
      <div className="pp-unauth-btns">
        <a href="/login" className="pp-unauth-p">Sign in</a>
        <a href="/register" className="pp-unauth-s">Create account</a>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ProfileContent (authenticated)
═══════════════════════════════════════ */
function ProfileContent() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("subscription");
  const isAdmin = user?.role === "admin";

  function handleLogout() { logout(); window.location.href = "/login"; }

  const displayName = user?.nickname ?? user?.email?.split("@")[0] ?? "User";
  const handle = `@${(user?.email ?? "user").split("@")[0]}`;

  return (
    <>
      {/* Admin link */}
      {isAdmin && (
        <a href="/admin" className="pp-admin-link">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-2.82-1.18l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Admin panel
        </a>
      )}

      {/* Hero header */}
      <div className="pp-hero">
        <div className="pp-hero-ava-wrap">
          <div className="pp-hero-ava">
            {user?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.avatarUrl} alt="avatar" />
              : <IcoPerson size={28} stroke="#848484" />}
          </div>
          <div className="pp-hero-badge" onClick={() => document.querySelector<HTMLButtonElement>(".pp-btn-replace")?.click()}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
        </div>
        <div className="pp-hero-info">
          <div className="pp-hero-name">{displayName}</div>
          <div className="pp-hero-handle">{handle}</div>
        </div>
        <button className="pp-hero-logout" onClick={handleLogout}>
          <IcoLogout /> Logout Account
        </button>
      </div>

      {/* Tabs */}
      <div className="pp-tabs">
        {TABS.map((t) => (
          <div key={t.id} className={`pp-tab${activeTab === t.id ? " pp-tab-active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <span className="pp-tab-label">{t.label}</span>
            <div className="pp-tab-line" />
          </div>
        ))}
      </div>

      {activeTab === "subscription"  && <SubscriptionTab />}
      {activeTab === "account"       && <AccountTab />}
      {activeTab === "preferences"   && <PreferencesTab />}
      {activeTab === "chat-profiles" && <ChatProfilesTab />}
    </>
  );
}

/* ═══════════════════════════════════════
   Page
═══════════════════════════════════════ */
export default function ProfilePage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pp-wrap">
        {user ? <ProfileContent /> : <UnauthContent />}
      </div>
    </>
  );
}
