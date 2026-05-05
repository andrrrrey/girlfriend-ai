"use client";

import React, { useState, useEffect, useCallback } from "react";
import { characters, auth } from "../lib/api";
import type { Character } from "../lib/api";
import CharacterProfilePopup from "./components/CharacterProfilePopup";

const PAGE_CSS = `
    /* ─── Content area ───────────────────────────── */
    .content {
      position: relative;
    }

    /* ─── Hero Banner ────────────────────────────── */
    .hero {
      border: 1px solid #313131;
      border-radius: 8px;
      height: 160px;
      position: absolute;
      left: 0;
      right: 0;
      top: 8px;
      margin: 0 36px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      padding: 4px 8px;
    }

    .hero-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .hero-bg img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }

    .hero-content {
      position: relative;
      z-index: 2;
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 453px;
    }
    .hero-title {
      font-size: 32px;
      font-weight: 700;
      color: #fff;
      white-space: nowrap;
      line-height: 1.1;
    }

    .hero-progress {
      position: relative;
      width: 100%;
      display: flex;
      gap: 6px;
      z-index: 2;
    }
    .progress-bar {
      flex: 1;
      height: 2px;
      position: relative;
    }
    .progress-bar-inner {
      position: absolute;
      inset: 0;
      border-radius: 1px;
    }
    .progress-bar.active .progress-bar-inner {
      background: #f95bad;
      box-shadow: 0px 0px 5px 1px rgba(228,0,120,0.6);
    }
    .progress-bar.active .progress-bar-glow {
      position: absolute;
      inset: -500% 0 -800% 0;
    }
    .progress-bar.inactive {
      opacity: 0.7;
    }
    .progress-bar.inactive .progress-bar-inner {
      background: #46383e;
      border-radius: 1px;
    }

    /* ─── Stories ────────────────────────────────── */
    .stories-section {
      position: absolute;
      left: 36px;
      right: 36px;
      top: 196px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .section-label {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      color: #969696;
      line-height: 1.2;
    }

    .stories-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
    }
    .story-avatar {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      object-fit: cover;
      cursor: pointer;
      flex-shrink: 0;
    }
    .stories-arrow {
      position: absolute;
      right: -26px;
      top: 26px;
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    /* ─── Characters ─────────────────────────────── */
    .characters-section {
      position: absolute;
      left: 36px;
      right: 36px;
      top: 196px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .chars-header {
      display: flex;
      flex-direction: column;
      gap: 5px;
      max-width: 570px;
    }
    .chars-title {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.1;
    }
    .chars-title .pink { color: #ff99ce; }

    /* Filter bar */
    .filter-bar {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }
    .search-and-sorting {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .filter-search-wrap {
      display: flex;
      flex: 1;
      gap: 4px;
      align-items: center;
    }
    .filter-search {
      background: #121212;
      border: 1px solid #313131;
      border-radius: 4px;
      flex: 1;
      height: 30px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 500;
      font-family: 'Syne', sans-serif;
      color: #848484;
      line-height: 1.2;
    }
    .filter-search img { width: 16px; height: 16px; flex-shrink: 0; }
    .filter-search span { flex: 1; }
    .filter-settings-btn {
      background: #121212;
      border: 1px solid #313131;
      border-radius: 4px;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      overflow: hidden;
    }
    .filter-settings-btn img { width: 16px; height: 16px; }

    .filter-separator {
      width: 0;
      height: 20px;
      flex-shrink: 0;
      position: relative;
    }
    .filter-separator img {
      position: absolute;
      inset: -2.5% -0.5px;
      display: block;
    }

    .sorting-buttons {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .sorting-btn {
      background: #1e1e1e;
      border-radius: 4px;
      height: 30px;
      padding: 7px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      overflow: hidden;
    }
    .sorting-btn-text {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 500;
      white-space: nowrap;
    }
    .sorting-btn-text .muted { color: #969696; }
    .sorting-btn-text .value { color: #fff; }
    .sorting-btn-text .value-green { color: #c1f0aa; }

    /* Tags row */
    .tags-row {
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
      width: 100%;
    }
    .tag {
      background: #121212;
      border-radius: 4px;
      height: 30px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 500;
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }
    .tag.active {
      background: #1e1e1e;
      position: relative;
      padding: 8px 12px;
      overflow: visible;
    }
    .tag.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 3px;
      background: #f95bad;
      box-shadow: 0px 0px 5px 1px rgba(228,0,120,0.6);
      border-radius: 0.5px;
      filter: blur(0.5px);
      z-index: 2;
    }
    .tag-glow {
      position: absolute;
      bottom: -10px;
      left: 50%;
      transform: translateX(-50%);
      width: 30px;
      height: 30px;
      background: radial-gradient(ellipse at center, rgba(249,91,173,0.8) 0%, rgba(249,91,173,0.4) 35%, rgba(249,91,173,0.1) 55%, transparent 70%);
      pointer-events: none;
      z-index: 1;
      filter: blur(3px);
    }
    .tag.group-chats {
      background: #1e1e1e;
      height: 30px;
      padding: 8px 12px;
    }
    .tags-arrow {
      position: absolute;
      right: -26px;
      top: 7px;
      width: 16px;
      height: 16px;
    }

    /* Character cards */
    .cards-row {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      height: auto;
      width: 100%;
    }

    .card {
      border: 1px solid #313131;
      border-radius: 8px;
      width: 220px;
      height: 300px;
      overflow: hidden;
      position: relative;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 8px;
      cursor: pointer;
    }

    .card-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: 8px;
    }
    .card-bg img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }
    .card-overlay {
      position: absolute;
      inset: 0;
      border-radius: 8px;
      background: linear-gradient(to bottom, rgba(9,9,9,0) 56.167%, rgba(9,9,9,0.8) 100%);
    }

    .card-name {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      position: relative;
      z-index: 1;
      white-space: nowrap;
      line-height: 1.2;
    }

    .card-featured-wrap {
      position: relative;
      height: 300px;
      width: 220px;
      flex-shrink: 0;
    }
    .card-featured-wrap:hover {
      z-index: 5;
    }

    .hover-panel {
      position: absolute;
      left: 0;
      top: 0;
      width: 220px;
      height: 300px;
      background: rgba(9,9,9,0.7);
      backdrop-filter: blur(2px);
      border: 0.8px solid rgba(228,0,120,0.2);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
      padding: 12px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }
    .card-featured-wrap:hover .hover-panel {
      opacity: 1;
      pointer-events: auto;
    }

    .card-featured-wrap:hover .card.featured {
      border-color: #5b5b5b;
    }
    .card-featured-wrap .card.featured {
      border-color: #313131;
    }

    .card-featured-wrap .card-progress {
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    .card-featured-wrap:hover .card-progress {
      opacity: 1;
    }

    /* card-actions as direct child of card-featured-wrap */
    .card-featured-wrap .card-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s ease;
      display: flex;
    }
    .card-featured-wrap:hover .card-actions {
      opacity: 1;
    }

    .hover-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      width: 100%;
      align-content: flex-start;
    }
    .hover-tag {
      background: rgba(255,153,206,0.6);
      backdrop-filter: blur(2px);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 8px;
      font-weight: 500;
      color: #fff;
      white-space: nowrap;
    }

    .hover-description {
      font-size: 10px;
      font-weight: 500;
      color: #fff;
      line-height: 1.3;
      width: 100%;
    }

    .hover-stats {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      width: 100%;
      white-space: nowrap;
    }
    .hover-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
    }
    .hover-stat-value {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .hover-stat-label {
      font-size: 7px;
      font-weight: 500;
      color: #848484;
      text-transform: uppercase;
      line-height: 1.2;
    }

    .card.featured {
      border-color: #5b5b5b;
      left: 0;
      z-index: 2;
    }

    .card-action-btn {
      width: 28px;
      height: 28px;
      background: rgba(48,39,43,0.4);
      backdrop-filter: blur(2px);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-action-btn img { width: 16px; height: 16px; }

    .card-progress {
      display: flex;
      gap: 2px;
      width: 100%;
      position: relative;
      z-index: 2;
    }
    .card-progress .progress-bar {
      flex: 1;
      height: 2px;
    }

    /* ── Responsive ── */
    @media (max-width: 1024px) {
      .characters-section { width: 100%; }
    }
    @media (max-width: 768px) {
      .content { padding-bottom: 24px; }
      .hero { margin: 0 16px; height: 130px; top: 8px; }
      .hero-content { width: 100%; padding: 0 8px; }
      .hero-title { font-size: 20px; white-space: normal; text-align: center; }
      .stories-section { left: 16px; right: 16px; top: 168px; }
      .stories-row { justify-content: flex-start; gap: 12px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .stories-row::-webkit-scrollbar { display: none; }
      .stories-arrow { display: none; }
      .story-avatar { width: 52px; height: 52px; flex-shrink: 0; }
      .characters-section { left: 16px; top: 168px; width: calc(100% - 32px); }
      .chars-header { width: 100%; }
      .chars-title { font-size: 20px; }
      .cards-row { gap: 10px; }
      .card { width: calc(50% - 9px); height: 230px; }
      .card-featured-wrap { width: calc(50% - 9px); height: 230px; }
      .hover-panel { width: 100%; height: 230px; }
      .card-name { font-size: 15px; }
      .search-and-sorting { flex-wrap: wrap; gap: 8px; }
      .filter-search-wrap { flex: 1; min-width: 0; }
      .filter-separator { display: none; }
      .sorting-buttons { width: 100%; gap: 6px; }
      .sorting-btn { flex: 1; min-width: 0; }
      .tags-row { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .tags-row::-webkit-scrollbar { display: none; }
      .tags-arrow { display: none; }
    }
    @media (max-width: 480px) {
      .card { width: calc(50% - 9px); height: 190px; }
      .card-featured-wrap { width: calc(50% - 9px); height: 190px; }
      .hover-panel { width: 100%; height: 190px; }
      .hero-title { font-size: 18px; }
    }
`;

