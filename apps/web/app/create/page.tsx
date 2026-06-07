"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import {
  characters, chats, createImageJob, getJobStatus, getCharacterOptions, ApiError,
  type CharacterOption,
  getAppearanceOptions, getPoseOptions, getSceneOptions, getCameraOptions,
  type AppearanceOptionsResponse, type PoseOptionsResponse, type SceneOptionsResponse, type CameraOptionsResponse,
} from "../../lib/api";
import PremiumPopup, { type PremiumLimitType } from "../components/PremiumPopup";
import { useGeneration } from "../../context/generation";
import { useT } from "../../context/language";
import type { TKey } from "../../lib/i18n";
import { PAGE_CSS } from "./styles";
import {
  GENDERS, ORIENTATIONS, NATIONALITIES, LANGUAGES, ETHNICITIES, VOICES,
  EYE_COLORS, HAIR_STYLES, HAIR_COLORS, BODY_TYPES, BREAST_SIZES, BUTT_SIZES,
  RELATIONSHIP_TYPES, FAMILY_STATUSES, LIFESTYLES, WORKS, HOBBIES,
  KINKS_1, KINKS_2, KINKS_3, STYLES, PERSONALITIES, STAGE_ICONS,
  CHEVRON_SVG, GENERATE_BTN_SVG, VOICE_ICON_SVG, CHECK_SVG, LOADER_SVG, PREMIUM_BADGE_SVG,
} from "./data";

/* ── Module-level state for AI image generation ── */

let previewImageUrl: string | null = null;
let previewPollInterval: ReturnType<typeof setInterval> | null = null;
let avatarGenerated = false;
let lastAvatarJobId: string | null = null;

let generationContextStartFn: ((jobId: string, type: "image" | "video", prompt: string, model: string, source?: string) => void) | null = null;

let cachedAppearanceOptions: AppearanceOptionsResponse | null = null;
let cachedPoseOptions: PoseOptionsResponse | null = null;
let cachedSceneOptions: SceneOptionsResponse | null = null;
let cachedCameraOptions: CameraOptionsResponse | null = null;

/* ── HTML Builders ────────────────────────────── */

// Module-level translator, set from the component before content is built so the
// many string-template builders below can localize without threading `t` through.
let tr: (key: TKey, vars?: Record<string, string | number>) => string = (k) => k;

// Translation keys for the 9 stage titles (parallel to STAGE_NAMES).
const STAGE_TITLE_KEYS: TKey[] = [
  "create.stageBasic", "create.stageOrigin", "create.stageFacial", "create.stageBodyType",
  "create.stagePersonality", "create.stageLifestyle", "create.stageKinks", "create.stageMemories",
  "create.stageFinalPreview",
];

const pad = (n: number) => String(n).padStart(2, "0");

function dropdown(field: string, label: string, options: string[], def: string) {
  const opts = options.map((o) => `<div class="dropdown-option" data-value="${o}">${o}</div>`).join("");
  return `<div class="dropdown-container" data-field="${field}" data-selected="${def}">
    <div class="dropdown-btn"><div class="text"><span class="lbl">${label}:</span><span class="val">${def}</span></div>${CHEVRON_SVG}</div>
    <div class="dropdown-menu">${opts}</div></div>`;
}

function cardGrid(field: string, items: string[], scrollable = false) {
  const cards = items.map((v) => `<div class="ethnicity-card" data-value="${v}"><span class="card-name">${v}</span></div>`).join("");
  return `<div class="ethnicity-grid${scrollable ? " facial-grid" : ""}" data-field="${field}">${cards}</div>`;
}

function imageCardGrid(field: string, containerId: string, scrollable = false) {
  return `<div class="ethnicity-grid${scrollable ? " facial-grid" : ""}" data-field="${field}" id="${containerId}"></div>`;
}

function populateImageCards(containerId: string, options: CharacterOption[]) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = options.map((o) => {
    const src = o.imageThumbUrl || o.imageUrl;
    const imgHtml = src
      ? `<img src="${src}" alt="${o.name}" class="ethnicity-card-img" loading="lazy" decoding="async" />`
      : "";
    return `<div class="ethnicity-card" data-value="${o.name}" data-prompt="${(o.prompt || "").replace(/"/g, "&quot;")}">${imgHtml}<span class="card-name">${o.name}</span></div>`;
  }).join("");
  container.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
    card.onclick = () => {
      container.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      container.classList.remove("field-error-ring");
    };
  });
}

function chips(field: string, items: string[]) {
  return `<div class="tags-wrap" data-field="${field}">${items.map((v) => `<div class="tag-chip" data-value="${v}">${v}</div>`).join("")}</div>`;
}

function stageHeader(num: number, titleKey: TKey, genDisabled = false) {
  return `<div class="form-header"><div class="stage-info"><div class="stage-label">${tr("create.stage")} ${pad(num)}</div>
    <div class="stage-title">${tr(titleKey)}</div></div>
    <div class="header-actions">
      <div class="btn-reset">${tr("create.reset")}</div>
      <div class="btn-generate${genDisabled ? " disabled" : ""}">${GENERATE_BTN_SVG}<span>${tr("gen.generateRandom")}</span></div>
    </div></div><div class="form-sep"></div>`;
}

function navButtons(prev: number, next: number | "submit") {
  const right = next === "submit"
    ? `<div class="btn-bring-to-life disabled" id="btn-submit">${tr("create.bringToLife")}</div>`
    : `<div class="btn-continue" data-goto="${next}">${tr("create.continue")}</div>`;
  return `<div class="buttons-row"><div class="btn-cancel" data-goto="${prev}">${tr("common.cancel")}</div>${right}</div>`;
}

/* ── Stage HTML ───────────────────────────────── */

function stage01() {
  return `<div class="stage-content active" id="stage-01-content">
    ${stageHeader(1, "create.stageBasic")}
    <div class="dropdown-row">${dropdown("gender", tr("create.gender"), GENDERS, "Female")}${dropdown("orientation", tr("create.orientation"), ORIENTATIONS, "Heterosexual")}</div>
    <div class="field"><div class="field-label">${tr("create.name")}</div><input type="text" class="input-text" id="input-name" placeholder="${tr("create.namePlaceholder")}" value=""></div>
    <div class="field"><div class="field-label">${tr("create.surname")}</div><input type="text" class="input-text" id="input-surname" placeholder="${tr("create.surnamePlaceholder")}"></div>
    <div class="field-age"><div class="field-label">${tr("create.age")}</div>
      <div class="slider-container"><span class="slider-min">18</span>
        <div class="slider-track" data-value="25"><div class="slider-fill"><div class="slider-thumb"><div class="slider-tooltip">25</div></div></div></div>
        <span class="slider-max">100</span></div></div>
    <div class="field-style"><div class="field-label">${tr("create.style")}</div>
      <div class="style-row" id="style-row-container">${STYLES.map((s, i) => `<div class="style-card ${i === 0 ? "selected" : "unselected"}" data-value="${s}" data-generation-style=""><span class="name">${s}</span></div>`).join("")}</div></div>
    ${navButtons(1, 2)}
  </div>`;
}

function stage02() {
  return `<div class="stage-content" id="stage-02-content">
    ${stageHeader(2, "create.stageOrigin")}
    <div class="dropdown-row">${dropdown("nationality", tr("create.nationality"), NATIONALITIES, "American")}${dropdown("language", tr("create.language"), LANGUAGES, "English")}</div>
    <div class="ethnicity-section"><div class="field-label">${tr("create.ethnicity")}</div>${imageCardGrid("ethnicity", "ethnicity-grid-container")}</div>
    <div class="ethnicity-section" id="fantasy-race-section" style="display:none"><div class="field-label">${tr("create.fantasyRace")} <span style="color:#969696;font-weight:400">${tr("create.optional")}</span></div>${imageCardGrid("fantasyRace", "fantasy-race-grid-container")}</div>
    <div class="voice-section"><div class="field-label">${tr("create.voice")}</div>
      <div class="voice-row">${VOICES.map((v, i) => `<div class="voice-btn${i === 0 ? " selected" : ""}" data-value="${v}">${VOICE_ICON_SVG}<span>${v}</span></div>`).join("")}</div></div>
    ${navButtons(1, 3)}
  </div>`;
}

