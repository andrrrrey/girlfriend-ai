"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/auth";
import {
  createImageJob,
  createVideoJob,
  getJobStatus,
  getImageStyles,
  getVideoStyles,
  getGenerationHistory,
  deleteGenerationJob,
  getCharacterOptions,
  getAppearanceOptions,
  getPoseOptions,
  getSceneOptions,
  getCameraOptions,
} from "../../lib/api";
import type { CharacterOption, AppearanceOptionsResponse, PoseOptionsResponse, SceneOptionsResponse, CameraOptionsResponse } from "../../lib/api";
import CharacterModal, { DEFAULT_CHARACTER_SELECTIONS } from "../components/CharacterModal";
import type { CharacterSelections } from "../components/CharacterModal";
import AppearanceModal, { DEFAULT_APPEARANCE_SELECTIONS } from "../components/AppearanceModal";
import type { AppearanceSelections } from "../components/AppearanceModal";
import PoseModal, { DEFAULT_POSE_SELECTIONS } from "../components/PoseModal";
import type { PoseSelections } from "../components/PoseModal";
import SceneModal, { DEFAULT_SCENE_SELECTIONS } from "../components/SceneModal";
import type { SceneSelections } from "../components/SceneModal";
import CameraModal, { DEFAULT_CAMERA_SELECTIONS } from "../components/CameraModal";
import type { CameraSelections } from "../components/CameraModal";
import PromptDetailsModal, { DEFAULT_PROMPT_DETAILS_SELECTIONS } from "../components/PromptDetailsModal";
import type { PromptDetailsSelections } from "../components/PromptDetailsModal";