const STATIC_HTML = `
      <!-- Hero Banner -->
      <div class="hero">
        <div class="hero-bg">
          <div style="width:100%;height:100%;background:linear-gradient(135deg, #1a0a1e 0%, #2d1b3d 30%, #1a0a2e 60%, #0d0d1a 100%);border-radius:8px;"></div>
        </div>
        <div class="hero-content">
          <h1 class="hero-title">Create your New Girlfriend</h1>
          <button class="btn-primary">Create Now</button>
        </div>
        <div class="hero-progress">
          <div class="progress-bar active">
            <div class="progress-bar-glow">
                          </div>
            <div class="progress-bar-inner"></div>
          </div>
          <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
          <div class="progress-bar inactive"><div class="progress-bar-inner"></div></div>
        </div>
      </div>

      <!-- Stories (temporarily hidden) -->
      <div class="stories-section" style="display:none;">
        <div class="section-label">Stories</div>
        <div class="stories-row">
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="story-avatar" style="background:linear-gradient(135deg, #f95bad, #ff0084);"></div>
          <div class="stories-arrow">
            <svg class="arrow-right-icon" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </div>
      </div>

      <!-- Characters section -->
      <div class="characters-section">
        <div class="chars-header">
          <div class="section-label">CHARACTERs</div>
          <h2 class="chars-title"><span class="pink">Choose Your Partner </span>for Today</h2>
        </div>

        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="search-and-sorting">
            <div class="filter-search-wrap">
              <div class="filter-search">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><circle cx="7" cy="7" r="4.5" stroke="#848484" stroke-width="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" stroke-width="1.2" stroke-linecap="round"/></svg>
                <span>Search</span>
              </div>
              <div class="filter-settings-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#848484" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              </div>
            </div>
            <div class="filter-separator">
              <div style="width:1px;height:20px;background:#313131;"></div>
            </div>
            <div class="sorting-buttons">
              <div class="sorting-btn" style="width:123px;">
                <span class="sorting-btn-text">
                  <span class="muted">Gender:</span>
                  <span class="value">Female</span>
                </span>
                <svg class="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="sorting-btn" style="width:116px;">
                <span class="sorting-btn-text">
                  <span class="muted">Style:</span>
                  <span class="value">Realistic</span>
                </span>
                <svg class="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="sorting-btn" style="width:155px;">
                <span class="sorting-btn-text">
                  <span class="muted">Created by:</span>
                  <span class="value-green">lovecast.ai</span>
                </span>
                <svg class="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="sorting-btn" style="width:123px;">
                <span class="sorting-btn-text">
                  <span class="muted">Type:</span>
                  <span class="value">Character</span>
                </span>
                <svg class="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="sorting-btn" style="width:169px;">
                <span class="sorting-btn-text">
                  <span class="muted">Sort by:</span>
                  <span class="value">New &bull; Last month</span>
                </span>
                <svg class="chevron-down-icon" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="tags-row">
            <span class="tag active">
              <span class="tag-glow"></span>
              All
            </span>
            <span class="tag group-chats">Group Chats</span>
            <span class="tag">Teen</span>
            <span class="tag">Asian</span>
            <span class="tag">Anime</span>
            <span class="tag">Blond</span>
            <span class="tag">Strong</span>
            <span class="tag">Lonely</span>
            <span class="tag">Young</span>
            <span class="tag">Latina</span>
            <span class="tag">Romantic</span>
            <span class="tag">Athletic</span>
            <span class="tag">Strong</span>
            <span class="tag">Lonely</span>
            <span class="tag">Young</span>
            <span class="tag">Latina</span>
            <span class="tag">Romantic</span>
            <div class="tags-arrow">
              <svg class="arrow-right-icon" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>
        </div>

        <!-- Character cards rendered by React -->
        <div id="cards-row-dynamic" class="cards-row"></div>
      </div>
`;

