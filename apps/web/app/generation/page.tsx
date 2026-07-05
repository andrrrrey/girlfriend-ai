"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useGeneration } from "../../context/generation";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/auth";
import { useT } from "../../context/language";
import { localizeOption, toEnglishTag } from "../../lib/optionLabel";
import { usePrefetchAllOptions } from "../../lib/use-prefetch-all-options";
import ScrollableTagsRow from "../components/ScrollableTagsRow";
import {
  createImageJob,
  createVideoJob,
  getImageStyles,
  getVideoStyles,
  getGenerationHistory,
  deleteGenerationJob,
  uploadMedia,
  resizedMediaUrl,
  characters as charactersApi,
} from "../../lib/api";
import { buildCharacterImagePrompt } from "../../lib/prompt";
import {
  getCachedCharacterOptions,
  getCachedAppearanceOptions,
  getCachedPoseOptions,
  getCachedSceneOptions,
  getCachedCameraOptions,
} from "../../lib/options-cache";
import type { CharacterOption, AppearanceOptionsResponse, PoseOptionsResponse, SceneOptionsResponse, CameraOptionsResponse, Character } from "../../lib/api";
import { DEFAULT_CHARACTER_SELECTIONS, type CharacterSelections, EYE_COLORS, EYE_FEATURES, FACE_FEATURES, HAIR_LENGTHS, HAIR_COLORS, GENDERS, HEIGHTS, BREAST_SIZES, BUTT_SIZES } from "../components/CharacterModal";
import { DEFAULT_APPEARANCE_SELECTIONS, type AppearanceSelections } from "../components/AppearanceModal";
import { DEFAULT_POSE_SELECTIONS, type PoseSelections } from "../components/PoseModal";
import { DEFAULT_SCENE_SELECTIONS, type SceneSelections } from "../components/SceneModal";
import { DEFAULT_CAMERA_SELECTIONS, type CameraSelections } from "../components/CameraModal";
import { DEFAULT_PROMPT_DETAILS_SELECTIONS, type PromptDetailsSelections } from "../components/PromptDetailsModal";
import PremiumPopup, { type PremiumLimitType } from "../components/PremiumPopup";
import { ApiError } from "../../lib/api";

const CharacterModal = dynamic(() => import("../components/CharacterModal"), { ssr: false });
const AppearanceModal = dynamic(() => import("../components/AppearanceModal"), { ssr: false });
const PoseModal = dynamic(() => import("../components/PoseModal"), { ssr: false });
const SceneModal = dynamic(() => import("../components/SceneModal"), { ssr: false });
const CameraModal = dynamic(() => import("../components/CameraModal"), { ssr: false });
const PromptDetailsModal = dynamic(() => import("../components/PromptDetailsModal"), { ssr: false });

const CSS = `
  /* ── Page content ── */
  .page-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 36px 0;
  }
  .generate-content {
    width: 696px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-bottom: 40px;
  }
  .page-label {
    width: 696px;
    max-width: 100%;
    font-size: 10px;
    font-weight: 500;
    color: #969696;
    text-transform: uppercase;
    line-height: 1.2;
    margin-bottom: 6px;
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
    width: 100%;
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
  .editor-char-avatar {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
    background: rgba(48, 39, 43, 0.4);
  }
  .editor-char-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }
  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 32px;
    padding: 7px 16px;
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
  .chip.orient { flex: 0 0 auto; }
  .chip.orient-sm { flex: 0 0 auto; }
  .chip.flex-1 { flex: 1; }
  .chip svg { width: 16px; height: 16px; flex-shrink: 0; }

  .orient-icon {
    width: 16px; height: 16px;
    flex-shrink: 0;
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

  .premium-gem { flex-shrink: 0; display: inline-flex; align-items: center; }
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
    .chips-row { flex-wrap: wrap; }
  }
  @media (max-width: 768px) {
    .page-content { padding: 10px 16px 0; }
    .editor-section { grid-template-columns: repeat(2, 1fr); }
    .editor-card { height: 160px; }
    .chips-row { flex-wrap: wrap; }
    .gallery-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  }
`;