function stage03() {
  return `<div class="stage-content" id="stage-03-content">
    ${stageHeader(3, "create.stageFacial")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">${tr("create.eyeColor")}</div>${cardGrid("eyeColor", EYE_COLORS, true)}</div>
      <div class="ethnicity-section"><div class="field-label">${tr("create.hairStyle")}</div>${imageCardGrid("hairStyle", "hairstyle-grid-container", true)}</div>
      <div class="ethnicity-section"><div class="field-label">${tr("create.hairColor")}</div>${cardGrid("hairColor", HAIR_COLORS, true)}</div>
    </div>
    ${navButtons(2, 4)}
  </div>`;
}

function stage04() {
  return `<div class="stage-content" id="stage-04-content">
    ${stageHeader(4, "create.stageBodyType")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">${tr("create.bodyType")}</div>${imageCardGrid("bodyType", "bodytype-grid-container", true)}</div>
      <div class="ethnicity-section"><div class="field-label">${tr("create.breastSize")}</div>${cardGrid("breastSize", BREAST_SIZES, true)}</div>
      <div class="ethnicity-section"><div class="field-label">${tr("create.buttSize")}</div>${cardGrid("buttSize", BUTT_SIZES, true)}</div>
    </div>
    ${navButtons(3, 5)}
  </div>`;
}

function stage05() {
  const persCards = PERSONALITIES.map((p) =>
    `<div class="personality-card" data-value="${p.name}"><div class="p-icon">${p.icon}</div><div class="p-title">${p.name}</div><div class="p-desc">${p.desc}</div></div>`
  ).join("");
  return `<div class="stage-content" id="stage-05-content">
    ${stageHeader(5, "create.stagePersonality")}
    <div class="dropdown-row">${dropdown("relationshipType", tr("create.relationshipType"), RELATIONSHIP_TYPES, "Girlfriend")}${dropdown("familyStatus", tr("create.familyStatus"), FAMILY_STATUSES, "Single")}</div>
    <div class="personality-scroll"><div class="field-label">${tr("create.personality")}</div><div class="personality-grid">${persCards}</div></div>
    ${navButtons(4, 6)}
  </div>`;
}

function stage06() {
  return `<div class="stage-content" id="stage-06-content">
    ${stageHeader(6, "create.stageLifestyle")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">${tr("create.lifestyle")}</div>${cardGrid("lifestyle", LIFESTYLES, true)}</div>
      <div class="tags-section"><div class="field-label">${tr("create.work")}</div>${chips("work", WORKS)}</div>
      <div class="tags-section"><div class="field-label">${tr("create.hobby")}</div>${chips("hobbies", HOBBIES)}</div>
    </div>
    ${navButtons(5, 7)}
  </div>`;
}

function stage07() {
  return `<div class="stage-content" id="stage-07-content">
    ${stageHeader(7, "create.stageKinks")}
    <div class="facial-scroll">
      <div class="tags-section"><div class="field-label">${tr("create.kinksScenarios")}</div>${chips("kinks1", KINKS_1)}</div>
      <div class="tags-section"><div class="field-label">${tr("create.kinksPower")}</div>${chips("kinks2", KINKS_2)}</div>
      <div class="tags-section"><div class="field-label">${tr("create.kinksSensory")}</div>${chips("kinks3", KINKS_3)}</div>
    </div>
    ${navButtons(6, 8)}
  </div>`;
}

function stage08() {
  return `<div class="stage-content" id="stage-08-content">
    ${stageHeader(8, "create.stageMemories", true)}
    <div class="facial-scroll">
      <div class="memory-field"><div class="memory-label">${tr("create.childhoodMemory")} ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-childhood" placeholder="${tr("create.childhoodPlaceholder")}"></textarea></div>
      <div class="memory-field"><div class="memory-label">${tr("create.lifeStory")} ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-lifestory" placeholder="${tr("create.lifeStoryPlaceholder")}"></textarea></div>
      <div class="memory-field"><div class="memory-label">${tr("create.phobias")} ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-phobias" placeholder="${tr("create.phobiasPlaceholder")}"></textarea></div>
    </div>
    ${navButtons(7, 9)}
  </div>`;
}

function stage09() {
  return `<div class="stage-content" id="stage-09-content">
    <div class="s9-header">
      <div class="stage-info"><div class="stage-label">${tr("create.stage")} 09</div><div class="stage-title">${tr("create.stageFinalPreview")}</div></div>
    </div>
    <div class="s9-sep"></div>
    <div class="s9-body">
      <!-- LEFT: avatar card -->
      <div class="s9-avatar-col">
        <div class="s9-avatar-wrap">
          <img id="s9-avatar-img" class="s9-avatar-img" src="" style="display:none">
          <div id="s9-avatar-spinner" class="s9-spinner-wrap">
            <div class="s9-spinner"></div>
            <div class="s9-spinner-txt">${tr("create.generating")}</div>
          </div>
          <button class="s9-regen-btn" id="s9-regen-btn" title="${tr("create.regenerate")}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          </button>
        </div>
        <div class="s9-name-row">
          <span id="preview-name" class="s9-name">${tr("create.character")}</span>
        </div>
        <div class="s9-age-row">
          <span id="preview-age" class="s9-age">25 yo</span>
        </div>
      </div>
      <!-- RIGHT: tabs + attribute grid -->
      <div class="s9-attrs-col">
        <div class="preview-tabs">
          <div class="preview-tab active" data-tab="tab-appearance">${tr("create.tabAppearance")}</div>
          <div class="preview-tab" data-tab="tab-personality">${tr("create.tabPersonality")}</div>
          <div class="preview-tab" data-tab="tab-memories">${tr("create.tabMemories")}</div>
        </div>
        <div class="s9-tab-sep"></div>
        <div class="preview-tab-content active" id="tab-appearance"></div>
        <div class="preview-tab-content" id="tab-personality"></div>
        <div class="preview-tab-content" id="tab-memories"></div>
      </div>
    </div>
    ${navButtons(8, "submit")}
  </div>`;
}

/* ── Stages Progress Panel ────────────────────── */

function stagesPanel() {
  let html = '<div class="stages-panel">';
  for (let i = 1; i <= 9; i++) {
    const svgInner = STAGE_ICONS[i].replace(/__CLR__/g, i === 1 ? "white" : "#969696");
    const isActive = i === 1;
    const iconClass = isActive ? "stage-icon-active" : "stage-icon-inactive";
    const iconContent = isActive
      ? `<div class="icon-content"><svg width="16" height="16" viewBox="0 0 16 16" fill="none">${svgInner}</svg></div>`
      : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">${svgInner}</svg>`;
    const desc = isActive
      ? `<div class="stage-desc" id="stage-${pad(i)}-desc">${tr("create.facialDesc")}</div>`
      : "";
    const textClass = isActive ? "stage-text with-desc" : "stage-text";
    html += `<div class="progress-stage" id="stage-${pad(i)}-progress">
      <div class="${iconClass}" id="stage-${pad(i)}-icon">${iconContent}</div>
      <div class="${textClass}" id="stage-${pad(i)}-text">
        <div class="header"><div class="stage-number">${tr("create.stage")} ${pad(i)}</div>
        <div class="stage-name" id="stage-${pad(i)}-name">${tr(STAGE_TITLE_KEYS[i - 1])}</div></div>${desc}
      </div>${isActive ? "" : LOADER_SVG.replace('class="loader-icon"', `class="loader-icon" id="stage-${pad(i)}-loader"`)}
    </div>`;
    if (i < 9) {
      const sepClass = i === 1 ? "pink" : "gray";
      html += `<div class="stage-separator" id="sep-${pad(i)}-${pad(i + 1)}"><div class="stage-sep-line ${sepClass}"></div></div>`;
    }
  }
  html += "</div>";
  return html;
}