const FULL_HTML = `<style>${PAGE_CSS}</style><div class="content">${STATIC_HTML}</div>`;

function buildDynamicCards(chars: Character[]): string {
  if (!chars || chars.length === 0) return "";
  return chars
    .map((char, index) => {
      const p = (char.personality as Record<string, unknown> | null) || {};
      const age = p["age"] ? ` ${p["age"]}` : "";
      const label = `${char.name}${age}`;
      const description = (p["description"] as string) || (p["bio"] as string) || "";
      const rawTags = (p["tags"] as string[]) || (p["traits"] as string[]) || [];
      const tagsHtml = rawTags.slice(0, 7)
        .map((t) => `<span class="hover-tag">${t}</span>`)
        .join("");
      const descHtml = description
        ? `<p class="hover-description">${description.slice(0, 140)}${description.length > 140 ? "…" : ""}</p>`
        : `<p class="hover-description" style="color:#969696;">No description yet.</p>`;
      const bgContent = char.avatarUrl
        ? `<img src="${char.avatarUrl}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" alt="${char.name}" />`
        : `<div style="position:absolute;inset:0;width:100%;height:100%;background:linear-gradient(135deg,#2d1b3d 0%,#1a0a2e 50%,#0d0d1a 100%);border-radius:8px;"></div>`;

      return `
<div class="card-featured-wrap" data-char-idx="${index}">
  <div class="hover-panel">
    <div class="hover-tags">${tagsHtml}</div>
    ${descHtml}
    <div class="hover-stats">
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">likes</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">comments</span></div>
      <div class="hover-stat"><span class="hover-stat-value">—</span><span class="hover-stat-label">generated</span></div>
    </div>
  </div>
  <div class="card-actions">
    <div class="card-action-btn">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3.333A1.333 1.333 0 013.333 2h9.334A1.333 1.333 0 0114 3.333v6.334A1.333 1.333 0 0112.667 11H5.333L2 14V3.333z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="card-action-btn">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <div class="card-action-btn">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1" fill="#fff"/><circle cx="8" cy="8" r="1" fill="#fff"/><circle cx="12" cy="8" r="1" fill="#fff"/></svg>
    </div>
  </div>
  <div class="card featured">
    <div class="card-bg">${bgContent}<div class="card-overlay"></div></div>
    <div class="card-name">${label}</div>
  </div>
</div>`;
    })
    .join("\n");
}

