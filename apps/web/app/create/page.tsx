"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/auth";
import { characters } from "../../lib/api";
import { PAGE_CSS } from "./styles";
import {
  GENDERS, ORIENTATIONS, NATIONALITIES, LANGUAGES, ETHNICITIES, VOICES,
  EYE_COLORS, HAIR_STYLES, HAIR_COLORS, BODY_TYPES, BREAST_SIZES, BUTT_SIZES,
  RELATIONSHIP_TYPES, FAMILY_STATUSES, LIFESTYLES, WORKS, HOBBIES,
  KINKS_1, KINKS_2, KINKS_3, STYLES, PERSONALITIES, STAGE_NAMES, STAGE_ICONS,
  CHEVRON_SVG, GENERATE_BTN_SVG, VOICE_ICON_SVG, CHECK_SVG, LOADER_SVG, PREMIUM_BADGE_SVG,
} from "./data";

/* ── HTML Builders ────────────────────────────── */

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

function chips(field: string, items: string[]) {
  return `<div class="tags-wrap" data-field="${field}">${items.map((v) => `<div class="tag-chip" data-value="${v}">${v}</div>`).join("")}</div>`;
}

function stageHeader(num: number, title: string, genDisabled = false) {
  return `<div class="form-header"><div class="stage-info"><div class="stage-label">Stage ${pad(num)}</div>
    <div class="stage-title">${title}</div></div>
    <div class="btn-generate${genDisabled ? " disabled" : ""}">${GENERATE_BTN_SVG}<span>Generate Random</span></div></div><div class="form-sep"></div>`;
}

function navButtons(prev: number, next: number | "submit") {
  const right = next === "submit"
    ? `<div class="btn-bring-to-life" id="btn-submit">Bring to Life</div>`
    : `<div class="btn-continue" data-goto="${next}">Continue</div>`;
  return `<div class="buttons-row"><div class="btn-cancel" data-goto="${prev}">Cancel</div>${right}</div>`;
}

/* ── Stage HTML ───────────────────────────────── */

function stage01() {
  return `<div class="stage-content active" id="stage-01-content">
    ${stageHeader(1, "Basic parameters")}
    <div class="dropdown-row">${dropdown("gender", "Gender", GENDERS, "Female")}${dropdown("orientation", "Orientation", ORIENTATIONS, "Heterosexual")}</div>
    <div class="field"><div class="field-label">Name</div><input type="text" class="input-text" id="input-name" placeholder="Enter character name" value=""></div>
    <div class="field"><div class="field-label">Surname</div><input type="text" class="input-text" id="input-surname" placeholder="Choose a surname for your character"></div>
    <div class="field-age"><div class="field-label">Age</div>
      <div class="slider-container"><span class="slider-min">18</span>
        <div class="slider-track" data-value="25"><div class="slider-fill"><div class="slider-thumb"><div class="slider-tooltip">25</div></div></div></div>
        <span class="slider-max">100</span></div></div>
    <div class="field-style"><div class="field-label">Style</div>
      <div class="style-row">${STYLES.map((s, i) => `<div class="style-card ${i === 0 ? "selected" : "unselected"}" data-value="${s}"><span class="name">${s}</span></div>`).join("")}</div></div>
    ${navButtons(1, 2)}
  </div>`;
}

function stage02() {
  return `<div class="stage-content" id="stage-02-content">
    ${stageHeader(2, "Origin")}
    <div class="dropdown-row">${dropdown("nationality", "Nationality", NATIONALITIES, "American")}${dropdown("language", "Language", LANGUAGES, "English")}</div>
    <div class="ethnicity-section"><div class="field-label">Ethnicity</div>${cardGrid("ethnicity", ETHNICITIES)}</div>
    <div class="voice-section"><div class="field-label">Voice</div>
      <div class="voice-row">${VOICES.map((v, i) => `<div class="voice-btn${i === 0 ? " selected" : ""}" data-value="${v}">${VOICE_ICON_SVG}<span>${v}</span></div>`).join("")}</div></div>
    ${navButtons(1, 3)}
  </div>`;
}