const CSS = `
  /* ── Page content ── */
  .page-content {
    flex: 1;
    overflow-y: auto;
    position: relative;
  }
  .generate-content {
    position: absolute;
    left: 274px;
    top: 20px;
    width: 696px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 40px;
  }
  .page-label {
    position: absolute;
    left: 36px;
    top: 26px;
    font-size: 10px;
    font-weight: 500;
    color: #969696;
    text-transform: uppercase;
    line-height: 1.2;
  }

  /* Title */
  .page-title {
    font-size: 32px;
    font-weight: 700;
    line-height: 1.1;
  }
  .page-title .accent {
    color: #ff99ce;
  }

  /* ── Segmented Tabs ── */
  .seg-tabs {
    display: flex;
    align-items: center;
    gap: 3px;
    background: #1e1e1e;
    border-radius: 4px;
    padding: 3px;
    width: 696px;
  }
  .seg-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 26px;
    padding: 5px 18px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    color: #969696;
    cursor: pointer;
    background: transparent;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .seg-tab.active {
    background: #313131;
    color: #c1f0aa;
  }
  .seg-tab:hover:not(.active) {
    color: #fff;
  }
  .seg-tab svg { width: 16px; height: 16px; }

  /* ── Separator ── */
  .sep { width: 100%; height: 1px; background: #313131; }

  /* ── Sorting row ── */
  .sorting-row {
    display: flex;
    gap: 4px;
    align-items: center;
    width: 100%;
  }
  .sort-btn {
    flex: 1;
    height: 30px;
    background: #1e1e1e;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    cursor: pointer;
    overflow: hidden;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .sort-btn .sort-text {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
  }
  .sort-btn .sort-text .label { color: #969696; }
  .sort-btn .sort-text .value { color: #fff; }
  .sort-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

  .model-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #1e1e1e;
    border: 1px solid #313131;
    border-radius: 8px;
    z-index: 100;
    padding: 4px 0;
    min-width: 220px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }
  .model-dropdown-item {
    padding: 8px 14px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    color: #fff;
    font-family: 'Syne', sans-serif;
    transition: background 0.1s;
  }
  .model-dropdown-item:hover { background: #2a2a2a; }
  .model-dropdown-item.active { color: #f95bad; }
  .model-dropdown-desc {
    font-size: 10px;
    color: #848484;
    font-weight: 400;
  }
  .model-dropdown-item.active .model-dropdown-desc { color: rgba(249,91,173,0.6); }

  .btn-random {
    flex: 1;
    height: 30px;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }
  .btn-random svg { width: 16px; height: 16px; }

  /* ── Editor cards ── */
  .editor-section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
  }
  .editor-card {
    height: 220px;
    background: #090909;
    border: 1px dashed #969696;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 20px 12px;
    cursor: pointer;
    overflow: hidden;
    position: relative;
  }
  .editor-card.active { border: 1px solid #f95bad; }
  .editor-card:hover { border-color: #f95bad; }
  .editor-card .card-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .editor-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(48, 39, 43, 0.4);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .editor-icon.premium { background: rgba(249, 91, 173, 0.3); }
  .editor-icon svg { width: 20px; height: 20px; }
  .editor-text { text-align: center; width: 100%; }
  .editor-text .name {
    font-size: 16px;
    font-weight: 700;
    line-height: normal;
  }
  .editor-text .sub {
    font-size: 7px;
    font-weight: 500;
    color: #848484;
    text-transform: uppercase;
    line-height: 1.2;
    margin-top: 4px;
  }
  .editor-text .sub.required { color: #c1f0aa; }
  .editor-text .sub.premium-label { color: #f95bad; }
  .editor-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: center;
    width: 100%;
    padding: 0 4px;
  }
  .editor-tag {
    background: rgba(249, 91, 173, 0.2);
    color: #f95bad;
    border-radius: 6px;
    font-size: 9px;
    font-weight: 600;
    padding: 3px 7px;
    white-space: nowrap;
  }

  /* ── Custom Prompt ── */
  .custom-prompt-card {
    background: #090909;
    border: 1px dashed #969696;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 12px;
    cursor: pointer;
    width: 100%;
  }
  .custom-prompt-card:hover { border-color: #f95bad; }
  .custom-prompt-card.expanded {
    border-style: solid;
    border-color: #f95bad;
    padding: 20px;
    align-items: stretch;
  }
  .custom-prompt-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(255, 153, 206, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .custom-prompt-icon svg { width: 20px; height: 20px; }
  .custom-prompt-card .heading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .custom-prompt-card .heading span {
    font-size: 16px;
    font-weight: 700;
  }
  .premium-icon svg { width: 16px; height: 16px; }
  .premium-label {
    font-size: 7px;
    font-weight: 500;
    color: #f95bad;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.2;
  }

  .prompt-textarea {
    width: 100%;
    min-height: 80px;
    background: rgba(0,0,0,0.3);
    border: 1px solid #313131;
    border-radius: 8px;
    color: white;
    padding: 12px;
    font-size: 14px;
    font-family: 'Syne', sans-serif;
    resize: vertical;
    margin-bottom: 12px;
  }
  .prompt-textarea:focus {
    outline: none;
    border-color: #f95bad;
  }
  .prompt-textarea::placeholder { color: #848484; }

  .model-selector {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .model-selector label {
    font-size: 13px;
    color: #969696;
  }
  .model-selector select {
    background: rgba(0,0,0,0.3);
    border: 1px solid #313131;
    border-radius: 8px;
    color: white;
    padding: 8px 12px;
    font-size: 13px;
    font-family: 'Syne', sans-serif;
    cursor: pointer;
    min-width: 200px;
  }
  .model-selector select:focus {
    outline: none;
    border-color: #f95bad;
  }
  .model-selector select option { background: #090909; }

  /* ── Choice chips ── */
  .section-title {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
  }
  .chips-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }
  .chips-row {
    display: flex;
    gap: 4px;
    width: 696px;
  }
  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 32px;
    padding: 7px 30px;
    border-radius: 4px;
    background: #1e1e1e;
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .chip:hover { background: #2a2a2a; }
  .chip.active { background: #313131; }
  .chip.orient { width: 171px; }
  .chip.orient-sm { width: 112.667px; }
  .chip.flex-1 { flex: 1; }
  .chip svg { width: 16px; height: 16px; flex-shrink: 0; }

  .orient-icon {
    width: 16px; height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .orient-rect {
    border: 1px solid #fff;
    border-radius: 0.4px;
  }
  .r-4-5 { width: 8px; height: 10px; }
  .r-5-4 { width: 10px; height: 8px; }
  .r-9-16 { width: 9px; height: 16px; }
  .r-16-9 { width: 16px; height: 9px; }
  .r-1-1 { width: 16px; height: 16px; }

  /* ── Bottom buttons ── */
  .bottom-btns {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  .btn-cancel {
    flex: 1;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #121212;
    border: 1px solid #313131;
    border-radius: 4px;
    color: #fff;
    font-family: 'Syne', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-cancel:hover { background: #1e1e1e; }
  .btn-generate {
    flex: 1;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(90deg, #f95bad, #ff0084);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-family: 'Syne', sans-serif;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn-generate:hover { opacity: 0.9; }
  .btn-generate:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Spinner ── */
  .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px;
    color: #969696;
  }
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #313131;
    border-top-color: #f95bad;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    background: rgba(255, 118, 117, 0.1);
    border: 1px solid #e36466;
    border-radius: 8px;
    padding: 12px;
    color: #e36466;
    font-size: 13px;
  }

  /* ── Gallery ── */
  .gallery-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .gallery-header h3 { font-size: 20px; }
  .gallery-header span { color: #f95bad; }

  .image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .img-item {
    aspect-ratio: 1/1;
    background: #1e1e1e;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  .img-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
  }
  .img-item .img-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px;
    background: linear-gradient(transparent, rgba(0,0,0,0.8));
    font-size: 11px;
    color: #969696;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .img-item:hover .img-overlay { opacity: 1; }

  .empty-gallery {
    text-align: center;
    padding: 40px;
    color: #969696;
    font-size: 14px;
  }

  .premium-gem svg {
    width: 16px;
    height: 16px;
  }

  /* ── Video sub-tabs ── */
  .video-subtabs {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
    position: relative;
  }
  .video-subtab {
    flex: 1;
    padding: 10px 0;
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #969696;
    cursor: pointer;
    background: transparent;
    border: none;
    font-family: 'Syne', sans-serif;
    position: relative;
    transition: color 0.2s;
  }
  .video-subtab.active {
    color: #fff;
  }
  .video-subtab.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .video-subtabs-line {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: #313131;
  }
  .video-subtabs-glow {
    position: absolute;
    bottom: 0;
    height: 2px;
    background: linear-gradient(90deg, #f95bad, #ff0084);
    box-shadow: 0 0 8px rgba(249, 91, 173, 0.6), 0 0 16px rgba(249, 91, 173, 0.3);
    border-radius: 1px;
    transition: left 0.3s, width 0.3s;
  }

  /* ── Gallery section ── */
  .gallery-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }
  .gallery-title {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
    text-align: center;
  }
  .gallery-title .accent { color: #ff99ce; }

  /* Gallery filter tabs */
  .gallery-filter-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: #1e1e1e;
    border-radius: 4px;
    padding: 3px;
    width: fit-content;
    margin: 0 auto;
  }
  .gallery-filter-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 26px;
    padding: 5px 24px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 500;
    color: #969696;
    cursor: pointer;
    background: transparent;
    border: none;
    font-family: 'Syne', sans-serif;
  }
  .gallery-filter-tab.active {
    background: #313131;
    color: #fff;
  }
  .gallery-filter-tab svg { width: 14px; height: 14px; }

  /* Gallery toolbar */
  .gallery-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .gallery-search {
    flex: 1;
    height: 32px;
    background: #1e1e1e;
    border: 1px solid #313131;
    border-radius: 4px;
    padding: 0 10px 0 32px;
    color: #fff;
    font-size: 11px;
    font-family: 'Syne', sans-serif;
    position: relative;
  }
  .gallery-search:focus { outline: none; border-color: #f95bad; }
  .gallery-search::placeholder { color: #969696; }
  .search-wrap {
    position: relative;
    flex: 1;
  }
  .search-wrap svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: #969696;
    pointer-events: none;
  }
  .chosen-count {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    white-space: nowrap;
  }
  .chosen-count span { color: #fff; font-weight: 700; }
  .btn-download-selected {
    height: 32px;
    padding: 0 16px;
    background: linear-gradient(90deg, #f95bad, #ff0084);
    border: none;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Syne', sans-serif;
    white-space: nowrap;
  }
  .btn-download-selected:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-download-selected svg { width: 14px; height: 14px; }
  .btn-delete-selected {
    height: 32px;
    padding: 0 16px;
    background: #1e1e1e;
    border: 1px solid #313131;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Syne', sans-serif;
    white-space: nowrap;
  }
  .btn-delete-selected:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-delete-selected svg { width: 14px; height: 14px; }

  /* Gallery tag chips */
  .gallery-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .gallery-tag {
    height: 26px;
    padding: 0 14px;
    border-radius: 4px;
    background: transparent;
    border: 1px solid #313131;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: 'Syne', sans-serif;
    white-space: nowrap;
  }
  .gallery-tag:hover { border-color: #f95bad; }
  .gallery-tag.active { border-color: #f95bad; color: #f95bad; }

  /* Gallery grid */
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .gallery-item {
    aspect-ratio: 3/4;
    background: #1e1e1e;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }
  .gallery-item.selected {
    border-color: #f95bad;
  }
  .gallery-item img, .gallery-item video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 6px;
  }
  .gallery-item .item-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 500;
    color: #fff;
    z-index: 2;
  }
  .gallery-item .item-badge svg { width: 12px; height: 12px; }
  .gallery-item .item-check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.4);
    background: rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    z-index: 2;
  }
  .gallery-item .item-check.checked {
    background: #f95bad;
    border-color: #f95bad;
  }
  .gallery-item .item-check svg { width: 12px; height: 12px; }
  .gallery-item .item-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px;
    background: linear-gradient(transparent, rgba(0,0,0,0.8));
    font-size: 11px;
    color: #969696;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 2;
    pointer-events: none;
  }
  .gallery-item:hover .item-overlay { opacity: 1; }
  .gallery-item .item-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .gallery-item:hover .item-actions { opacity: 1; }
  .item-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
  }
  .item-action-btn:hover { background: rgba(249,91,173,0.6); }
  .item-action-btn svg { width: 14px; height: 14px; }

  /* ── Lightbox ── */
  .gen-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.92);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
  }
  .gen-lightbox-media {
    max-width: 90vw;
    max-height: 90vh;
    border-radius: 8px;
    object-fit: contain;
    box-shadow: 0 0 60px rgba(0,0,0,0.8);
  }
  .gen-lightbox-close {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #fff;
  }
  .gen-lightbox-close:hover { background: rgba(255,255,255,0.2); }

  /* ── Responsive ── */
  @media (max-width: 1100px) {
    .generate-content { left: 0; width: 100%; padding: 0 20px; }
    .seg-tabs { width: 100%; }
    .chips-row { width: 100%; flex-wrap: wrap; }
  }
  @media (max-width: 768px) {
    .generate-content { left: 0; width: 100%; padding: 0 16px; top: 10px; }
    .page-label { left: 16px; }
    .seg-tabs { width: 100%; }
    .editor-section { grid-template-columns: repeat(2, 1fr); }
    .editor-card { height: 160px; }
    .chips-row { width: 100%; flex-wrap: wrap; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }
`;