export default function HomePage() {
  const [chars, setChars] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);

  useEffect(() => {
    const isLoggedIn = auth.isAuthenticated();
    const fetches: Promise<Character[]>[] = [characters.listPublic()];
    if (isLoggedIn) fetches.push(characters.listMy());

    Promise.all(fetches)
      .then(([pub, my = []]) => {
        const myIds = new Set(my.map((c) => c.id));
        setChars([...my, ...pub.filter((c) => !myIds.has(c.id))]);
      })
      .catch(() => {
        characters.listPublic().then((data) => setChars(data)).catch(() => {});
      });
  }, []);

  const dynamicCardsHtml = buildDynamicCards(chars);

  const charsRef = React.useRef<Character[]>(chars);
  charsRef.current = chars;

  const handleCardClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".card-action-btn")) return;
    const wrap = target.closest(".card-featured-wrap") as HTMLElement | null;
    if (!wrap) return;
    const idx = Number(wrap.dataset.charIdx);
    if (!isNaN(idx) && charsRef.current[idx]) {
      setSelectedChar(charsRef.current[idx]);
    }
  }, []);

  useEffect(() => {
    const container = document.getElementById("cards-row-dynamic");
    if (!container || !dynamicCardsHtml) return;
    container.innerHTML = dynamicCardsHtml;
    container.addEventListener("click", handleCardClick as EventListener);
    return () => container.removeEventListener("click", handleCardClick as EventListener);
  // Re-run when popup closes (selectedChar→null) to restore cards if React reset innerHTML
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicCardsHtml, handleCardClick, selectedChar]);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: FULL_HTML }} />
      <CharacterProfilePopup
        character={selectedChar}
        onClose={() => setSelectedChar(null)}
      />
    </>
  );
}