/* ── Full page content ────────────────────────── */

function mobileDots() {
  const dots = Array.from({ length: 9 }, (_, i) => {
    const n = i + 1;
    return `<div class="mobile-dot${n === 1 ? " active" : ""}" id="mdot-${pad(n)}"></div>${n < 9 ? '<div class="mobile-dot-line"></div>' : ""}`;
  }).join("");
  return `<div class="mobile-progress-dots">${dots}</div>`;
}

function buildContent() {
  return `<div class="create-header">
      <div class="breadcrumb">${tr("create.breadcrumb")}</div>
      <div class="page-title"><span class="pink">${tr("create.titlePink")}</span>${tr("create.titleRest")}</div>
    </div>
    ${mobileDots()}
    <div class="create-body">
      ${stagesPanel()}
      <div class="form-card">${stage01()}${stage02()}${stage03()}${stage04()}${stage05()}${stage06()}${stage07()}${stage08()}${stage09()}</div>
    </div>`;
}

/* ── Collect form data from DOM ───────────────── */

function collectFormData() {
  const sel = (f: string) => document.querySelector<HTMLElement>(`[data-field="${f}"]`)?.dataset?.selected;
  const card = (f: string) => document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${f}"] .ethnicity-card.selected`)?.dataset?.value;
  const cardPrompt = (f: string) => document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${f}"] .ethnicity-card.selected`)?.dataset?.prompt || undefined;
  const chipVals = (f: string) => Array.from(document.querySelectorAll<HTMLElement>(`.tags-wrap[data-field="${f}"] .tag-chip.selected`)).map((c) => c.dataset.value!);
  const pers = () => document.querySelector<HTMLElement>(".personality-card.selected")?.dataset?.value;
  const voice = () => document.querySelector<HTMLElement>(".voice-btn.selected")?.querySelector("span")?.textContent?.trim();
  const style = () => document.querySelector<HTMLElement>(".style-card.selected")?.dataset?.value;
  const genStyle = () => document.querySelector<HTMLElement>(".style-card.selected")?.dataset?.generationStyle;

  return {
    name: (document.getElementById("input-name") as HTMLInputElement)?.value || "Character",
    surname: (document.getElementById("input-surname") as HTMLInputElement)?.value || undefined,
    age: parseInt(document.querySelector<HTMLElement>(".slider-track")?.dataset?.value || "25"),
    gender: sel("gender") || "Female",
    orientation: sel("orientation") || "Heterosexual",
    style: style() || "Realistic",
    generationStyle: genStyle() || "",
    nationality: sel("nationality"),
    language: sel("language"),
    ethnicity: card("ethnicity"),
    ethnicityPrompt: cardPrompt("ethnicity"),
    fantasyRace: card("fantasyRace"),
    fantasyRacePrompt: cardPrompt("fantasyRace"),
    voice: voice(),
    eyeColor: card("eyeColor"),
    hairStyle: card("hairStyle"),
    hairStylePrompt: cardPrompt("hairStyle"),
    hairColor: card("hairColor"),
    bodyType: card("bodyType"),
    bodyTypePrompt: cardPrompt("bodyType"),
    breastSize: card("breastSize"),
    buttSize: card("buttSize"),
    personality: pers(),
    relationshipType: sel("relationshipType"),
    familyStatus: sel("familyStatus"),
    lifestyle: card("lifestyle"),
    work: chipVals("work"),
    hobbies: chipVals("hobbies"),
    kinks: [...chipVals("kinks1"), ...chipVals("kinks2"), ...chipVals("kinks3")],
    childhoodMemory: (document.getElementById("memory-childhood") as HTMLTextAreaElement)?.value || undefined,
    lifeStory: (document.getElementById("memory-lifestory") as HTMLTextAreaElement)?.value || undefined,
    phobias: (document.getElementById("memory-phobias") as HTMLTextAreaElement)?.value || undefined,
  };
}

/* ── Form state persistence ─────────────────── */

const DRAFT_LS_KEY = "create_character_draft";

interface CreateDraft {
  currentStage: number;
  formData: ReturnType<typeof collectFormData>;
  previewImageUrl: string | null;
  avatarGenerated: boolean;
  lastAvatarJobId: string | null;
}

function saveFormState(stageNum: number) {
  try {
    const data = collectFormData();
    const draft: CreateDraft = {
      currentStage: stageNum,
      formData: data,
      previewImageUrl,
      avatarGenerated,
      lastAvatarJobId,
    };
    localStorage.setItem(DRAFT_LS_KEY, JSON.stringify(draft));
  } catch { /* ignore */ }
}

function restoreFormState(): boolean {
  try {
    const raw = localStorage.getItem(DRAFT_LS_KEY);
    if (!raw) return false;
    const draft: CreateDraft = JSON.parse(raw);
    if (!draft || !draft.formData) return false;
    const d = draft.formData;

    // Restore inputs
    const nameInput = document.getElementById("input-name") as HTMLInputElement | null;
    if (nameInput && d.name) nameInput.value = d.name;
    const surnameInput = document.getElementById("input-surname") as HTMLInputElement | null;
    if (surnameInput && d.surname) surnameInput.value = d.surname;

    // Restore age slider
    if (d.age) {
      const track = document.querySelector<HTMLElement>(".slider-track");
      const fill = document.querySelector<HTMLElement>(".slider-fill");
      const tooltip = document.querySelector<HTMLElement>(".slider-tooltip");
      if (track && fill && tooltip) {
        const pct = (d.age - 18) / 82;
        fill.style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
        tooltip.textContent = String(d.age);
        track.dataset.value = String(d.age);
      }
    }

    // Restore dropdowns
    const restoreDropdown = (field: string, value: string | undefined | null) => {
      if (!value) return;
      const container = document.querySelector<HTMLElement>(`.dropdown-container[data-field="${field}"]`);
      if (!container) return;
      container.dataset.selected = value;
      const valEl = container.querySelector<HTMLElement>(".val");
      if (valEl) valEl.textContent = value;
    };
    restoreDropdown("gender", d.gender);
    restoreDropdown("orientation", d.orientation);
    restoreDropdown("nationality", d.nationality);
    restoreDropdown("language", d.language);
    restoreDropdown("relationshipType", d.relationshipType);
    restoreDropdown("familyStatus", d.familyStatus);

    // Restore style selection
    if (d.style) {
      const styleRow = document.getElementById("style-row-container");
      if (styleRow) {
        styleRow.querySelectorAll<HTMLElement>(".style-card").forEach((c) => {
          c.classList.remove("selected", "unselected");
          c.classList.add(c.dataset.value === d.style ? "selected" : "unselected");
        });
      }
    }

    // Restore card selections (ethnicity, eyeColor, hairStyle, hairColor, bodyType, breastSize, buttSize, lifestyle)
    const restoreCard = (field: string, value: string | undefined | null) => {
      if (!value) return;
      const grid = document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${field}"]`);
      if (!grid) return;
      grid.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
      const card = grid.querySelector<HTMLElement>(`.ethnicity-card[data-value="${value}"]`);
      card?.classList.add("selected");
    };
    restoreCard("ethnicity", d.ethnicity);
    restoreCard("fantasyRace", d.fantasyRace);
    restoreCard("eyeColor", d.eyeColor);
    restoreCard("hairStyle", d.hairStyle);
    restoreCard("hairColor", d.hairColor);
    restoreCard("bodyType", d.bodyType);
    restoreCard("breastSize", d.breastSize);
    restoreCard("buttSize", d.buttSize);
    restoreCard("lifestyle", d.lifestyle);

    // Restore voice
    if (d.voice) {
      document.querySelectorAll<HTMLElement>(".voice-btn").forEach((b) => {
        const name = b.querySelector("span")?.textContent?.trim();
        b.classList.toggle("selected", name === d.voice);
      });
    }

    // Restore personality
    if (d.personality) {
      document.querySelectorAll<HTMLElement>(".personality-card").forEach((c) => {
        c.classList.toggle("selected", c.dataset.value === d.personality);
      });
    }

    // Restore chips (work, hobbies, kinks)
    const restoreChips = (field: string, values: string[] | undefined) => {
      if (!values || values.length === 0) return;
      const wrap = document.querySelector<HTMLElement>(`.tags-wrap[data-field="${field}"]`);
      if (!wrap) return;
      wrap.querySelectorAll<HTMLElement>(".tag-chip").forEach((chip) => {
        chip.classList.toggle("selected", values.includes(chip.dataset.value || ""));
      });
    };
    restoreChips("work", d.work);
    restoreChips("hobbies", d.hobbies);
    // Kinks are stored as combined array — need to restore across all 3 fields
    if (d.kinks && d.kinks.length > 0) {
      restoreChips("kinks1", d.kinks);
      restoreChips("kinks2", d.kinks);
      restoreChips("kinks3", d.kinks);
    }

    // Restore textareas
    const memChildhood = document.getElementById("memory-childhood") as HTMLTextAreaElement | null;
    if (memChildhood && d.childhoodMemory) memChildhood.value = d.childhoodMemory;
    const memLifestory = document.getElementById("memory-lifestory") as HTMLTextAreaElement | null;
    if (memLifestory && d.lifeStory) memLifestory.value = d.lifeStory;
    const memPhobias = document.getElementById("memory-phobias") as HTMLTextAreaElement | null;
    if (memPhobias && d.phobias) memPhobias.value = d.phobias;

    // Restore module-level state
    if (draft.previewImageUrl) previewImageUrl = draft.previewImageUrl;
    if (draft.avatarGenerated) avatarGenerated = draft.avatarGenerated;
    if (draft.lastAvatarJobId) lastAvatarJobId = draft.lastAvatarJobId;

    // If we have a jobId but no image yet, poll for the result
    if (draft.lastAvatarJobId && !draft.previewImageUrl && draft.currentStage === 9) {
      avatarGenerated = true;
      pollForAvatarResult(draft.lastAvatarJobId);
    }

    // Navigate to saved stage
    if (draft.currentStage > 1) {
      goToStage(draft.currentStage);
    }

    return true;
  } catch {
    return false;
  }
}