function stage03() {
  return `<div class="stage-content" id="stage-03-content">
    ${stageHeader(3, "Facial")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">Eye color</div>${cardGrid("eyeColor", EYE_COLORS, true)}</div>
      <div class="ethnicity-section"><div class="field-label">Hair style</div>${cardGrid("hairStyle", HAIR_STYLES, true)}</div>
      <div class="ethnicity-section"><div class="field-label">Hair color</div>${cardGrid("hairColor", HAIR_COLORS, true)}</div>
    </div>
    ${navButtons(2, 4)}
  </div>`;
}

function stage04() {
  return `<div class="stage-content" id="stage-04-content">
    ${stageHeader(4, "Body type")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">Body type</div>${cardGrid("bodyType", BODY_TYPES, true)}</div>
      <div class="ethnicity-section"><div class="field-label">Breast size</div>${cardGrid("breastSize", BREAST_SIZES, true)}</div>
      <div class="ethnicity-section"><div class="field-label">Butt size</div>${cardGrid("buttSize", BUTT_SIZES, true)}</div>
    </div>
    ${navButtons(3, 5)}
  </div>`;
}

function stage05() {
  const persCards = PERSONALITIES.map((p) =>
    `<div class="personality-card" data-value="${p.name}"><div class="p-icon">${p.icon}</div><div class="p-title">${p.name}</div><div class="p-desc">${p.desc}</div></div>`
  ).join("");
  return `<div class="stage-content" id="stage-05-content">
    ${stageHeader(5, "Personality")}
    <div class="dropdown-row">${dropdown("relationshipType", "Relationships type", RELATIONSHIP_TYPES, "Girlfriend")}${dropdown("familyStatus", "Family status", FAMILY_STATUSES, "Single")}</div>
    <div class="personality-scroll"><div class="field-label">Personality</div><div class="personality-grid">${persCards}</div></div>
    ${navButtons(4, 6)}
  </div>`;
}

function stage06() {
  return `<div class="stage-content" id="stage-06-content">
    ${stageHeader(6, "Lifestyle")}
    <div class="facial-scroll">
      <div class="ethnicity-section"><div class="field-label">Lifestyle</div>${cardGrid("lifestyle", LIFESTYLES, true)}</div>
      <div class="tags-section"><div class="field-label">Work</div>${chips("work", WORKS)}</div>
      <div class="tags-section"><div class="field-label">Hobby</div>${chips("hobbies", HOBBIES)}</div>
    </div>
    ${navButtons(5, 7)}
  </div>`;
}

function stage07() {
  return `<div class="stage-content" id="stage-07-content">
    ${stageHeader(7, "Kinks")}
    <div class="facial-scroll">
      <div class="tags-section"><div class="field-label">Kinks — Scenarios</div>${chips("kinks1", KINKS_1)}</div>
      <div class="tags-section"><div class="field-label">Kinks — Power dynamics</div>${chips("kinks2", KINKS_2)}</div>
      <div class="tags-section"><div class="field-label">Kinks — Sensory</div>${chips("kinks3", KINKS_3)}</div>
    </div>
    ${navButtons(6, 8)}
  </div>`;
}

function stage08() {
  return `<div class="stage-content" id="stage-08-content">
    ${stageHeader(8, "Memories", true)}
    <div class="facial-scroll">
      <div class="memory-field"><div class="memory-label">Childhood and adolescence ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-childhood" placeholder="Describe any childhood memory"></textarea></div>
      <div class="memory-field"><div class="memory-label">Memories and life story ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-lifestory" placeholder="Make a life story of your character"></textarea></div>
      <div class="memory-field"><div class="memory-label">Phobias ${PREMIUM_BADGE_SVG}</div>
        <textarea class="memory-textarea" id="memory-phobias" placeholder="Describe phobias"></textarea></div>
    </div>
    ${navButtons(7, 9)}
  </div>`;
}