const CHEVRON_DOWN = `<svg viewBox="0 0 9 5" fill="none"><path d="M0.5 0.5L4.5 4.5L8.5 0.5" stroke="#969696" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DEFAULT_IMAGE_MODELS: GenModel[] = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
];

const DEFAULT_VIDEO_MODELS: GenModel[] = [
  { id: "atlascloud/van-2.6/text-to-video", name: "Van 2.6 (NSFW)", description: "Text-to-video, uncensored", provider: "atlascloud" },
];

const PREMIUM_GEM = `<svg viewBox="0 0 15.86 13.51" fill="none"><path d="M12.09.5l.01-.5c.27.01.54.08.77.21.24.13.44.31.59.53l2.08 2.88c.22.31.33.68.31 1.06-.02.38-.16.74-.41 1.03L9.21 12.9c-.15.19-.34.34-.56.45-.22.11-.47.17-.72.17s-.5-.06-.72-.17c-.22-.11-.41-.26-.56-.45L.41 5.71c-.25-.29-.39-.65-.41-1.03-.02-.38.09-.75.31-1.06l2.08-2.88c.15-.22.36-.4.59-.53.24-.13.5-.2.77-.21h8.33V.5zM5.3 5.31l2.64 6.37 2.65-6.37H5.3zM1.39 5.31l5.4 6.22-2.58-6.22H1.39zm10.28 0l-2.59 6.21 5.39-6.21h-2.8zM3.7 1.01a.68.68 0 0 0-.48.3l-2.08 2.88c-.03.04-.05.07-.06.12h3.21l2.14-3.31H3.79zm1.77 3.3h4.95L8.3 1H7.6zm6.14 0h3.19c-.02-.04-.04-.08-.06-.12l-2.08-2.87a.72.72 0 0 0-.49-.3L12.08 1H9.48l2.13 3.31z" fill="url(#pg)"/><defs><linearGradient id="pg" x1="0" y1="6.76" x2="15.86" y2="6.76" gradientUnits="userSpaceOnUse"><stop stop-color="#F95BAD"/><stop offset="1" stop-color="#FF0084"/></linearGradient></defs></svg>`;

interface GenModel {
  id: string;
  name: string;
  description: string;
  provider?: string;
}

interface HistoryItem {
  jobId: string;
  type: string;
  output: { url?: string } | null;
  input: { prompt?: string; originalPrompt?: string; model?: string } | null;
  createdAt: string;
}

type VideoSubTab = "scratch" | "img2vid" | "continue";
type GalleryFilter = "all" | "image" | "video";

const GALLERY_TAGS = ["All", "Group Chats", "Teen", "Asian", "Anime", "Blond", "Strong", "Lonely", "Young", "Latina", "Romantic", "Athletic"];

export default function GenerationPage() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>("scratch");
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("realistic-vision-v51");
  const [selectedVideoModel, setSelectedVideoModel] = useState("wan2.1");
  const [imageModels, setImageModels] = useState<GenModel[]>(DEFAULT_IMAGE_MODELS);
  const [videoModels, setVideoModels] = useState<GenModel[]>(DEFAULT_VIDEO_MODELS);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [characterSelections, setCharacterSelections] = useState<CharacterSelections>(DEFAULT_CHARACTER_SELECTIONS);
  const [characterOptions, setCharacterOptions] = useState<CharacterOption[]>([]);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceSelections, setAppearanceSelections] = useState<AppearanceSelections>(DEFAULT_APPEARANCE_SELECTIONS);
  const [appearanceOptions, setAppearanceOptions] = useState<AppearanceOptionsResponse>({ OUTFITS: [], OUTFIT_DETAILS: [] });
  const [poseOpen, setPoseOpen] = useState(false);
  const [poseSelections, setPoseSelections] = useState<PoseSelections>(DEFAULT_POSE_SELECTIONS);
  const [poseOptions, setPoseOptions] = useState<PoseOptionsResponse>({ FACIAL_EXPRESSION: [], POSE: [] });
  const [sceneOpen, setSceneOpen] = useState(false);
  const [sceneSelections, setSceneSelections] = useState<SceneSelections>(DEFAULT_SCENE_SELECTIONS);
  const [sceneOptions, setSceneOptions] = useState<SceneOptionsResponse>({ LOCATION: [] });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSelections, setCameraSelections] = useState<CameraSelections>(DEFAULT_CAMERA_SELECTIONS);
  const [cameraOptions, setCameraOptions] = useState<CameraOptionsResponse>({ FRAMING: [], CAMERA_ANGLE: [] });
  const [promptDetailsOpen, setPromptDetailsOpen] = useState(false);
  const [promptDetailsSelections, setPromptDetailsSelections] = useState<PromptDetailsSelections>(DEFAULT_PROMPT_DETAILS_SELECTIONS);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [gallerySearch, setGallerySearch] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    getImageStyles().then(setImageModels).catch(() => {});
    getVideoStyles().then(setVideoModels).catch(() => {});
    getGenerationHistory().then(setHistory).catch(() => {});
    getCharacterOptions().then(setCharacterOptions).catch(() => {});
    getAppearanceOptions().then(setAppearanceOptions).catch(() => {});
    getPoseOptions().then(setPoseOptions).catch(() => {});
    getSceneOptions().then(setSceneOptions).catch(() => {});
    getCameraOptions().then(setCameraOptions).catch(() => {});
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const buildCompositePrompt = useCallback((userPrompt: string): string => {
    const prompts: string[] = [];

    if (userPrompt.trim()) prompts.push(userPrompt.trim());

    const findPrompt = (name: string, options: Array<{ name: string; prompt?: string | null }>) =>
      options.find((o) => o.name === name)?.prompt ?? null;

    // Character prompts
    if (characterSelections.humanRace) {
      const p = findPrompt(characterSelections.humanRace, characterOptions.filter((o) => o.category === "HUMAN_RACE"));
      if (p) prompts.push(p);
    }
    if (characterSelections.fantasyRace) {
      const p = findPrompt(characterSelections.fantasyRace, characterOptions.filter((o) => o.category === "FANTASY_RACE"));
      if (p) prompts.push(p);
    }
    if (characterSelections.hairStyle) {
      const p = findPrompt(characterSelections.hairStyle, characterOptions.filter((o) => o.category === "HAIR_STYLE"));
      if (p) prompts.push(p);
    }
    if (characterSelections.bodyType) {
      const p = findPrompt(characterSelections.bodyType, characterOptions.filter((o) => o.category === "BODY_TYPE"));
      if (p) prompts.push(p);
    }

    // Appearance prompts
    const allAppearanceOpts = [
      ...appearanceOptions.OUTFITS.flatMap((c) => c.options),
      ...appearanceOptions.OUTFIT_DETAILS.flatMap((c) => c.options),
    ];
    for (const name of [...appearanceSelections.outfits, ...appearanceSelections.outfitDetails]) {
      const p = findPrompt(name, allAppearanceOpts);
      if (p) prompts.push(p);
    }

    // Pose prompts
    const allPoseOpts = [
      ...poseOptions.FACIAL_EXPRESSION.flatMap((c) => c.options),
      ...poseOptions.POSE.flatMap((c) => c.options),
    ];
    for (const name of [...poseSelections.facialExpressions, ...poseSelections.poses]) {
      const p = findPrompt(name, allPoseOpts);
      if (p) prompts.push(p);
    }

    // Scene prompts
    const allSceneOpts = sceneOptions.LOCATION.flatMap((c) => c.options);
    for (const name of sceneSelections.locations) {
      const p = findPrompt(name, allSceneOpts);
      if (p) prompts.push(p);
    }

    // Camera prompts
    const allCameraOpts = [...cameraOptions.FRAMING, ...cameraOptions.CAMERA_ANGLE];
    for (const name of [...cameraSelections.framing, ...cameraSelections.cameraAngle]) {
      const p = findPrompt(name, allCameraOpts);
      if (p) prompts.push(p);
    }

    return prompts.join(", ");
  }, [
    characterSelections, characterOptions,
    appearanceSelections, appearanceOptions,
    poseSelections, poseOptions,
    sceneSelections, sceneOptions,
    cameraSelections, cameraOptions,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    setError(null);
    setGenerating(true);

    const isVideo = activeTab === "video";
    const model = isVideo ? selectedVideoModel : selectedModel;
    const compositePrompt = buildCompositePrompt(prompt.trim());

    try {
      let jobId: string;
      const negativePrompt = promptDetailsSelections.negativePromptTerms.length > 0
        ? promptDetailsSelections.negativePromptTerms.join(", ")
        : undefined;
      if (isVideo) {
        const videoProvider = videoModels.find((m) => m.id === selectedVideoModel)?.provider;
        const result = await createVideoJob({
          prompt: compositePrompt,
          negativePrompt,
          model,
          provider: videoProvider,
        });
        jobId = result.jobId;
      } else {
        const result = await createImageJob({
          prompt: compositePrompt,
          negativePrompt,
          model,
        });
        jobId = result.jobId;
      }

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          if (status.status === "completed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setGenerating(false);
            setHistory((prev) => [
              {
                jobId: status.jobId,
                type: isVideo ? "video" : "image",
                output: status.output,
                input: status.input || { prompt: prompt.trim(), model },
                createdAt: status.createdAt,
              },
              ...prev,
            ]);
            setPrompt("");
          } else if (status.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setGenerating(false);
            setError(status.error || `${isVideo ? "Video" : "Image"} generation failed`);
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setGenerating(false);
          setError("Failed to check job status");
        }
      }, isVideo ? 4000 : 2000);
    } catch (err: any) {
      setGenerating(false);
      setError(err.message || "Failed to start generation");
    }
  }, [prompt, selectedModel, selectedVideoModel, generating, activeTab, promptDetailsSelections, buildCompositePrompt, videoModels]);

  const toggleSelect = useCallback((jobId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedItems);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => deleteGenerationJob(id)));
      setHistory((prev) => prev.filter((h) => !selectedItems.has(h.jobId)));
      setSelectedItems(new Set());
    } catch {
      setError("Failed to delete some items");
    }
  }, [selectedItems]);

  const handleDownloadSelected = useCallback(async () => {
    const items = history.filter((h) => selectedItems.has(h.jobId) && h.output?.url);
    for (const item of items) {
      const url = item.output!.url!;
      const filename = `${item.type}-${item.jobId.slice(0, 8)}.${item.type === "video" ? "mp4" : "png"}`;
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        window.open(url, "_blank");
      }
    }
  }, [selectedItems, history]);

  const filteredHistory = history.filter((item) => {
    if (galleryFilter !== "all" && item.type !== galleryFilter) return false;
    if (gallerySearch && !item.input?.prompt?.toLowerCase().includes(gallerySearch.toLowerCase())) return false;
    return true;
  });

  if (loading) return null;

  const charTags: string[] = [];
  if (characterSelections.style) charTags.push(characterSelections.style);
  if (characterSelections.gender) charTags.push(characterSelections.gender);
  if (characterSelections.humanRace) charTags.push(characterSelections.humanRace);
  if (characterSelections.fantasyRace) charTags.push(characterSelections.fantasyRace);
  if (characterSelections.eyeColor) charTags.push(characterSelections.eyeColor);
  if (characterSelections.hairStyle) charTags.push(characterSelections.hairStyle);
  if (characterSelections.hairColor) charTags.push(characterSelections.hairColor);
  if (characterSelections.bodyType) charTags.push(characterSelections.bodyType);
  charTags.push(...characterSelections.eyeFeatures, ...characterSelections.faceFeatures);
  const visibleCharTags = charTags.slice(0, 5);
  const extraCharTags = charTags.length > 5 ? charTags.length - 5 : 0;
  const hasCharSelections = charTags.length > 0;

  const appearanceTags: string[] = [
    ...appearanceSelections.outfits,
    ...appearanceSelections.outfitDetails,
    ...appearanceSelections.condition,
  ];
  const visibleAppearanceTags = appearanceTags.slice(0, 5);
  const extraAppearanceTags = appearanceTags.length > 5 ? appearanceTags.length - 5 : 0;
  const hasAppearanceSelections = appearanceTags.length > 0;

  const poseTags: string[] = [
    ...poseSelections.facialExpressions,
    ...poseSelections.poses,
  ];
  const visiblePoseTags = poseTags.slice(0, 5);
  const extraPoseTags = poseTags.length > 5 ? poseTags.length - 5 : 0;
  const hasPoseSelections = poseTags.length > 0;

  const sceneTags: string[] = [
    ...sceneSelections.locations,
    ...sceneSelections.timeOfDay,
    ...sceneSelections.weather,
    ...sceneSelections.particles,
    ...sceneSelections.environmentEffects,
    ...(sceneSelections.props ? [sceneSelections.props] : []),
  ];
  const visibleSceneTags = sceneTags.slice(0, 5);
  const extraSceneTags = sceneTags.length > 5 ? sceneTags.length - 5 : 0;
  const hasSceneSelections = sceneTags.length > 0;

  const cameraTags: string[] = [
    ...cameraSelections.framing,
    ...cameraSelections.cameraAngle,
    ...cameraSelections.lens,
    ...cameraSelections.lighting,
  ];
  const visibleCameraTags = cameraTags.slice(0, 5);
  const extraCameraTags = cameraTags.length > 5 ? cameraTags.length - 5 : 0;
  const hasCameraSelections = cameraTags.length > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-content">
        <div className="page-label">Generate &nbsp;content</div>

        <div className="generate-content">
          {/* Title */}
          <h1 className="page-title">
            <span className="accent">Generate </span>Just Like You Want It
          </h1>

          {/* Segmented Tabs: Video / Image */}
          <div className="seg-tabs">
            <button
              className={`seg-tab ${activeTab === "video" ? "active" : ""}`}
              onClick={() => setActiveTab("video")}
            >
              <svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg>
              Video
            </button>
            <button
              className={`seg-tab ${activeTab === "image" ? "active" : ""}`}
              onClick={() => setActiveTab("image")}
            >
              <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M2 12l3.5-3.5L8 11l3-3 3 3v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5V12z" fill="currentColor" fillOpacity="0.3"/></svg>
              Image
            </button>
          </div>

          {/* Video sub-tabs (only shown when video tab active) */}
          {activeTab === "video" && (
            <div className="video-subtabs">
              <button
                className={`video-subtab ${videoSubTab === "scratch" ? "active" : ""}`}
                onClick={() => setVideoSubTab("scratch")}
              >
                Create from Scratch
              </button>
              <button
                className={`video-subtab disabled`}
                onClick={() => {}}
              >
                Convert Image to Video
              </button>
              <button
                className={`video-subtab disabled`}
                onClick={() => {}}
              >
                Continue Existing Video
              </button>
              <div className="video-subtabs-line" />
              <div
                className="video-subtabs-glow"
                style={{ left: "0%", width: "33.33%" }}
              />
            </div>
          )}

          {/* Separator */}
          <div className="sep" />

          {/* Sorting row */}
          <div className="sorting-row">
            {modelDropdownOpen && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 99 }}
                onClick={() => setModelDropdownOpen(false)}
              />
            )}
            <div style={{ position: "relative", flex: 1 }}>
              <div
                className="sort-btn"
                style={{ zIndex: modelDropdownOpen ? 101 : 1, position: "relative" }}
                onClick={() => setModelDropdownOpen((v) => !v)}
              >
                <div className="sort-text">
                  <span className="label">AI model:</span>
                  <span className="value">
                    {activeTab === "video"
                      ? (videoModels.find((m) => m.id === selectedVideoModel)?.name || "Wan 2.1")
                      : (imageModels.find((m) => m.id === selectedModel)?.name || "Realistic Vision")
                    }
                  </span>
                </div>
                <span dangerouslySetInnerHTML={{ __html: CHEVRON_DOWN }} />
              </div>
              {modelDropdownOpen && (
                <div className="model-dropdown">
                  {(activeTab === "video"
                    ? videoModels.filter((m) => !m.description?.includes("SFW only"))
                    : imageModels
                  ).map((m) => {
                    const isActive = activeTab === "video" ? selectedVideoModel === m.id : selectedModel === m.id;
                    return (
                      <div
                        key={m.id}
                        className={`model-dropdown-item${isActive ? " active" : ""}`}
                        onClick={() => {
                          if (activeTab === "video") setSelectedVideoModel(m.id);
                          else setSelectedModel(m.id);
                          setModelDropdownOpen(false);
                        }}
                      >
                        <span>{m.name}</span>
                        {m.description && <span className="model-dropdown-desc">{m.description}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="btn-random">
              <svg viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              Generate Random
            </div>
          </div>

          {/* Editor cards — 3×2 grid */}
          <div className="editor-section">
            {/* Character */}
            <div className={`editor-card${hasCharSelections ? " active" : ""}`} onClick={() => setCharacterOpen(true)}>
              <div className="card-content">
                <div className="editor-icon">
                  <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="#fff" strokeWidth="1.3"/><path d="M16 18c0-3.31-2.69-6-6-6s-6 2.69-6 6" stroke="#fff" strokeWidth="1.3"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name">Character</div>
                  <div className="sub required">required</div>
                </div>
                {hasCharSelections && (
                  <div className="editor-tags">
                    {visibleCharTags.map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {extraCharTags > 0 && <span className="editor-tag">+{extraCharTags}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Appearance */}
            <div className={`editor-card${hasAppearanceSelections ? " active" : ""}`} onClick={() => setAppearanceOpen(true)}>
              <div className="card-content">
                <div className="editor-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M7 3h6a2 2 0 0 1 2 2v1H5V5a2 2 0 0 1 2-2zM5 6h10l-1 11H6L5 6z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/><path d="M8 9v5M12 9v5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name">Appearance</div>
                  <div className="sub">optional</div>
                </div>
                {hasAppearanceSelections && (
                  <div className="editor-tags">
                    {visibleAppearanceTags.map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {extraAppearanceTags > 0 && <span className="editor-tag">+{extraAppearanceTags}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Pose */}
            <div className="editor-card" onClick={() => setPoseOpen(true)}>
              <div className="card-content">
                <div className="editor-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M10 3a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 5c-2.5 0-4 1.5-4 3.5V12l1.5 5h5L14 12V8.5C14 6.5 12.5 5 10 5z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 10l-2 1M14 10l2 1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name">Pose</div>
                  <div className="sub required">required</div>
                </div>
                {hasPoseSelections && (
                  <div className="editor-tags">
                    {visiblePoseTags.map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {extraPoseTags > 0 && <span className="editor-tag">+{extraPoseTags}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Scene */}
            <div className="editor-card" onClick={() => setSceneOpen(true)}>
              <div className="card-content">
                <div className="editor-icon">
                  <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M2 13l4-4 3 3 4-4 5 4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6.5" cy="8.5" r="1.5" fill="#fff"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name">Scene</div>
                  <div className="sub">optional</div>
                </div>
                {hasSceneSelections && (
                  <div className="editor-tags">
                    {visibleSceneTags.map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {extraSceneTags > 0 && <span className="editor-tag">+{extraSceneTags}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Camera */}
            <div className="editor-card" onClick={() => setCameraOpen(true)}>
              <div className="card-content">
                <div className="editor-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M2 7h2l2-3h8l2 3h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="10" cy="12" r="3" stroke="#fff" strokeWidth="1.2"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name">Camera</div>
                  <div className="sub">optional</div>
                </div>
                {hasCameraSelections && (
                  <div className="editor-tags">
                    {visibleCameraTags.map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {extraCameraTags > 0 && <span className="editor-tag">+{extraCameraTags}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Prompt Details (Premium) */}
            <div className="editor-card" onClick={() => setPromptDetailsOpen(true)}>
              <div className="card-content">
                <div className="editor-icon premium">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div className="editor-text">
                  <div className="name" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    Prompt Details
                    <span dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
                  </div>
                  <div className="sub premium-label">premium feature</div>
                </div>
                {promptDetailsSelections.negativePromptTerms.length > 0 && (
                  <div className="editor-tags">
                    {promptDetailsSelections.negativePromptTerms.slice(0, 3).map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {promptDetailsSelections.negativePromptTerms.length > 3 && (
                      <span className="editor-tag">+{promptDetailsSelections.negativePromptTerms.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="sep" />

          {/* Orientation */}
          <div className="chips-section">
            <div className="section-title">Orientation</div>
            <div className="chips-row">
              <div className="chip orient active">
                <span className="orient-icon"><span className="orient-rect r-4-5" /></span>
                Portraite (4:5)
              </div>
              <div className="chip orient">
                <span className="orient-icon"><span className="orient-rect r-5-4" /></span>
                Landscape (5:4)
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
              <div className="chip orient-sm">
                <span className="orient-icon"><span className="orient-rect r-9-16" /></span>
                9:16
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
              <div className="chip orient-sm">
                <span className="orient-icon"><span className="orient-rect r-16-9" /></span>
                16:9
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
              <div className="chip orient-sm">
                <span className="orient-icon"><span className="orient-rect r-1-1" /></span>
                1:1
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="sep" />

          {/* Number of items */}
          <div className="chips-section">
            <div className="section-title">Number of {activeTab === "video" ? "Videos" : "Images"}</div>
            <div className="chips-row">
              <div className="chip flex-1 active">1</div>
              <div className="chip flex-1">
                4
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
              <div className="chip flex-1">
                8
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
              <div className="chip flex-1">
                16
                <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
              </div>
            </div>
          </div>

          {/* Bottom buttons */}
          <div className="bottom-btns">
            <button className="btn-cancel" onClick={() => { setPromptOpen(false); setPrompt(""); setError(null); }}>Cancel</button>
            <button
              className="btn-generate"
              disabled={!prompt.trim() || generating}
              onClick={handleGenerate}
            >
              {generating
                ? "Generating..."
                : `Generate ${activeTab === "video" ? "Video" : "Image"}`
              }
            </button>
          </div>

          {/* Spinner */}
          {generating && (
            <div className="spinner-container">
              <div className="spinner" />
              <span>Creating your {activeTab === "video" ? "video" : "image"}...</span>
            </div>
          )}

          {/* Error */}
          {error && <div className="error-msg">{error}</div>}

          {/* ── Photo&Video Gallery ── */}
          <div className="sep" />
          <div className="gallery-section">
            <h2 className="gallery-title">
              Photo&Video <span className="accent">Gallery</span>
            </h2>

            {/* Gallery filter tabs */}
            <div className="gallery-filter-tabs">
              <button
                className={`gallery-filter-tab ${galleryFilter === "all" ? "active" : ""}`}
                onClick={() => setGalleryFilter("all")}
              >
                <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
                All
              </button>
              <button
                className={`gallery-filter-tab ${galleryFilter === "image" ? "active" : ""}`}
                onClick={() => setGalleryFilter("image")}
              >
                <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M2 12l3.5-3.5L8 11l3-3 3 3v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5V12z" fill="currentColor" fillOpacity="0.3"/></svg>
                Image
              </button>
              <button
                className={`gallery-filter-tab ${galleryFilter === "video" ? "active" : ""}`}
                onClick={() => setGalleryFilter("video")}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg>
                Video
              </button>
            </div>

            {/* Toolbar: search + chosen count + download + delete */}
            <div className="gallery-toolbar">
              <div className="search-wrap">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <input
                  className="gallery-search"
                  placeholder="Search"
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                />
              </div>
              <div className="chosen-count">
                Chosen content: <span>{selectedItems.size}</span>
              </div>
              <button
                className="btn-download-selected"
                disabled={selectedItems.size === 0}
                onClick={handleDownloadSelected}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Download
              </button>
              <button
                className="btn-delete-selected"
                disabled={selectedItems.size === 0}
                onClick={handleDeleteSelected}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10" stroke="currentColor" strokeWidth="1.2"/></svg>
                Delete
              </button>
            </div>

            {/* Tags row */}
            <div className="gallery-tags">
              {GALLERY_TAGS.map((tag) => (
                <button
                  key={tag}
                  className={`gallery-tag ${activeTag === tag ? "active" : ""}`}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Gallery grid */}
            {filteredHistory.length === 0 ? (
              <div className="empty-gallery">
                No generated content yet. Create your first one above!
              </div>
            ) : (
              <div className="gallery-grid">
                {filteredHistory.map((item) => {
                  const url = item.output?.url;
                  if (!url) return null;
                  const isVideo = item.type === "video";
                  const isSelected = selectedItems.has(item.jobId);
                  return (
                    <div
                      key={item.jobId}
                      className={`gallery-item ${isSelected ? "selected" : ""}`}
                      onClick={() => { if (url) setLightbox({ url, type: isVideo ? "video" : "image" }); }}
                    >
                      {/* Type badge */}
                      <div className="item-badge">
                        {isVideo ? (
                          <svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg>
                        ) : (
                          <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/></svg>
                        )}
                        {isVideo ? "Video" : "Image"}
                      </div>

                      {/* Checkbox */}
                      <div
                        className={`item-check ${isSelected ? "checked" : ""}`}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.jobId); }}
                      >
                        {isSelected && (
                          <svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                      </div>

                      {/* Content */}
                      {isVideo ? (
                        <video src={url} muted loop playsInline preload="metadata" onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }} />
                      ) : (
                        <img src={url} alt={item.input?.prompt || "Generated"} loading="lazy" />
                      )}

                      {/* Hover overlay with prompt */}
                      <div className="item-overlay">
                        {(item.input?.originalPrompt || item.input?.prompt)?.slice(0, 60)}
                        {((item.input?.originalPrompt || item.input?.prompt)?.length || 0) > 60 ? "..." : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="gen-lightbox" onClick={() => setLightbox(null)}>
          <div className="gen-lightbox-close" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
          {lightbox.type === "video" ? (
            <video
              className="gen-lightbox-media"
              src={lightbox.url}
              controls
              autoPlay
              loop
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              className="gen-lightbox-media"
              src={lightbox.url}
              alt="Generated"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      <CharacterModal
        open={characterOpen}
        onClose={() => setCharacterOpen(false)}
        selections={characterSelections}
        onSave={(s) => setCharacterSelections(s)}
        options={characterOptions}
      />

      <AppearanceModal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        selections={appearanceSelections}
        onSave={(s) => setAppearanceSelections(s)}
        options={appearanceOptions}
      />

      <PoseModal
        open={poseOpen}
        onClose={() => setPoseOpen(false)}
        selections={poseSelections}
        onSave={(s) => setPoseSelections(s)}
        options={poseOptions}
      />

      <SceneModal
        open={sceneOpen}
        onClose={() => setSceneOpen(false)}
        selections={sceneSelections}
        onSave={(s) => setSceneSelections(s)}
        options={sceneOptions}
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        selections={cameraSelections}
        onSave={(s) => setCameraSelections(s)}
        options={cameraOptions}
      />

      <PromptDetailsModal
        open={promptDetailsOpen}
        onClose={() => setPromptDetailsOpen(false)}
        prompt={prompt}
        selections={promptDetailsSelections}
        onSave={(s, p) => { setPromptDetailsSelections(s); setPrompt(p); }}
        characterSelections={characterSelections}
        appearanceSelections={appearanceSelections}
        poseSelections={poseSelections}
        sceneSelections={sceneSelections}
        cameraSelections={cameraSelections}
      />
    </>
  );
}