/* ── Stage validation ────────────────────────── */

function validateStage(n: number): { valid: boolean; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = [];

  const hasCard = (field: string) =>
    !!document.querySelector(`.ethnicity-grid[data-field="${field}"] .ethnicity-card.selected`);
  const hasChip = (field: string) =>
    document.querySelectorAll(`.tags-wrap[data-field="${field}"] .tag-chip.selected`).length > 0;

  switch (n) {
    case 1: {
      const name = (document.getElementById("input-name") as HTMLInputElement)?.value?.trim();
      if (!name) errors.push({ field: "input-name", message: tr("create.errName") });
      break;
    }
    case 2:
      // Этничность ИЛИ фэнтези-раса (фэнтези-раса опциональна и заменяет этничность).
      if (!hasCard("ethnicity") && !hasCard("fantasyRace")) errors.push({ field: "ethnicity", message: tr("create.errEthnicity") });
      break;
    case 3:
      if (!hasCard("eyeColor")) errors.push({ field: "eyeColor", message: tr("create.errEyeColor") });
      if (!hasCard("hairStyle")) errors.push({ field: "hairStyle", message: tr("create.errHairStyle") });
      if (!hasCard("hairColor")) errors.push({ field: "hairColor", message: tr("create.errHairColor") });
      break;
    case 4:
      if (!hasCard("bodyType")) errors.push({ field: "bodyType", message: tr("create.errBodyType") });
      if (!hasCard("breastSize")) errors.push({ field: "breastSize", message: tr("create.errBreastSize") });
      if (!hasCard("buttSize")) errors.push({ field: "buttSize", message: tr("create.errButtSize") });
      break;
    case 5:
      if (!document.querySelector(".personality-card.selected"))
        errors.push({ field: "personality", message: tr("create.errPersonality") });
      break;
    case 6:
      if (!hasCard("lifestyle")) errors.push({ field: "lifestyle", message: tr("create.errLifestyle") });
      if (!hasChip("work")) errors.push({ field: "work", message: tr("create.errWork") });
      if (!hasChip("hobbies")) errors.push({ field: "hobbies", message: tr("create.errHobby") });
      break;
    case 7:
      if (!hasChip("kinks1") && !hasChip("kinks2") && !hasChip("kinks3"))
        errors.push({ field: "kinks1", message: tr("create.errKink") });
      break;
  }

  return { valid: errors.length === 0, errors };
}

function showValidationErrors(stageNum: number, errors: { field: string; message: string }[]) {
  clearValidationErrors(stageNum);
  const stageEl = document.getElementById(`stage-${pad(stageNum)}-content`);
  if (!stageEl) return;

  for (const err of errors) {
    if (err.field === "input-name") {
      document.getElementById("input-name")?.classList.add("field-error-ring");
    } else if (err.field === "personality") {
      stageEl.querySelector(".personality-grid")?.classList.add("field-error-ring");
    } else {
      stageEl.querySelector(`[data-field="${err.field}"]`)?.classList.add("field-error-ring");
    }
  }

  const buttonsRow = stageEl.querySelector(".buttons-row");
  if (buttonsRow) {
    const errorDiv = document.createElement("div");
    errorDiv.className = "create-error stage-validation-error";
    errorDiv.textContent = errors.length === 1
      ? errors[0].message
      : `Please fill in the highlighted fields (${errors.length} remaining)`;
    buttonsRow.parentElement?.insertBefore(errorDiv, buttonsRow);
  }

  const continueBtn = stageEl.querySelector<HTMLElement>(".btn-continue");
  if (continueBtn) {
    continueBtn.classList.add("shake");
    setTimeout(() => continueBtn.classList.remove("shake"), 400);
  }
}

function clearValidationErrors(stageNum: number) {
  const stageEl = document.getElementById(`stage-${pad(stageNum)}-content`);
  if (!stageEl) return;
  stageEl.querySelectorAll(".field-error-ring").forEach((el) => el.classList.remove("field-error-ring"));
  stageEl.querySelectorAll(".stage-validation-error").forEach((el) => el.remove());
}

/* ── Randomize stage fields ──────────────────── */

const RANDOM_NAMES = ["Aria", "Luna", "Mia", "Zara", "Nina", "Lexi", "Ivy", "Jade", "Chloe", "Ruby", "Stella", "Nora", "Alex", "Max", "Kai", "Leo", "Finn", "Suki", "Hana", "Yuki"];