function stage09() {
  return `<div class="stage-content" id="stage-09-content">
    <div class="form-header"><div class="stage-info"><div class="stage-label">Stage 09</div><div class="stage-title">Final preview</div></div></div>
    <div class="form-sep"></div>
    <div style="display:flex;gap:12px;align-items:center;flex-shrink:0">
      <div style="font-weight:700;font-size:20px;color:#fff" id="preview-name">Character</div>
      <div style="font-weight:500;font-size:16px;color:#969696" id="preview-age">25 yo</div>
    </div>
    <div class="preview-tabs">
      <div class="preview-tab active" data-tab="tab-appearance">Appearance</div>
      <div class="preview-tab" data-tab="tab-personality">Personality</div>
      <div class="preview-tab" data-tab="tab-memories">Memories</div>
    </div>
    <div class="preview-tab-content active" id="tab-appearance"></div>
    <div class="preview-tab-content" id="tab-personality"></div>
    <div class="preview-tab-content" id="tab-memories"></div>
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
      ? `<div class="stage-desc" id="stage-${pad(i)}-desc">Here you can choose how your character's face will look, including the color and shape of the eyes, hairstyle and hair length</div>`
      : "";
    const textClass = isActive ? "stage-text with-desc" : "stage-text";
    html += `<div class="progress-stage" id="stage-${pad(i)}-progress">
      <div class="${iconClass}" id="stage-${pad(i)}-icon">${iconContent}</div>
      <div class="${textClass}" id="stage-${pad(i)}-text">
        <div class="header"><div class="stage-number">Stage ${pad(i)}</div>
        <div class="stage-name" id="stage-${pad(i)}-name">${STAGE_NAMES[i - 1]}</div></div>${desc}
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

function buildContent() {
  return `<div class="breadcrumb">Create Character</div>
    <div class="page-title"><span class="pink">Create </span>Your Character</div>
    <div class="form-card">${stage01()}${stage02()}${stage03()}${stage04()}${stage05()}${stage06()}${stage07()}${stage08()}${stage09()}</div>
    ${stagesPanel()}`;
}

/* ── Collect form data from DOM ───────────────── */

function collectFormData() {
  const sel = (f: string) => document.querySelector<HTMLElement>(`[data-field="${f}"]`)?.dataset?.selected;
  const card = (f: string) => document.querySelector<HTMLElement>(`.ethnicity-grid[data-field="${f}"] .ethnicity-card.selected`)?.dataset?.value;
  const chipVals = (f: string) => Array.from(document.querySelectorAll<HTMLElement>(`.tags-wrap[data-field="${f}"] .tag-chip.selected`)).map((c) => c.dataset.value!);
  const pers = () => document.querySelector<HTMLElement>(".personality-card.selected")?.dataset?.value;
  const voice = () => document.querySelector<HTMLElement>(".voice-btn.selected")?.querySelector("span")?.textContent?.trim();
  const style = () => document.querySelector<HTMLElement>(".style-card.selected")?.dataset?.value;

  return {
    name: (document.getElementById("input-name") as HTMLInputElement)?.value || "Character",
    surname: (document.getElementById("input-surname") as HTMLInputElement)?.value || undefined,
    age: parseInt(document.querySelector<HTMLElement>(".slider-track")?.dataset?.value || "25"),
    gender: sel("gender") || "Female",
    orientation: sel("orientation") || "Heterosexual",
    style: style() || "Realistic",
    nationality: sel("nationality"),
    language: sel("language"),
    ethnicity: card("ethnicity"),
    voice: voice(),
    eyeColor: card("eyeColor"),
    hairStyle: card("hairStyle"),
    hairColor: card("hairColor"),
    bodyType: card("bodyType"),
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

/* ── Populate stage-09 preview ────────────────── */

function row(icon: string, label: string, value: string) {
  return `<div class="pers-row"><div class="pers-row-icon">${icon}</div><div class="pers-row-text"><span class="pers-row-label">${label}</span><span class="pers-row-value">${value || "Not set"}</span></div></div>`;
}

function populatePreview() {
  const d = collectFormData();
  const nameEl = document.getElementById("preview-name");
  const ageEl = document.getElementById("preview-age");
  if (nameEl) nameEl.textContent = d.surname ? `${d.name} ${d.surname}` : d.name;
  if (ageEl) ageEl.textContent = `${d.age} yo`;

  const app = document.getElementById("tab-appearance");
  if (app) app.innerHTML = `<div class="pers-list">${row("\u{1F50A}", "Voice", d.voice || "")
    }${row("\u{1F487}", "Hair Style", d.hairStyle || "")
    }${row("\u{1F3A8}", "Hair Color", d.hairColor || "")
    }${row("\u{1F441}", "Eye Color", d.eyeColor || "")
    }${row("\u{1F3CB}", "Body Type", d.bodyType || "")
    }${row("\u{1F30D}", "Ethnicity", d.ethnicity || "")
    }${row("\u{1F459}", "Breast Size", d.breastSize || "")
    }${row("\u{1F351}", "Butt Size", d.buttSize || "")}</div>`;

  const per = document.getElementById("tab-personality");
  if (per) per.innerHTML = `<div class="pers-list">${row("\u{1F4AC}", "Personality", d.personality || "")
    }${row("\u{1F3E0}", "Lifestyle", d.lifestyle || "")
    }${row("\u{1F491}", "Relationship", d.relationshipType || "")
    }${row("\u{1F46A}", "Family Status", d.familyStatus || "")
    }${row("\u{1F4BC}", "Work", d.work?.join(", ") || "")
    }${row("\u{1F3AF}", "Hobbies", d.hobbies?.join(", ") || "")
    }${row("\u{1F525}", "Kinks", d.kinks?.join(", ") || "")}</div>`;

  const mem = document.getElementById("tab-memories");
  if (mem) mem.innerHTML = `<div class="pers-list">${row("\u{1F9D2}", "Childhood", d.childhoodMemory || "")
    }${row("\u{1F4D6}", "Life Story", d.lifeStory || "")
    }${row("\u{1F628}", "Phobias", d.phobias || "")}</div>`;
}

/* ── Stage navigation logic ───────────────────── */

const STAGE_DESC = "Here you can choose how your character's face will look, including the color and shape of the eyes, hairstyle and hair length";

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
        desc.textContent = STAGE_DESC;
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

  initInteractive();
  if (n === 9) populatePreview();
}

/* ── Interactive handlers ─────────────────────── */

function initInteractive() {
  // Card grids — single select per grid
  document.querySelectorAll<HTMLElement>(".ethnicity-grid").forEach((grid) => {
    grid.querySelectorAll<HTMLElement>(".ethnicity-card").forEach((card) => {
      card.onclick = () => {
        grid.querySelectorAll(".ethnicity-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
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
      };
    });
  });

  // Tag chips — multi-select
  document.querySelectorAll<HTMLElement>(".tags-wrap").forEach((wrap) => {
    wrap.querySelectorAll<HTMLElement>(".tag-chip").forEach((chip) => {
      chip.onclick = () => chip.classList.toggle("selected");
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
}

/* ── Component ────────────────────────────────── */

export default function CreateCharacterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const initRef = useRef(false);

  useEffect(() => {
    if (!user || initRef.current) return;
    initRef.current = true;

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

    // Navigation buttons
    document.querySelectorAll<HTMLElement>("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = parseInt(btn.dataset.goto!);
        if (!isNaN(target)) goToStage(target);
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
        await characters.create(data);
        router.push("/chat");
      } catch (err: unknown) {
        submitBtn.classList.remove("disabled");
        submitBtn.textContent = "Bring to Life";
        const msg = err instanceof Error ? err.message : "Failed to create character";
        alert(msg);
      }
    });

    initInteractive();
  }, [user, router]);

  if (loading) return <div style={{ color: "#aaa", padding: 40 }}>Loading...</div>;
  if (!user) {
    return (
      <div style={{ padding: 40 }}>
        <p style={{ color: "#aaa", marginBottom: 16 }}>Log in to create a character.</p>
        <a href="/login" style={{ color: "#f95bad", textDecoration: "none" }}>Log in</a>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <div className="create-content" dangerouslySetInnerHTML={{ __html: buildContent() }} />
    </>
  );
}