const CHEVRON_DOWN = `<svg viewBox="0 0 9 5" fill="none"><path d="M0.5 0.5L4.5 4.5L8.5 0.5" stroke="#969696" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const DEFAULT_IMAGE_MODELS: GenModel[] = [
  { id: "realistic-vision-v51", name: "Realistic Vision", description: "Photorealistic images" },
  { id: "sdxl", name: "SDXL", description: "Stable Diffusion XL" },
  { id: "juggernaut-xl", name: "Juggernaut XL", description: "Photorealistic, detailed" },
  { id: "flux", name: "FLUX", description: "Next-gen quality" },
  { id: "alibaba/wan-2.6/text-to-image", name: "Wan 2.6 (NSFW)", description: "Uncensored image generation", provider: "atlascloud" },
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

/** Соотношения сторон для генерации. Бесплатно доступен только Portrait (4:5). */
const ASPECT_OPTIONS = [
  { value: "4:5", label: "Portraite (4:5)", rect: "r-4-5", cls: "orient", free: true },
  { value: "5:4", label: "Landscape (5:4)", rect: "r-5-4", cls: "orient", free: false },
  { value: "9:16", label: "9:16", rect: "r-9-16", cls: "orient-sm", free: false },
  { value: "16:9", label: "16:9", rect: "r-16-9", cls: "orient-sm", free: false },
  { value: "1:1", label: "1:1", rect: "r-1-1", cls: "orient-sm", free: false },
] as const;

/** Количество элементов за генерацию. Бесплатно доступно только 1. */
const COUNT_OPTIONS = [
  { value: 1, free: true },
  { value: 4, free: false },
  { value: 8, free: false },
  { value: 16, free: false },
] as const;

interface HistoryItem {
  jobId: string;
  type: string;
  output: { url?: string } | null;
  input: { prompt?: string; originalPrompt?: string; model?: string } | null;
  createdAt: string;
}

type VideoSubTab = "scratch" | "img2vid" | "continue";
type GalleryFilter = "all" | "image" | "video";

const GALLERY_TAG_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "shall", "can", "need",
  "not", "no", "nor", "so", "if", "then", "than", "too", "very",
  "just", "about", "above", "after", "again", "all", "also", "any",
  "because", "before", "between", "both", "each", "few", "her", "here",
  "him", "his", "how", "its", "let", "more", "most", "my", "new",
  "now", "old", "only", "other", "our", "out", "own", "same", "she",
  "some", "still", "such", "tell", "that", "their", "them", "there",
  "these", "they", "this", "those", "through", "under", "until", "up",
  "upon", "what", "when", "where", "which", "while", "who", "whom",
  "why", "you", "your", "into", "over", "down", "off", "once",
  "during", "without", "within", "along", "among", "around",
  "style", "quality", "high", "resolution", "detailed", "ultra",
  "photo", "image", "video", "prompt", "generate", "creating",
]);

function GenerationPageInner() {
  const { user, loading } = useAuth();
  const { t: tr, lang } = useT();
  const { activeJobs, canGenerate, startGeneration } = useGeneration();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Префетчим thumb-картинки опций только на этой странице (раньше это делалось
  // глобально после логина и забивало сеть на всех страницах).
  usePrefetchAllOptions(!!user);
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
  // Готовый персонаж, выбранный в табе «Choose Character» (взаимоисключающе с custom).
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
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
  const [error, setError] = useState<string | null>(null);
  const [premiumPopup, setPremiumPopup] = useState<{ limitType: PremiumLimitType; limit: number; used: number } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>("all");
  const [gallerySearch, setGallerySearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);
  const [aspectRatio, setAspectRatio] = useState("4:5");
  const [count, setCount] = useState(1);
  const [initMediaKey, setInitMediaKey] = useState<string | null>(null);
  const [initMediaUrl, setInitMediaUrl] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Подписка пользователя: premium-опции (≠ "4:5", количество > 1, режимы видео из медиа) доступны только платным. */
  const isPremium = !!user && user.subscription !== "free";

  /** Открывает попап премиума при попытке использовать платную опцию на free-тарифе. */
  const showPremiumGate = useCallback(() => {
    setPremiumPopup({
      limitType: activeTab === "video" ? "videoGenerations" : "imageGenerations",
      limit: 0,
      used: 0,
    });
  }, [activeTab]);

  /** Сбрасывает выбранное исходное медиа (при смене вкладки/режима). */
  const resetInitMedia = useCallback(() => {
    setInitMediaKey(null);
    setInitMediaUrl(null);
  }, []);

  /** Извлекает S3-ключ из proxied-URL вида /api-proxy/media/stream?key=... */
  const extractMediaKey = useCallback((url?: string | null): string | null => {
    if (!url) return null;
    const q = url.split("?")[1];
    if (!q) return null;
    return new URLSearchParams(q).get("key");
  }, []);

  /** Загружает файл с устройства в S3 и выбирает его как исходное медиа. */
  const handleMediaFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingMedia(true);
    setError(null);
    try {
      const { key } = await uploadMedia(file);
      setInitMediaKey(key);
      setInitMediaUrl(URL.createObjectURL(file));
    } catch (err: any) {
      setError(err?.message || tr("gp.errUpload"));
    } finally {
      setUploadingMedia(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    getImageStyles().then((models) => {
      setImageModels(models);
      if (models.length > 0 && !models.some((m) => m.id === selectedModel)) {
        setSelectedModel(models[0].id);
      }
    }).catch(() => {});
    getVideoStyles().then((models) => {
      setVideoModels(models);
      if (models.length > 0 && !models.some((m) => m.id === selectedVideoModel)) {
        setSelectedVideoModel(models[0].id);
      }
    }).catch(() => {});
    getGenerationHistory().then(setHistory).catch(() => {});
    getCachedCharacterOptions().then(setCharacterOptions).catch(() => {});
    getCachedAppearanceOptions().then(setAppearanceOptions).catch(() => {});
    getCachedPoseOptions().then(setPoseOptions).catch(() => {});
    getCachedSceneOptions().then(setSceneOptions).catch(() => {});
    getCachedCameraOptions().then(setCameraOptions).catch(() => {});
  }, [user]);

  const prevActiveCountRef = useRef(activeJobs.length);
  useEffect(() => {
    if (prevActiveCountRef.current > 0 && activeJobs.length < prevActiveCountRef.current) {
      getGenerationHistory().then(setHistory).catch(() => {});
    }
    prevActiveCountRef.current = activeJobs.length;
  }, [activeJobs.length]);

  // Список публичных персонажей для таба «Choose Character».
  useEffect(() => {
    if (!user) return;
    charactersApi.listPublic({ limit: 100 })
      .then((res) => setAllCharacters(res.items))
      .catch(() => {});
  }, [user]);

  // Автоподстановка персонажа при переходе с ?characterId= (кнопки Generate).
  useEffect(() => {
    const id = searchParams.get("characterId");
    if (!id) return;
    const found = allCharacters.find((c) => c.id === id);
    if (found) {
      setSelectedCharacter(found);
      setCharacterSelections(DEFAULT_CHARACTER_SELECTIONS);
      return;
    }
    // Персонажа нет в первых 100 — дозагружаем по id.
    charactersApi.getOne(id)
      .then((c) => { setSelectedCharacter(c); setCharacterSelections(DEFAULT_CHARACTER_SELECTIONS); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allCharacters]);

  const hasAnySelection = useMemo(() => {
    if (selectedCharacter) return true;
    if (characterSelections.humanRace || characterSelections.fantasyRace ||
        characterSelections.hairStyle || characterSelections.bodyType ||
        characterSelections.style || characterSelections.gender ||
        characterSelections.eyeColor || characterSelections.hairColor ||
        characterSelections.hairLength || characterSelections.breastSize ||
        characterSelections.buttSize || characterSelections.height ||
        characterSelections.eyeFeatures.length > 0 || characterSelections.faceFeatures.length > 0) return true;
    if (appearanceSelections.outfits.length > 0 || appearanceSelections.outfitDetails.length > 0) return true;
    if (poseSelections.facialExpressions.length > 0 || poseSelections.poses.length > 0) return true;
    if (sceneSelections.locations.length > 0) return true;
    if (cameraSelections.framing.length > 0 || cameraSelections.cameraAngle.length > 0) return true;
    return false;
  }, [selectedCharacter, characterSelections, appearanceSelections, poseSelections, sceneSelections, cameraSelections]);

  const buildCompositePrompt = useCallback((userPrompt: string, model: string, isVideo: boolean): string => {
    const findPrompt = (name: string, options: Array<{ name: string; prompt?: string | null }>) =>
      options.find((o) => o.name === name)?.prompt ?? null;

    const isNsfwModel = model.toLowerCase().includes("nsfw") ||
      model.includes("wan-2.6") || model.includes("van-2.6");

    const LENS_PROMPTS: Record<string, string> = {
      "Ultra-wide 14mm": "14mm ultra-wide lens, heavy barrel distortion",
      "Wide 24mm": "24mm wide angle lens",
      "Standard 35mm": "35mm lens, street photography natural perspective",
      "Normal 50mm": "50mm lens, natural human eye perspective",
      "Portrait 85mm": "85mm portrait lens, soft background bokeh, flattering compression",
      "Telephoto 135mm": "135mm telephoto lens, compressed perspective, creamy bokeh",
      "Fisheye": "fisheye lens, 180-degree spherical distortion",
    };

    const LIGHTING_PROMPTS: Record<string, string> = {
      "Natural Light": "natural lighting",
      "Golden Hour": "golden hour warm light",
      "Soft Diffused": "soft diffused lighting, minimal shadows",
      "Hard Directional": "hard directional light, sharp shadows",
      "Studio Softbox": "studio softbox lighting, even professional light",
      "Backlight": "backlight, silhouette, halo effect",
      "High Key": "high-key lighting, bright airy minimal shadows",
      "Neon": "neon lighting, pink blue green neon colors",
      "Candlelight": "candlelight, warm flickering glow",
      "Moonlight": "moonlight, cold silver light from moon",
      "Spotlight": "spotlight, single bright directed beam",
      "Window Light": "window light, soft directional natural",
      "Ultraviolet": "UV black light, neon glowing colors fluorescent",
    };

    const TIME_PROMPTS: Record<string, string> = {
      "Sunrise": "dawn lighting, soft pink orange and lavender gradient on horizon, sun just beginning to rise",
      "Morning": "morning light, warm soft golden-white rays from a low angle, clean fresh atmosphere",
      "Daylight": "moderate afternoon daylight, well-balanced natural illumination",
      "Strong Sun": "high noon midday lighting, sun directly overhead, bright intense illumination, harsh shadows",
      "Golden Hour": "evening golden hour, rich deep warm golden-orange light streaming horizontally",
      "Sunset": "dramatic sunset sky, vivid bands of intense orange red pink and purple coloring clouds",
      "Night": "full nighttime darkness, scene illuminated by artificial light sources, deep shadows",
      "Moonlight": "moonlit night, bright full moon casting silver-blue cool-toned moonlight, ethereal luminosity",
    };

    const WEATHER_PROMPTS: Record<string, string> = {
      "Clear sky": "perfectly clear cloudless sky, crisp defined shadows",
      "Overcast": "completely overcast sky, soft even diffused light",
      "Light rain": "light gentle rain, fine small raindrops, wet sheen on surfaces",
      "Heavy rain": "heavy torrential downpour, thick sheets of rain, reduced visibility",
      "Thunderstorm": "dramatic thunderstorm, dark storm clouds, lightning bolts, heavy rain",
      "Light snow": "gentle light snowfall, delicate white snowflakes drifting slowly, peaceful winter atmosphere",
      "Blizzard": "intense raging blizzard, dense snow driven by powerful winds, severely reduced visibility",
      "Fog": "thick atmospheric fog reducing visibility, objects fading into white-grey mist",
      "Strong wind": "strong powerful wind, hair streaming and whipping dramatically, clothing billowing",
      "Rainbow": "vivid colorful rainbow arcing across sky, full spectrum of colors",
      "Aurora / Northern lights": "spectacular aurora borealis dancing across dark sky in curtains of vivid green with purple and pink edges",
      "Heat": "scorching intense heat, visible heat haze distortion shimmering above surfaces",
      "Frost": "bitter cold frost, intricate ice crystal patterns, white frost coating surfaces, visible breath",
    };

    const PARTICLE_PROMPTS: Record<string, string> = {
      "Sakura petals": "delicate pink and white cherry blossom petals floating and drifting through air",
      "Falling leaves": "colorful autumn leaves gently falling and tumbling through the air",
      "Fireflies": "tiny warm glowing fireflies floating in the air, bioluminescent dots",
      "Flying sparks": "glowing orange embers and sparks floating upward in the air",
      "Magic sparkles": "magical glowing sparkle particles floating in the air, shimmering light motes",
      "Dust in light": "visible dust particles floating in beams of light, atmospheric haze",
      "Soap bubbles": "iridescent soap bubbles floating weightlessly in the air, rainbow reflections",
      "Ash": "grey ash particles drifting slowly through the air",
      "Confetti": "colorful confetti pieces falling and fluttering through the air",
      "Falling feathers": "soft white feathers gently drifting downward through the air",
    };

    const findCharPrompt = (name: string, category: string) =>
      findPrompt(name, characterOptions.filter((o) => o.category === category));

    // --- 1. Quality / Style prefix ---
    const qualityParts: string[] = ["masterpiece", "best quality", "highres"];
    if (isNsfwModel) {
      qualityParts.push("nsfw", "explicit");
    }
    if (characterSelections.style) {
      const p = findCharPrompt(characterSelections.style, "STYLE");
      if (p) qualityParts.push(p);
    }

    // --- 2. Subject: gender + age + ethnicity ---
    const subjectParts: string[] = [];
    if (characterSelections.gender) {
      const genderMap: Record<string, string> = {
        Female: "woman", Male: "man", Femboy: "femboy, feminine male", "Non-binary": "androgynous person",
      };
      subjectParts.push(genderMap[characterSelections.gender] || toEnglishTag(characterSelections.gender));
    }
    if (characterSelections.age) {
      subjectParts.push(`${characterSelections.age}-year-old`);
    }
    if (characterSelections.humanRace) {
      const p = findCharPrompt(characterSelections.humanRace, "HUMAN_RACE");
      if (p) subjectParts.push(p);
    }
    if (characterSelections.fantasyRace) {
      const p = findCharPrompt(characterSelections.fantasyRace, "FANTASY_RACE");
      if (p) subjectParts.push(p);
    }

    // --- 3. Face: eye color + eye features + face features ---
    const faceParts: string[] = [];
    if (characterSelections.eyeColor) {
      faceParts.push(`${toEnglishTag(characterSelections.eyeColor)} eyes`);
    }
    for (const f of characterSelections.eyeFeatures) {
      if (f !== "Normal") faceParts.push(toEnglishTag(f));
    }
    for (const f of characterSelections.faceFeatures) {
      if (f !== "None") faceParts.push(toEnglishTag(f));
    }

    // --- 4. Hair: style + color + length ---
    const hairParts: string[] = [];
    if (characterSelections.hairColor) {
      hairParts.push(`${toEnglishTag(characterSelections.hairColor)} hair`);
    }
    if (characterSelections.hairLength) {
      hairParts.push(`${toEnglishTag(characterSelections.hairLength)} hair`);
    }
    if (characterSelections.hairStyle) {
      const p = findCharPrompt(characterSelections.hairStyle, "HAIR_STYLE");
      if (p) hairParts.push(p);
    }

    // --- 5. Body: body type + breast + butt + height ---
    const bodyParts: string[] = [];
    if (characterSelections.bodyType) {
      const p = findCharPrompt(characterSelections.bodyType, "BODY_TYPE");
      if (p) bodyParts.push(p);
    }
    if (characterSelections.breastSize) {
      const p = findCharPrompt(characterSelections.breastSize, "BREAST_SIZE");
      bodyParts.push(p || `${toEnglishTag(characterSelections.breastSize)} breasts`);
    }
    if (characterSelections.buttSize) {
      const p = findCharPrompt(characterSelections.buttSize, "BUTT_SIZE");
      bodyParts.push(p || `${toEnglishTag(characterSelections.buttSize)} butt`);
    }
    if (characterSelections.height) {
      const heightMap: Record<string, string> = {
        Short: "short height", "Below Average": "below average height", Average: "average height",
        Tall: "tall height", "Very Tall": "very tall height",
      };
      bodyParts.push(heightMap[characterSelections.height] || toEnglishTag(characterSelections.height));
    }

    // --- 6. Expression ---
    const expressionParts: string[] = [];
    const allExpressionOpts = poseOptions.FACIAL_EXPRESSION.flatMap((c) => c.options);
    for (const name of poseSelections.facialExpressions) {
      const p = findPrompt(name, allExpressionOpts);
      if (p) expressionParts.push(p);
    }

    // --- 7. Clothing (outfits + outfit details + condition) ---
    const clothingParts: string[] = [];
    const allAppearanceOpts = [
      ...appearanceOptions.OUTFITS.flatMap((c) => c.options),
      ...appearanceOptions.OUTFIT_DETAILS.flatMap((c) => c.options),
    ];
    for (const name of [...appearanceSelections.outfits, ...appearanceSelections.outfitDetails]) {
      const p = findPrompt(name, allAppearanceOpts);
      if (p) clothingParts.push(p);
    }
    for (const c of appearanceSelections.condition) {
      clothingParts.push(toEnglishTag(c));
    }

    // --- 8. Pose ---
    const poseParts: string[] = [];
    const allPoseOpts = poseOptions.POSE.flatMap((c) => c.options);
    for (const name of poseSelections.poses) {
      const p = findPrompt(name, allPoseOpts);
      if (p) poseParts.push(p);
    }

    // --- 9. Scene: location + time of day + weather + particles + effects + props ---
    const sceneParts: string[] = [];
    const allSceneOpts = sceneOptions.LOCATION.flatMap((c) => c.options);
    for (const name of sceneSelections.locations) {
      const p = findPrompt(name, allSceneOpts);
      if (p) sceneParts.push(p);
    }
    for (const t of sceneSelections.timeOfDay) sceneParts.push(TIME_PROMPTS[t] || toEnglishTag(t));
    for (const w of sceneSelections.weather) sceneParts.push(WEATHER_PROMPTS[w] || toEnglishTag(w));
    for (const p of sceneSelections.particles) sceneParts.push(PARTICLE_PROMPTS[p] || toEnglishTag(p));
    for (const e of sceneSelections.environmentEffects) sceneParts.push(toEnglishTag(e));
    if (sceneSelections.props?.trim()) sceneParts.push(sceneSelections.props.trim());

    // --- 10. Camera: framing + angle + lens + lighting ---
    const cameraParts: string[] = [];
    for (const name of cameraSelections.framing) {
      const p = findPrompt(name, cameraOptions.FRAMING);
      if (p) cameraParts.push(p);
    }
    for (const name of cameraSelections.cameraAngle) {
      const p = findPrompt(name, cameraOptions.CAMERA_ANGLE);
      if (p) cameraParts.push(p);
    }
    for (const l of cameraSelections.lens) cameraParts.push(LENS_PROMPTS[l] || toEnglishTag(l));
    for (const l of cameraSelections.lighting) cameraParts.push(LIGHTING_PROMPTS[l] || toEnglishTag(l));

    // --- Assemble in structured order ---
    const sections = [
      qualityParts.join(", "),
      subjectParts.join(", "),
      faceParts.join(", "),
      hairParts.join(", "),
      bodyParts.join(", "),
      expressionParts.join(", "),
      clothingParts.join(", "),
      poseParts.join(", "),
      sceneParts.join(", "),
      cameraParts.join(", "),
      userPrompt.trim(),
    ].filter(Boolean);

    return sections.join(", ");
  }, [
    characterSelections, characterOptions,
    appearanceSelections, appearanceOptions,
    poseSelections, poseOptions,
    sceneSelections, sceneOptions,
    cameraSelections, cameraOptions,
  ]);

  const handleRandomize = useCallback(() => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const pickN = <T,>(arr: T[], min: number, max: number): T[] => {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    };
    const byCategory = (cat: string) => characterOptions.filter((o) => o.category === cat);
    const nameOf = (opts: CharacterOption[]) => opts.length ? pick(opts).name : undefined;

    const styles = byCategory("STYLE");
    const races = byCategory("HUMAN_RACE");
    const hairStyles = byCategory("HAIR_STYLE");
    const bodyTypes = byCategory("BODY_TYPE");

    setCharacterSelections({
      style: nameOf(styles),
      age: 18 + Math.floor(Math.random() * 33),
      gender: pick(GENDERS),
      humanRace: nameOf(races),
      eyeColor: pick(EYE_COLORS).name,
      eyeFeatures: pickN(EYE_FEATURES, 0, 2),
      faceFeatures: pickN(FACE_FEATURES.filter((f) => f !== "None"), 0, 3),
      hairStyle: nameOf(hairStyles),
      hairLength: pick(HAIR_LENGTHS),
      hairColor: pick(HAIR_COLORS).name,
      bodyType: nameOf(bodyTypes),
      breastSize: pick(BREAST_SIZES),
      buttSize: pick(BUTT_SIZES),
      height: pick(HEIGHTS),
    });

    const allExpressions = poseOptions.FACIAL_EXPRESSION.flatMap((c) => c.options);
    const allPoses = poseOptions.POSE.flatMap((c) => c.options);
    setPoseSelections({
      facialExpressions: allExpressions.length ? pickN(allExpressions, 1, 2).map((o) => o.name) : [],
      poses: allPoses.length ? pickN(allPoses, 1, 2).map((o) => o.name) : [],
    });

    const allOutfits = appearanceOptions.OUTFITS.flatMap((c) => c.options);
    setAppearanceSelections({
      outfits: allOutfits.length ? pickN(allOutfits, 1, 2).map((o) => o.name) : [],
      outfitDetails: [],
      condition: [],
    });

    const allLocations = sceneOptions.LOCATION.flatMap((c) => c.options);
    setSceneSelections({
      locations: allLocations.length ? [pick(allLocations).name] : [],
      timeOfDay: [],
      weather: [],
      particles: [],
      environmentEffects: [],
      props: "",
    });

    setCameraSelections({
      framing: cameraOptions.FRAMING.length ? [pick(cameraOptions.FRAMING).name] : [],
      cameraAngle: cameraOptions.CAMERA_ANGLE.length ? [pick(cameraOptions.CAMERA_ANGLE).name] : [],
      lens: [],
      lighting: [],
    });
  }, [characterOptions, poseOptions, appearanceOptions, sceneOptions, cameraOptions]);

  const handleGenerate = useCallback(async () => {
    if ((!prompt.trim() && !hasAnySelection) || !canGenerate || submitting) return;
    setSubmitting(true);
    setError(null);

    const isVideo = activeTab === "video";
    const model = isVideo ? selectedVideoModel : selectedModel;
    const compositePrompt = buildCompositePrompt(prompt.trim(), model, isVideo);

    // Режимы из медиа требуют исходного изображения/видео.
    const mode = isVideo ? videoSubTab : "scratch";
    if (isVideo && (mode === "img2vid" || mode === "continue") && !initMediaKey) {
      setError(mode === "img2vid" ? tr("gp.errSelectImage") : tr("gp.errSelectVideo"));
      setSubmitting(false);
      return;
    }

    try {
      const defaultNeg = "bad anatomy, deformed, disfigured, mutation, extra limbs, extra fingers, bad hands, bad face, ugly, low quality, worst quality, blurry, watermark, text, logo, signature, cropped, out of frame";
      const negativePrompt = promptDetailsSelections.negativePromptTerms.length > 0
        ? promptDetailsSelections.negativePromptTerms.join(", ") + ", " + defaultNeg
        : defaultNeg;

      let jobIds: string[];
      if (isVideo) {
        const result = await createVideoJob({
          prompt: compositePrompt,
          negativePrompt,
          // В режимах из медиа модель определяется на бэкенде по режиму.
          model: mode === "scratch" ? model : undefined,
          aspectRatio,
          mode,
          initImageKey: mode === "img2vid" ? initMediaKey ?? undefined : undefined,
          initVideoKey: mode === "continue" ? initMediaKey ?? undefined : undefined,
          count,
        });
        jobIds = result.jobIds;
      } else if (selectedCharacter) {
        // Готовый персонаж: img2img по его фото (как в чате). Промпт = атрибуты
        // персонажа + выбранные Appearance/Pose/Scene/Camera + кастомный текст.
        // compositePrompt уже содержит quality-префикс, поэтому в хелпер его не
        // добавляем (includeQuality=false).
        const personality = (selectedCharacter.personality || {}) as Record<string, unknown>;
        const personalityPart = buildCharacterImagePrompt(personality, undefined, false);
        const finalPrompt = personalityPart ? `${personalityPart}, ${compositePrompt}` : compositePrompt;
        const charStyle = personality.generationStyle as string | undefined;
        const result = await createImageJob({
          prompt: finalPrompt,
          negativePrompt,
          ...(selectedCharacter.avatarUrl ? { initImageUrl: selectedCharacter.avatarUrl } : {}),
          ...(charStyle
            ? { provider: "civitai", generationStyle: charStyle }
            : { model: "alibaba/wan-2.6/text-to-image", provider: "atlascloud" }),
          aspectRatio,
          count,
        });
        jobIds = result.jobIds;
      } else {
        const imageProvider = imageModels.find((m) => m.id === selectedModel)?.provider;
        const selectedStyleOption = characterOptions.find(
          (o) => o.category === "STYLE" && o.name === characterSelections.style
        );
        const result = await createImageJob({
          prompt: compositePrompt,
          negativePrompt,
          model,
          provider: imageProvider,
          generationStyle: imageProvider === "civitai" ? selectedStyleOption?.generationStyle || undefined : undefined,
          aspectRatio,
          count,
        });
        jobIds = result.jobIds;
      }

      for (const jobId of jobIds) {
        startGeneration(jobId, isVideo ? "video" : "image", prompt.trim(), model);
      }
      setPrompt("");
    } catch (err: any) {
      if (err instanceof ApiError && err.body?.error === "FREE_LIMIT_REACHED") {
        setPremiumPopup({
          limitType: err.body.limitType as PremiumLimitType,
          limit: err.body.limit,
          used: err.body.used,
        });
      } else {
        setError(err.message || tr("gp.errStartGen"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [prompt, selectedModel, selectedVideoModel, canGenerate, submitting, activeTab, videoSubTab, aspectRatio, count, initMediaKey, promptDetailsSelections, buildCompositePrompt, imageModels, characterOptions, characterSelections.style, hasAnySelection, startGeneration, selectedCharacter]);

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
      setError(tr("gp.errDelete"));
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

  const galleryTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const item of history) {
      const prompt = item.input?.prompt;
      if (!prompt) continue;
      const words = prompt.toLowerCase().split(/[,\s]+/).filter(
        (w) => w.length > 2 && w.length < 20 && /^[a-z]+$/.test(w) && !GALLERY_TAG_STOP_WORDS.has(w),
      );
      for (const word of words) {
        freq.set(word, (freq.get(word) ?? 0) + 1);
      }
    }
    return Array.from(freq.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag]) => tag);
  }, [history]);

  const filteredHistory = history.filter((item) => {
    if (galleryFilter !== "all" && item.type !== galleryFilter) return false;
    if (gallerySearch && !item.input?.prompt?.toLowerCase().includes(gallerySearch.toLowerCase())) return false;
    if (selectedTags.length > 0) {
      const prompt = (item.input?.prompt || "").toLowerCase();
      if (!selectedTags.some((tag) => prompt.includes(tag.toLowerCase()))) return false;
    }
    return true;
  });

  if (loading) return null;
  if (!user) { router.push("/login"); return null; }

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
  const hasCharSelections = charTags.length > 0 || !!selectedCharacter;

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

  /** В режиме «Convert Image to Video» показываем упрощённый редактор: Image File + Action + Custom Prompt. */
  const isImg2Vid = activeTab === "video" && videoSubTab === "img2vid";
  const actionTags = poseSelections.poses;
  const visibleActionTags = actionTags.slice(0, 5);
  const extraActionTags = actionTags.length > 5 ? actionTags.length - 5 : 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="page-content">
        <div className="page-label">{tr("gp.pageLabel")}</div>

        <div className="generate-content">
          {/* Title */}
          <h1 className="page-title">
            <span className="accent">{tr("gp.titleAccent")}</span>{tr("gp.titleRest")}
          </h1>

          {/* Segmented Tabs: Video / Image */}
          <div className="seg-tabs">
            <button
              className={`seg-tab ${activeTab === "video" ? "active" : ""}`}
              onClick={() => setActiveTab("video")}
            >
              <svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg>
              {tr("media.video")}
            </button>
            <button
              className={`seg-tab ${activeTab === "image" ? "active" : ""}`}
              onClick={() => { setActiveTab("image"); resetInitMedia(); }}
            >
              <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M2 12l3.5-3.5L8 11l3-3 3 3v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5V12z" fill="currentColor" fillOpacity="0.3"/></svg>
              {tr("media.image")}
            </button>
          </div>

          {/* Video sub-tabs (only shown when video tab active) */}
          {activeTab === "video" && (
            <div className="video-subtabs">
              <button
                className={`video-subtab ${videoSubTab === "scratch" ? "active" : ""}`}
                onClick={() => { setVideoSubTab("scratch"); resetInitMedia(); }}
              >
                {tr("gp.createScratch")}
              </button>
              <button
                className={`video-subtab ${videoSubTab === "img2vid" ? "active" : ""}`}
                onClick={() => {
                  if (!isPremium) { showPremiumGate(); return; }
                  setVideoSubTab("img2vid"); resetInitMedia();
                }}
              >
                {tr("gp.convertImg2Vid")}
              </button>
              <button
                className="video-subtab disabled"
                title={tr("gp.comingSoon")}
                onClick={() => setError(tr("gp.continueComingSoon"))}
              >
                {tr("gp.continueExisting")}
              </button>
              <div className="video-subtabs-line" />
              <div
                className="video-subtabs-glow"
                style={{ left: videoSubTab === "img2vid" ? "33.33%" : videoSubTab === "continue" ? "66.66%" : "0%", width: "33.33%" }}
              />
            </div>
          )}

          {/* Media picker for Continue Existing Video (source video) */}
          {activeTab === "video" && videoSubTab === "continue" && (
            <div className="chips-section">
              <div className="section-title">{tr("gp.sourceVideo")}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: "none" }}
                onChange={handleMediaFileChange}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia}
                  style={{
                    width: 72, height: 72, borderRadius: 8, border: "1px dashed #4a4a4a",
                    background: "#1e1e1e", color: "#c1f0aa", fontSize: 10, cursor: "pointer",
                    fontFamily: "'Syne', sans-serif", padding: 4,
                  }}
                >
                  {uploadingMedia ? tr("gp.uploading") : tr("gp.upload")}
                </button>
                {history
                  .filter((h) => h.type === "video" && h.output?.url)
                  .map((h) => {
                    const key = extractMediaKey(h.output?.url);
                    const selected = !!key && key === initMediaKey;
                    return (
                      <div
                        key={h.jobId}
                        onClick={() => { if (key) { setInitMediaKey(key); setInitMediaUrl(h.output?.url ?? null); } }}
                        style={{
                          width: 72, height: 72, borderRadius: 8, overflow: "hidden", cursor: "pointer",
                          border: selected ? "2px solid #c1f0aa" : "2px solid transparent",
                        }}
                      >
                        <video src={h.output?.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    );
                  })}
              </div>
              {initMediaUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                  <video src={initMediaUrl} controls muted style={{ width: 96, height: 96, borderRadius: 8, objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={resetInitMedia}
                    style={{ background: "transparent", border: "1px solid #4a4a4a", borderRadius: 6, color: "#969696", fontSize: 10, padding: "6px 12px", cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
                  >
                    {tr("profile.remove")}
                  </button>
                </div>
              )}
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
                  <span className="label">{tr("gp.aiModel")}</span>
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
            <div className="btn-random" onClick={handleRandomize}>
              <svg viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
              {tr("gen.generateRandom")}
            </div>
          </div>

          {/* Editor cards — img2vid: Image File + Action + Custom Prompt; otherwise full 3×2 grid */}
          {isImg2Vid ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleMediaFileChange}
              />
              <div className="editor-section" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {/* Image File */}
                <div
                  className={`editor-card${initMediaUrl ? " active" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {initMediaUrl && (
                    <>
                      <img
                        src={initMediaUrl}
                        alt="source"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); resetInitMedia(); }}
                        style={{ position: "absolute", top: 8, right: 8, zIndex: 2, width: 24, height: 24, borderRadius: 6, background: "rgba(0,0,0,0.6)", border: "1px solid #3a3a3a", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </>
                  )}
                  <div className="card-content">
                    <div className="editor-icon">
                      <svg viewBox="0 0 20 20" fill="none"><path d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    </div>
                    <div className="editor-text">
                      <div className="name">{tr("gp.imageFile")}</div>
                      <div className="sub required">{uploadingMedia ? "uploading…" : "required"}</div>
                    </div>
                  </div>
                </div>

                {/* Action */}
                <div
                  className={`editor-card${actionTags.length > 0 ? " active" : ""}`}
                  onClick={() => setPoseOpen(true)}
                >
                  <div className="card-content">
                    <div className="editor-icon">
                      <svg viewBox="0 0 20 20" fill="none"><path d="M10 2l1.8 4.7L16.7 8 12 9.8 10.2 14.5 8.4 9.8 3.7 8l4.7-1.3L10 2z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="editor-text">
                      <div className="name">{tr("gp.action")}</div>
                      <div className="sub required">{tr("gp.required")}</div>
                    </div>
                    {actionTags.length > 0 && (
                      <div className="editor-tags">
                        {visibleActionTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
                        {extraActionTags > 0 && <span className="editor-tag">+{extraActionTags}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Prompt (Premium) */}
              <div className="custom-prompt-card" onClick={() => setPromptDetailsOpen(true)}>
                <div className="custom-prompt-icon">
                  <svg viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div className="heading">
                  <span>{tr("gp.customPrompt")}</span>
                  <span dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
                </div>
                <div className="premium-label">{tr("gp.premiumFeature")}</div>
                {promptDetailsSelections.negativePromptTerms.length > 0 && (
                  <div className="editor-tags">
                    {promptDetailsSelections.negativePromptTerms.slice(0, 3).map((t) => <span key={t} className="editor-tag">{t}</span>)}
                    {promptDetailsSelections.negativePromptTerms.length > 3 && (
                      <span className="editor-tag">+{promptDetailsSelections.negativePromptTerms.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
          <div className="editor-section">
            {/* Character */}
            <div className={`editor-card${hasCharSelections ? " active" : ""}`} onClick={() => setCharacterOpen(true)}>
              <div className="card-content">
                {selectedCharacter ? (
                  <div className="editor-char-avatar">
                    {selectedCharacter.avatarUrl && (
                      <img src={resizedMediaUrl(selectedCharacter.avatarUrl, { w: 200 }) || selectedCharacter.avatarUrl} alt={selectedCharacter.name} />
                    )}
                  </div>
                ) : (
                  <div className="editor-icon">
                    <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="#fff" strokeWidth="1.3"/><path d="M16 18c0-3.31-2.69-6-6-6s-6 2.69-6 6" stroke="#fff" strokeWidth="1.3"/></svg>
                  </div>
                )}
                <div className="editor-text">
                  <div className="name">{selectedCharacter ? selectedCharacter.name : tr("media.character")}</div>
                  <div className="sub required">{tr("gp.required")}</div>
                </div>
                {!selectedCharacter && hasCharSelections && (
                  <div className="editor-tags">
                    {visibleCharTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
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
                  <div className="name">{tr("gen.titleAppearance")}</div>
                  <div className="sub">{tr("gp.optionalLabel")}</div>
                </div>
                {hasAppearanceSelections && (
                  <div className="editor-tags">
                    {visibleAppearanceTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
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
                  <div className="name">{tr("gen.poseHeader")}</div>
                  <div className="sub required">{tr("gp.required")}</div>
                </div>
                {hasPoseSelections && (
                  <div className="editor-tags">
                    {visiblePoseTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
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
                  <div className="name">{tr("gen.titleScene")}</div>
                  <div className="sub">{tr("gp.optionalLabel")}</div>
                </div>
                {hasSceneSelections && (
                  <div className="editor-tags">
                    {visibleSceneTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
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
                  <div className="name">{tr("gen.titleCamera")}</div>
                  <div className="sub">{tr("gp.optionalLabel")}</div>
                </div>
                {hasCameraSelections && (
                  <div className="editor-tags">
                    {visibleCameraTags.map((t) => <span key={t} className="editor-tag">{localizeOption(t, lang)}</span>)}
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
                    {tr("prompt.title")}
                    <span dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
                  </div>
                  <div className="sub premium-label">{tr("gp.premiumFeature")}</div>
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
          )}

          {/* Separator */}
          <div className="sep" />

          {/* Orientation */}
          <div className="chips-section">
            <div className="section-title">{tr("gp.orientation")}</div>
            <div className="chips-row">
              {ASPECT_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`chip ${opt.cls}${aspectRatio === opt.value ? " active" : ""}`}
                  onClick={() => {
                    if (!opt.free && !isPremium) { showPremiumGate(); return; }
                    setAspectRatio(opt.value);
                  }}
                >
                  <span className="orient-icon"><span className={`orient-rect ${opt.rect}`} /></span>
                  {tr(opt.value === "4:5" ? "gp.aspectPortrait" : "gp.aspectLandscape")}
                  {!opt.free && <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Separator */}
          <div className="sep" />

          {/* Number of items */}
          <div className="chips-section">
            <div className="section-title">{tr(activeTab === "video" ? "gp.numberVideos" : "gp.numberImages")}</div>
            <div className="chips-row">
              {COUNT_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`chip flex-1${count === opt.value ? " active" : ""}`}
                  onClick={() => {
                    if (!opt.free && !isPremium) { showPremiumGate(); return; }
                    setCount(opt.value);
                  }}
                >
                  {opt.value}
                  {!opt.free && <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom buttons */}
          <div className="bottom-btns">
            <button className="btn-cancel" onClick={() => { setPromptOpen(false); setPrompt(""); setError(null); }}>{tr("common.cancel")}</button>
            <button
              className="btn-generate"
              disabled={(!prompt.trim() && !hasAnySelection) || !canGenerate || submitting}
              onClick={handleGenerate}
            >
              {submitting || !canGenerate
                ? tr("gp.generating")
                : tr("gp.generate", { type: activeTab === "video" ? tr("media.video") : tr("media.image") })
              }
            </button>
          </div>

          {/* Spinner */}
          {activeJobs.length > 0 && (
            <div className="spinner-container">
              <div className="spinner" />
              <span>{tr("gp.creating", { type: activeTab === "video" ? tr("media.video") : tr("media.image"), count: activeJobs.length })}</span>
            </div>
          )}

          {/* Error */}
          {error && <div className="error-msg">{error}</div>}

          {/* ── Photo&Video Gallery ── */}
          <div className="sep" />
          <div className="gallery-section">
            <h2 className="gallery-title">
              {tr("gallery.titlePink")}<span className="accent">{tr("gallery.titleWhite")}</span>
            </h2>

            {/* Gallery filter tabs */}
            <div className="gallery-filter-tabs">
              <button
                className={`gallery-filter-tab ${galleryFilter === "all" ? "active" : ""}`}
                onClick={() => setGalleryFilter("all")}
              >
                <svg viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>
                {tr("media.all")}
              </button>
              <button
                className={`gallery-filter-tab ${galleryFilter === "image" ? "active" : ""}`}
                onClick={() => setGalleryFilter("image")}
              >
                <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1"/><path d="M2 12l3.5-3.5L8 11l3-3 3 3v1.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5V12z" fill="currentColor" fillOpacity="0.3"/></svg>
                {tr("media.image")}
              </button>
              <button
                className={`gallery-filter-tab ${galleryFilter === "video" ? "active" : ""}`}
                onClick={() => setGalleryFilter("video")}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 5.5l4 2.5-4 2.5v-5z" fill="currentColor"/></svg>
                {tr("media.video")}
              </button>
            </div>

            {/* Toolbar: search + chosen count + download + delete */}
            <div className="gallery-toolbar">
              <div className="search-wrap">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <input
                  className="gallery-search"
                  placeholder={tr("common.search")}
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                />
              </div>
              <div className="chosen-count">
                {tr("gp.chosenContent")} <span>{selectedItems.size}</span>
              </div>
              <button
                className="btn-download-selected"
                disabled={selectedItems.size === 0}
                onClick={handleDownloadSelected}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12v2h12v-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {tr("myai.download")}
              </button>
              <button
                className="btn-delete-selected"
                disabled={selectedItems.size === 0}
                onClick={handleDeleteSelected}
              >
                <svg viewBox="0 0 16 16" fill="none"><path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M3 4l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10" stroke="currentColor" strokeWidth="1.2"/></svg>
                {tr("common.delete")}
              </button>
            </div>

            {/* Tags row */}
            {galleryTags.length > 0 && (
              <ScrollableTagsRow
                tags={galleryTags}
                selectedTags={selectedTags}
                onTagToggle={(tag) => {
                  if (tag === "__ALL__") {
                    setSelectedTags([]);
                  } else {
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    );
                  }
                }}
              />
            )}

            {/* Gallery grid */}
            {filteredHistory.length === 0 ? (
              <div className="empty-gallery">
                {tr("gp.emptyGallery")}
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
                        <img src={resizedMediaUrl(url, { w: 400 }) ?? url} alt={item.input?.prompt || "Generated"} loading="lazy" decoding="async" />
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
        onSave={(s) => { setCharacterSelections(s); setSelectedCharacter(null); }}
        options={characterOptions}
        onRandomize={handleRandomize}
        characters={allCharacters}
        selectedCharacterId={selectedCharacter?.id ?? null}
        onSelectCharacter={(c) => {
          setSelectedCharacter(c);
          if (c) setCharacterSelections(DEFAULT_CHARACTER_SELECTIONS);
        }}
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
        posesOnly={isImg2Vid}
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
        hideBreakdown={isImg2Vid}
        hideNegativePrompt={isImg2Vid}
      />

      {premiumPopup && (
        <PremiumPopup
          limitType={premiumPopup.limitType}
          limit={premiumPopup.limit}
          used={premiumPopup.used}
          onClose={() => setPremiumPopup(null)}
        />
      )}
    </>
  );
}

export default function GenerationPage() {
  return (
    <Suspense fallback={null}>
      <GenerationPageInner />
    </Suspense>
  );
}