function randomizeStage(n: number) {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickN = <T,>(arr: readonly T[], min: number, max: number): T[] => {
    const count = min + Math.floor(Math.random() * (max - min + 1));
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  const selectCard = (field: string, value: string) => {
    const grid = document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${field}"]`);
    if (!grid) return;
    grid.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
    const card = grid.querySelector<HTMLElement>(`.ethnicity-card[data-value="${value}"]`);
    card?.classList.add("selected");
  };

  const selectRandomCard = (field: string) => {
    const grid = document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${field}"]`);
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".ethnicity-card"));
    if (cards.length === 0) return;
    const idx = Math.floor(Math.random() * cards.length);
    cards.forEach((c) => c.classList.remove("selected"));
    cards[idx].classList.add("selected");
  };

  const selectChips = (field: string, values: string[]) => {
    const wrap = document.querySelector<HTMLElement>(`.tags-wrap[data-field="${field}"]`);
    if (!wrap) return;
    wrap.querySelectorAll(".tag-chip").forEach((c) => c.classList.remove("selected"));
    for (const v of values) {
      wrap.querySelector<HTMLElement>(`.tag-chip[data-value="${v}"]`)?.classList.add("selected");
    }
  };

  const setDropdown = (field: string, value: string) => {
    const container = document.querySelector<HTMLElement>(`.dropdown-container[data-field="${field}"]`);
    if (!container) return;
    container.dataset.selected = value;
    const valEl = container.querySelector<HTMLElement>(".val");
    if (valEl) valEl.textContent = value;
  };

  switch (n) {
    case 1: {
      const nameInput = document.getElementById("input-name") as HTMLInputElement | null;
      if (nameInput) nameInput.value = pick(RANDOM_NAMES);
      nameInput?.classList.remove("field-error-ring");
      const age = 18 + Math.floor(Math.random() * 33);
      const track = document.querySelector<HTMLElement>(".slider-track");
      const fill = document.querySelector<HTMLElement>(".slider-fill");
      const tooltip = document.querySelector<HTMLElement>(".slider-tooltip");
      if (track && fill && tooltip) {
        const pct = (age - 18) / 82;
        fill.style.width = pct * 100 + "%";
        tooltip.textContent = String(age);
        track.dataset.value = String(age);
      }
      setDropdown("gender", pick(GENDERS));
      setDropdown("orientation", pick(ORIENTATIONS));
      const styleRow = document.getElementById("style-row-container");
      if (styleRow) {
        const cards = styleRow.querySelectorAll<HTMLElement>(".style-card");
        const idx = Math.floor(Math.random() * cards.length);
        cards.forEach((c, i) => {
          c.classList.remove("selected", "unselected");
          c.classList.add(i === idx ? "selected" : "unselected");
        });
      }
      break;
    }
    case 2:
      selectRandomCard("ethnicity");
      setDropdown("nationality", pick(NATIONALITIES));
      setDropdown("language", pick(LANGUAGES));
      const voiceBtns = document.querySelectorAll<HTMLElement>(".voice-btn");
      if (voiceBtns.length) {
        const idx = Math.floor(Math.random() * voiceBtns.length);
        voiceBtns.forEach((b) => b.classList.remove("selected"));
        voiceBtns[idx].classList.add("selected");
      }
      break;
    case 3:
      selectCard("eyeColor", pick(EYE_COLORS));
      selectRandomCard("hairStyle");
      selectCard("hairColor", pick(HAIR_COLORS));
      break;
    case 4:
      selectRandomCard("bodyType");
      selectCard("breastSize", pick(BREAST_SIZES));
      selectCard("buttSize", pick(BUTT_SIZES));
      break;
    case 5: {
      const persGrid = document.querySelector<HTMLElement>(".personality-grid");
      if (persGrid) {
        const cards = persGrid.querySelectorAll<HTMLElement>(".personality-card");
        const idx = Math.floor(Math.random() * cards.length);
        cards.forEach((c) => c.classList.remove("selected"));
        cards[idx]?.classList.add("selected");
      }
      setDropdown("relationshipType", pick(RELATIONSHIP_TYPES));
      setDropdown("familyStatus", pick(FAMILY_STATUSES));
      break;
    }
    case 6:
      selectCard("lifestyle", pick(LIFESTYLES));
      selectChips("work", pickN(WORKS, 1, 3));
      selectChips("hobbies", pickN(HOBBIES, 1, 3));
      break;
    case 7:
      selectChips("kinks1", pickN(KINKS_1, 1, 3));
      selectChips("kinks2", pickN(KINKS_2, 1, 2));
      selectChips("kinks3", pickN(KINKS_3, 1, 2));
      break;
  }
}

/* ── Populate stage-09 preview ────────────────── */

function row(icon: string, label: string, value: string) {
  return `<div class="pers-row"><div class="pers-row-icon">${icon}</div><div class="pers-row-text"><span class="pers-row-label">${label}</span><span class="pers-row-value">${value || tr("create.notSet")}</span></div></div>`;
}

function colorNameToHex(name: string | undefined): string {
  if (!name) return "#555";
  const map: Record<string, string> = {
    black: "#1a1a1a", brown: "#6b3a2a", blonde: "#f5d67b", red: "#c0392b",
    auburn: "#8b2500", gray: "#888", white: "#eee", silver: "#ccc",
    blue: "#2980b9", green: "#27ae60", hazel: "#7d6608", amber: "#d4a017",
    violet: "#8e44ad", pink: "#e91e8c", purple: "#6c3483",
  };
  return map[name.toLowerCase()] ?? "#555";
}

function s9Tile(icon: string, name: string, label: string) {
  return `<div class="s9-tile"><div class="s9-tile-icon">${icon}</div><div class="s9-tile-name">${name || "—"}</div><div class="s9-tile-label">${label}</div></div>`;
}

function s9ColorTile(color: string | undefined, label: string) {
  const hex = colorNameToHex(color);
  return `<div class="s9-color-tile"><div class="s9-color-dot" style="background:${hex}"></div><div class="s9-color-info"><div class="s9-color-name">${color || "—"}</div><div class="s9-tile-label">${label}</div></div></div>`;
}

function s9PersRow(icon: string, label: string, value: string) {
  return `<div class="s9-pers-row"><div class="s9-pers-icon">${icon}</div><div class="s9-pers-text"><div class="s9-pers-label">${label}</div><div class="s9-pers-value">${value || tr("create.notSet")}</div></div></div>`;
}

function populatePreview() {
  const d = collectFormData();
  const nameEl = document.getElementById("preview-name");
  const ageEl = document.getElementById("preview-age");
  if (nameEl) nameEl.textContent = d.surname ? `${d.name} ${d.surname}` : d.name;
  if (ageEl) ageEl.textContent = tr("create.yo", { age: d.age });

  // Appearance tab — tile grid + color tiles + custom textareas
  const app = document.getElementById("tab-appearance");
  if (app) {
    app.innerHTML = `
      <div class="s9-attr-grid">
        ${s9Tile("🔊", d.voice || "—", tr("create.pvVoice"))}
        ${s9Tile("💇", d.hairStyle || "—", tr("create.pvHairstyle"))}
        ${s9Tile("🌍", d.ethnicity || "—", tr("create.pvEthnicity"))}
        <div class="s9-color-tiles">
          ${s9ColorTile(d.eyeColor, tr("create.pvEyes"))}
          ${s9ColorTile(d.hairColor, tr("create.pvHair"))}
        </div>
      </div>
      <div class="s9-attr-grid" style="grid-template-columns:repeat(3,1fr)">
        ${s9Tile("🏋️", d.bodyType || "—", tr("create.pvBodyType"))}
        ${s9Tile("🌸", d.breastSize || "—", tr("create.pvBreastSize"))}
        ${s9Tile("🍑", d.buttSize || "—", tr("create.pvButtSize"))}
      </div>
      <div class="s9-custom-textareas">
        <div>
          <div class="s9-custom-label">${tr("create.customAppearance")} 💎</div>
          <textarea class="s9-custom-textarea" placeholder="${tr("create.customAppearancePh")}"></textarea>
        </div>
        <div>
          <div class="s9-custom-label">${tr("create.customFace")} 💎</div>
          <textarea class="s9-custom-textarea" placeholder="${tr("create.customFacePh")}"></textarea>
        </div>
      </div>`;
  }

  // Personality tab — text rows
  const per = document.getElementById("tab-personality");
  if (per) {
    per.innerHTML = `<div class="s9-pers-list">
      ${s9PersRow("💬", tr("create.pvPersonality"), d.personality || "")}
      ${s9PersRow("🏠", tr("create.pvLifestyle"), d.lifestyle || "")}
      ${s9PersRow("💑", tr("create.pvRelationship"), d.relationshipType || "")}
      ${s9PersRow("👨‍👩‍👧", tr("create.pvFamilyStatus"), d.familyStatus || "")}
      ${s9PersRow("💼", tr("create.pvWork"), d.work?.join(", ") || "")}
      ${s9PersRow("🎯", tr("create.pvHobbies"), d.hobbies?.join(", ") || "")}
      ${s9PersRow("🔥", tr("create.pvKinks"), d.kinks?.join(", ") || "")}
    </div>`;
  }

  // Memories tab — text rows
  const mem = document.getElementById("tab-memories");
  if (mem) {
    mem.innerHTML = `<div class="s9-pers-list">
      ${s9PersRow("🧒", tr("create.pvChildhood"), d.childhoodMemory || "")}
      ${s9PersRow("📖", tr("create.pvLifeStory"), d.lifeStory || "")}
      ${s9PersRow("😨", tr("create.pvPhobias"), d.phobias || "")}
    </div>`;
  }
}

/* ── AI Avatar generation ─────────────────────── */

async function loadGenerationOptions() {
  if (cachedAppearanceOptions) return;
  try {
    const [appearance, pose, scene, camera] = await Promise.all([
      getAppearanceOptions(),
      getPoseOptions(),
      getSceneOptions(),
      getCameraOptions(),
    ]);
    cachedAppearanceOptions = appearance;
    cachedPoseOptions = pose;
    cachedSceneOptions = scene;
    cachedCameraOptions = camera;
  } catch { /* ignore — will use basic prompt */ }
}

function pickRandomPrompts(): string[] {
  const pick = <T,>(arr: T[]): T | undefined => arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
  const prompts: string[] = [];

  if (cachedAppearanceOptions) {
    const allOutfits = cachedAppearanceOptions.OUTFITS.flatMap(c => c.options);
    const outfit = pick(allOutfits);
    if (outfit?.prompt) prompts.push(outfit.prompt);
  }

  if (cachedPoseOptions) {
    const expressions = cachedPoseOptions.FACIAL_EXPRESSION.flatMap(c => c.options);
    const expr = pick(expressions);
    if (expr?.prompt) prompts.push(expr.prompt);

    const poses = cachedPoseOptions.POSE.flatMap(c => c.options);
    const pose = pick(poses);
    if (pose?.prompt) prompts.push(pose.prompt);
  }

  if (cachedSceneOptions) {
    const locations = cachedSceneOptions.LOCATION.flatMap(c => c.options);
    const loc = pick(locations);
    if (loc?.prompt) prompts.push(loc.prompt);
  }

  if (cachedCameraOptions) {
    const framings = cachedCameraOptions.FRAMING;
    const framing = pick(framings);
    if (framing?.prompt) prompts.push(framing.prompt);
  }

  return prompts;
}

function buildAvatarPrompt(d: ReturnType<typeof collectFormData>, extraPrompts: string[] = []): string {
  const parts = [
    d.style === "Anime" ? "anime style" : "photorealistic",
    d.gender?.toLowerCase() ?? "female",
    d.age ? `${d.age} years old` : "",
    d.fantasyRacePrompt || d.fantasyRace || d.ethnicityPrompt || d.ethnicity || "",
    d.hairColor ? `${d.hairColor} hair` : "",
    d.hairStylePrompt || (d.hairStyle ? `${d.hairStyle} hairstyle` : ""),
    d.eyeColor ? `${d.eyeColor} eyes` : "",
    d.bodyTypePrompt || (d.bodyType ? `${d.bodyType} body` : ""),
    ...extraPrompts,
    "beautiful, high quality, detailed",
  ].filter(Boolean);
  return parts.join(", ");
}

function pollForAvatarResult(jobId: string) {
  if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }

  const checkJob = async () => {
    try {
      const status = await getJobStatus(jobId);
      if (status.status === "completed" && (status.output as any)?.url) {
        if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }
        previewImageUrl = (status.output as any).url;
        const img = document.getElementById("s9-avatar-img") as HTMLImageElement | null;
        const spinner = document.getElementById("s9-avatar-spinner");
        const regenBtn = document.getElementById("s9-regen-btn");
        const submitBtn = document.getElementById("btn-submit");
        if (img) { img.src = previewImageUrl!; img.style.display = "block"; }
        if (spinner) spinner.style.display = "none";
        if (regenBtn) regenBtn.removeAttribute("disabled");
        if (submitBtn) submitBtn.classList.remove("disabled");
        saveFormState(9);
      } else if (status.status === "failed") {
        if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }
        const spinner = document.getElementById("s9-avatar-spinner");
        const regenBtn = document.getElementById("s9-regen-btn");
        if (spinner) spinner.style.display = "none";
        if (regenBtn) regenBtn.removeAttribute("disabled");
      }
    } catch { /* ignore */ }
  };

  checkJob();
  previewPollInterval = setInterval(checkJob, 2500);
}

async function startAvatarGeneration() {
  avatarGenerated = true;
  const data = collectFormData();
  // Don't await — use cached options if available, load in background for next time
  loadGenerationOptions();
  const extraPrompts = pickRandomPrompts();
  const prompt = buildAvatarPrompt(data, extraPrompts);

  const img = document.getElementById("s9-avatar-img") as HTMLImageElement | null;
  const spinner = document.getElementById("s9-avatar-spinner");
  const regenBtn = document.getElementById("s9-regen-btn");
  const submitBtn = document.getElementById("btn-submit");
  if (img) { img.style.display = "none"; }
  if (spinner) { spinner.style.display = "flex"; }
  if (regenBtn) { regenBtn.setAttribute("disabled", "true"); }
  if (submitBtn) { submitBtn.classList.add("disabled"); }

  if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }

  try {
    const jobPayload: Parameters<typeof createImageJob>[0] = { prompt };
    if (data.generationStyle) {
      jobPayload.provider = "civitai";
      jobPayload.generationStyle = data.generationStyle;
    }
    const job = await createImageJob(jobPayload);
    lastAvatarJobId = job.jobId;
    if (generationContextStartFn) {
      generationContextStartFn(job.jobId, "image", prompt, data.generationStyle || "default", "character-creation");
    }
    saveFormState(9);
    previewPollInterval = setInterval(async () => {
      try {
        const status = await getJobStatus(job.jobId);
        if (status.status === "completed" && (status.output as any)?.url) {
          clearInterval(previewPollInterval!);
          previewPollInterval = null;
          previewImageUrl = (status.output as any).url;
          // Re-query DOM elements each poll (they may have been re-created)
          const curImg = document.getElementById("s9-avatar-img") as HTMLImageElement | null;
          const curSpinner = document.getElementById("s9-avatar-spinner");
          const curRegen = document.getElementById("s9-regen-btn");
          const curSubmit = document.getElementById("btn-submit");
          if (curImg) { curImg.src = previewImageUrl!; curImg.style.display = "block"; }
          if (curSpinner) curSpinner.style.display = "none";
          if (curRegen) curRegen.removeAttribute("disabled");
          if (curSubmit) curSubmit.classList.remove("disabled");
          saveFormState(9);
        } else if (status.status === "failed") {
          clearInterval(previewPollInterval!);
          previewPollInterval = null;
          const curSpinner = document.getElementById("s9-avatar-spinner");
          const curRegen = document.getElementById("s9-regen-btn");
          if (curSpinner) curSpinner.style.display = "none";
          if (curRegen) curRegen.removeAttribute("disabled");
        }
      } catch { /* ignore poll errors */ }
    }, 2500);
  } catch {
    if (spinner) spinner.style.display = "none";
    if (regenBtn) regenBtn.removeAttribute("disabled");
  }
}

/* ── Stage navigation logic ───────────────────── */


function goToStage(n: number) {
  document.querySelectorAll(".stage-content").forEach((el) => el.classList.remove("active"));
  document.getElementById(`stage-${pad(n)}-content`)?.classList.add("active");

  for (let i = 1; i <= 9; i++) {
    const icon = document.getElementById(`stage-${pad(i)}-icon`);
    const textEl = document.getElementById(`stage-${pad(i)}-text`);
    const nameEl = document.getElementById(`stage-${pad(i)}-name`);
    const loader = document.getElementById(`stage-${pad(i)}-loader`);
    if (!icon) continue;

    if (i < n) {
      icon.className = "stage-icon-completed";
      icon.innerHTML = CHECK_SVG;
      if (nameEl) nameEl.style.textDecoration = "line-through";
      if (textEl) textEl.classList.remove("with-desc");
      const desc = document.getElementById(`stage-${pad(i)}-desc`);
      if (desc) desc.style.display = "none";
      if (loader) loader.style.display = "none";
    } else if (i === n) {
      icon.className = "stage-icon-active";
      const svg = STAGE_ICONS[i].replace(/__CLR__/g, "white");
      icon.innerHTML = `<div class="icon-content"><svg width="16" height="16" viewBox="0 0 16 16" fill="none">${svg}</svg></div>`;
      if (nameEl) nameEl.style.textDecoration = "none";
      if (textEl) textEl.classList.add("with-desc");
      let desc = document.getElementById(`stage-${pad(i)}-desc`);
      if (!desc) {
        desc = document.createElement("div");
        desc.className = "stage-desc";
        desc.id = `stage-${pad(i)}-desc`;
        desc.textContent = tr("create.facialDesc");
        textEl?.appendChild(desc);
      } else {
        desc.style.display = "";
      }
      if (loader) loader.style.display = "none";
    } else {
      icon.className = "stage-icon-inactive";
      const svg = STAGE_ICONS[i].replace(/__CLR__/g, "#969696");
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">${svg}</svg>`;
      if (nameEl) nameEl.style.textDecoration = "none";
      if (textEl) textEl.classList.remove("with-desc");
      const desc = document.getElementById(`stage-${pad(i)}-desc`);
      if (desc) desc.style.display = "none";
      if (loader) loader.style.display = "";
    }
  }

  for (let i = 1; i < 9; i++) {
    const sep = document.getElementById(`sep-${pad(i)}-${pad(i + 1)}`);
    if (sep) sep.innerHTML = n > i ? '<div class="stage-sep-line pink"></div>' : '<div class="stage-sep-line gray"></div>';
  }

  // Update mobile dots
  for (let i = 1; i <= 9; i++) {
    const dot = document.getElementById(`mdot-${pad(i)}`);
    if (!dot) continue;
    dot.className = `mobile-dot${i === n ? " active" : i < n ? " done" : ""}`;
  }

  initInteractive();
  if (n === 9) {
    populatePreview();
    if (previewImageUrl) {
      const img = document.getElementById("s9-avatar-img") as HTMLImageElement | null;
      const spinner = document.getElementById("s9-avatar-spinner");
      const regenBtn = document.getElementById("s9-regen-btn");
      const submitBtn = document.getElementById("btn-submit");
      if (img) { img.src = previewImageUrl; img.style.display = "block"; }
      if (spinner) spinner.style.display = "none";
      if (regenBtn) regenBtn.removeAttribute("disabled");
      if (submitBtn) submitBtn.classList.remove("disabled");
    } else if (!avatarGenerated) {
      startAvatarGeneration();
    }
  }
  saveFormState(n);
}

/* ── Interactive handlers ─────────────────────── */

function initInteractive() {
  // Card grids — single select per grid
  document.querySelectorAll<HTMLElement>(".ethnicity-grid").forEach((grid) => {
    grid.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
      card.onclick = () => {
        grid.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        grid.classList.remove("field-error-ring");
      };
    });
  });

  // Style cards
  document.querySelectorAll<HTMLElement>(".style-row").forEach((row) => {
    row.querySelectorAll<HTMLElement>(".style-card").forEach((card) => {
      card.onclick = () => {
        row.querySelectorAll(".style-card").forEach((c) => { c.classList.remove("selected"); c.classList.add("unselected"); });
        card.classList.remove("unselected");
        card.classList.add("selected");
      };
    });
  });

  // Voice buttons
  document.querySelectorAll<HTMLElement>(".voice-btn").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".voice-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    };
  });

  // Personality cards
  document.querySelectorAll<HTMLElement>(".personality-grid").forEach((grid) => {
    grid.querySelectorAll<HTMLElement>(".personality-card").forEach((card) => {
      card.onclick = () => {
        grid.querySelectorAll(".personality-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        grid.classList.remove("field-error-ring");
      };
    });
  });

  // Tag chips — multi-select
  document.querySelectorAll<HTMLElement>(".tags-wrap").forEach((wrap) => {
    wrap.querySelectorAll<HTMLElement>(".tag-chip").forEach((chip) => {
      chip.onclick = () => {
        chip.classList.toggle("selected");
        wrap.classList.remove("field-error-ring");
      };
    });
  });

  // Preview tab switching
  document.querySelectorAll<HTMLElement>(".preview-tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".preview-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".preview-tab-content").forEach((c) => c.classList.remove("active"));
      const id = tab.dataset.tab;
      if (id) document.getElementById(id)?.classList.add("active");
    };
  });

  // Regenerate avatar button (use onclick to avoid stacking handlers)
  const regenBtnEl = document.getElementById("s9-regen-btn");
  if (regenBtnEl) {
    regenBtnEl.onclick = (e) => {
      e.stopPropagation();
      startAvatarGeneration();
    };
  }
}

/* ── Component ────────────────────────────────── */

export default function CreateCharacterPage() {
  const { user, loading } = useAuth();
  const { t } = useT();
  tr = t; // keep the module-level translator in sync for the HTML builders
  const router = useRouter();
  const initRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [premiumPopup, setPremiumPopup] = useState<{ limitType: PremiumLimitType; limit: number; used: number } | null>(null);
  const premiumPopupRef = useRef(setPremiumPopup);
  premiumPopupRef.current = setPremiumPopup;
  const { startGeneration } = useGeneration();
  const startGenRef = useRef(startGeneration);
  startGenRef.current = startGeneration;

  useEffect(() => {
    if (!user || initRef.current) return;
    initRef.current = true;

    // Set HTML content via ref — React will never touch this DOM on re-renders
    if (containerRef.current) {
      containerRef.current.innerHTML = buildContent();
    }

    // Bridge GenerationContext to module-level functions
    generationContextStartFn = startGenRef.current;

    // Pre-load generation options (appearance, pose, scene, camera) so they're cached before Stage 09
    loadGenerationOptions();

    // Load dynamic options from DB
    getCharacterOptions().then((allOpts) => {
      // STYLE cards
      const dbStyles = allOpts.filter((o) => o.category === "STYLE").sort((a, b) => a.order - b.order);
      if (dbStyles.length > 0) {
        const styleContainer = document.getElementById("style-row-container");
        if (styleContainer) {
          styleContainer.innerHTML = dbStyles.map((s, i) => {
            const src = s.imageThumbUrl || s.imageUrl;
            const imgHtml = src
              ? `<img src="${src}" alt="${s.name}" class="style-card-img" loading="lazy" decoding="async" />`
              : "";
            return `<div class="style-card ${i === 0 ? "selected" : "unselected"}" data-value="${s.name}" data-generation-style="${s.generationStyle || ""}">
              ${imgHtml}<span class="name">${s.name}</span></div>`;
          }).join("");
          styleContainer.querySelectorAll<HTMLElement>(".style-card").forEach((card) => {
            card.onclick = () => {
              styleContainer.querySelectorAll(".style-card").forEach((c) => { c.classList.remove("selected"); c.classList.add("unselected"); });
              card.classList.remove("unselected");
              card.classList.add("selected");
            };
          });
        }
      }

      // HUMAN_RACE -> ethnicity (Stage 02)
      const humanRaceOpts = allOpts.filter((o) => o.category === "HUMAN_RACE").sort((a, b) => a.order - b.order);
      if (humanRaceOpts.length > 0) {
        populateImageCards("ethnicity-grid-container", humanRaceOpts);
      } else {
        // Fallback to hardcoded
        const fallbackContainer = document.getElementById("ethnicity-grid-container");
        if (fallbackContainer) {
          fallbackContainer.innerHTML = ETHNICITIES.map((v) => `<div class="ethnicity-card" data-value="${v}"><span class="card-name">${v}</span></div>`).join("");
          fallbackContainer.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
            card.onclick = () => {
              fallbackContainer.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
              card.classList.add("selected");
              fallbackContainer.classList.remove("field-error-ring");
            };
          });
        }
      }

      // FANTASY_RACE -> fantasyRace (Stage 02, optional). Показываем секцию
      // только если в админке заведены фэнтези-расы — как на странице генерации.
      const fantasyRaceOpts = allOpts.filter((o) => o.category === "FANTASY_RACE").sort((a, b) => a.order - b.order);
      if (fantasyRaceOpts.length > 0) {
        const section = document.getElementById("fantasy-race-section");
        if (section) section.style.display = "";
        populateImageCards("fantasy-race-grid-container", fantasyRaceOpts);
        // Взаимоисключение: выбор фэнтези-расы снимает выбор обычной этничности и наоборот.
        const ethGrid = document.getElementById("ethnicity-grid-container");
        const fanGrid = document.getElementById("fantasy-race-grid-container");
        fanGrid?.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
          card.addEventListener("click", () => {
            ethGrid?.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
          });
        });
        ethGrid?.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
          card.addEventListener("click", () => {
            fanGrid?.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
          });
        });
      }

      // HAIR_STYLE -> hairStyle (Stage 03)
      const hairStyleOpts = allOpts.filter((o) => o.category === "HAIR_STYLE").sort((a, b) => a.order - b.order);
      if (hairStyleOpts.length > 0) {
        populateImageCards("hairstyle-grid-container", hairStyleOpts);
      } else {
        const fallbackContainer = document.getElementById("hairstyle-grid-container");
        if (fallbackContainer) {
          fallbackContainer.innerHTML = HAIR_STYLES.map((v) => `<div class="ethnicity-card" data-value="${v}"><span class="card-name">${v}</span></div>`).join("");
          fallbackContainer.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
            card.onclick = () => {
              fallbackContainer.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
              card.classList.add("selected");
              fallbackContainer.classList.remove("field-error-ring");
            };
          });
        }
      }

      // BODY_TYPE -> bodyType (Stage 04)
      const bodyTypeOpts = allOpts.filter((o) => o.category === "BODY_TYPE").sort((a, b) => a.order - b.order);
      if (bodyTypeOpts.length > 0) {
        populateImageCards("bodytype-grid-container", bodyTypeOpts);
      } else {
        const fallbackContainer = document.getElementById("bodytype-grid-container");
        if (fallbackContainer) {
          fallbackContainer.innerHTML = BODY_TYPES.map((v) => `<div class="ethnicity-card" data-value="${v}"><span class="card-name">${v}</span></div>`).join("");
          fallbackContainer.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
            card.onclick = () => {
              fallbackContainer.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
              card.classList.add("selected");
              fallbackContainer.classList.remove("field-error-ring");
            };
          });
        }
      }
      // Restore saved form state after all DB grids are populated
      restoreFormState();
    }).catch(() => {
      // Even on failure, try to restore
      restoreFormState();
    });

    // Dropdowns
    document.querySelectorAll<HTMLElement>(".dropdown-container").forEach((container) => {
      const btn = container.querySelector<HTMLElement>(".dropdown-btn");
      const menu = container.querySelector<HTMLElement>(".dropdown-menu");
      const valEl = container.querySelector<HTMLElement>(".val");
      btn?.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll<HTMLElement>(".dropdown-menu.open").forEach((m) => { if (m !== menu) m.classList.remove("open"); });
        menu?.classList.toggle("open");
      });
      menu?.querySelectorAll<HTMLElement>(".dropdown-option").forEach((opt) => {
        opt.addEventListener("click", () => {
          if (valEl) valEl.textContent = opt.dataset.value!;
          container.dataset.selected = opt.dataset.value!;
          menu.classList.remove("open");
        });
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-menu.open").forEach((m) => m.classList.remove("open"));
    });

    // Age slider
    const track = document.querySelector<HTMLElement>(".slider-track");
    const fill = document.querySelector<HTMLElement>(".slider-fill");
    const tooltip = document.querySelector<HTMLElement>(".slider-tooltip");
    if (track && fill && tooltip) {
      let dragging = false;
      const update = (pct: number) => {
        pct = Math.max(0, Math.min(1, pct));
        const val = Math.round(18 + pct * 82);
        fill.style.width = pct * 100 + "%";
        tooltip.textContent = String(val);
        track.dataset.value = String(val);
      };
      update((25 - 18) / 82);
      const thumb = document.querySelector<HTMLElement>(".slider-thumb");
      thumb?.addEventListener("mousedown", (e) => { e.preventDefault(); dragging = true; });
      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const rect = track.getBoundingClientRect();
        update((e.clientX - rect.left) / rect.width);
      });
      document.addEventListener("mouseup", () => { dragging = false; });
      track.addEventListener("click", (e) => {
        const rect = track.getBoundingClientRect();
        update((e.clientX - rect.left) / rect.width);
      });
    }

    // Clear name validation on input
    document.getElementById("input-name")?.addEventListener("input", () => {
      document.getElementById("input-name")?.classList.remove("field-error-ring");
    });

    // Navigation buttons (validate before forward navigation)
    document.querySelectorAll<HTMLElement>("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = parseInt(btn.dataset.goto!);
        if (isNaN(target)) return;

        const activeStage = document.querySelector(".stage-content.active");
        const currentStageNum = activeStage
          ? parseInt(activeStage.id.replace("stage-", "").replace("-content", ""))
          : 0;

        if (target > currentStageNum) {
          const result = validateStage(currentStageNum);
          if (!result.valid) {
            showValidationErrors(currentStageNum, result.errors);
            return;
          }
          clearValidationErrors(currentStageNum);
        }

        goToStage(target);
      });
    });

    // Generate Random buttons
    document.querySelectorAll<HTMLElement>(".btn-generate").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("disabled")) return;
        const stageEl = btn.closest<HTMLElement>(".stage-content");
        if (!stageEl) return;
        const stageNum = parseInt(stageEl.id.replace("stage-", "").replace("-content", ""));
        if (!isNaN(stageNum)) randomizeStage(stageNum);
      });
    });

    // Reset buttons
    document.querySelectorAll<HTMLElement>(".btn-reset").forEach((btn) => {
      btn.addEventListener("click", () => {
        localStorage.removeItem(DRAFT_LS_KEY);
        previewImageUrl = null;
        avatarGenerated = false;
        lastAvatarJobId = null;
        if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }
        window.location.href = "/create";
      });
    });

    // Submit
    document.getElementById("btn-submit")?.addEventListener("click", async () => {
      const submitBtn = document.getElementById("btn-submit");
      if (!submitBtn || submitBtn.classList.contains("disabled")) return;
      submitBtn.classList.add("disabled");
      submitBtn.textContent = "Creating...";
      try {
        const data = collectFormData();
        // Remove prompt fields — they're only used for image generation, not character creation API.
        // fantasyRace мапится в поле ethnicity (бэк нормализует elf/demon/… как ethnicity).
        const { ethnicityPrompt, hairStylePrompt, bodyTypePrompt, fantasyRace, fantasyRacePrompt, ...charData } = data;
        const newChar = await characters.create({
          ...charData,
          ethnicity: fantasyRace || charData.ethnicity,
          avatarUrl: previewImageUrl ?? undefined,
        });
        localStorage.removeItem(DRAFT_LS_KEY);
        const newChat = await chats.create(newChar.id);
        router.push(`/chat?sessionId=${newChat.id}`);
      } catch (err: unknown) {
        submitBtn.classList.remove("disabled");
        submitBtn.textContent = "Bring to Life";
        if (err instanceof ApiError && err.body?.error === "FREE_LIMIT_REACHED") {
          premiumPopupRef.current({
            limitType: err.body.limitType as PremiumLimitType,
            limit: err.body.limit,
            used: err.body.used,
          });
        } else {
          const msg = err instanceof Error ? err.message : "Failed to create character";
          alert(msg);
        }
      }
    });

    initInteractive();

    // Cleanup on unmount
    return () => {
      if (previewPollInterval) {
        clearInterval(previewPollInterval);
        previewPollInterval = null;
      }
      generationContextStartFn = null;
    };
  }, [user, router]);

  if (loading) return null;
  if (!user) { router.push("/login"); return null; }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="create-content" ref={containerRef} />
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
