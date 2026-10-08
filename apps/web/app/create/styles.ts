export const PAGE_CSS = `
  .create-content { min-height: calc(100vh - 46px); overflow: hidden; display: flex; flex-direction: column; align-items: center; padding: 20px 36px 0; }
  .create-header { width: 100%; max-width: 1172px; display: flex; flex-direction: column; gap: 4px; }
  .breadcrumb {
    font-weight: 500; font-size: 10px; color: #969696;
    text-transform: uppercase; line-height: 1.2;
  }
  .page-title {
    font-weight: 700; font-size: 32px; line-height: 1.1; padding-left: 238px;
  }
  .page-title .pink { color: #ff99ce; }
  .create-body { display: flex; gap: 38px; width: 100%; max-width: 1172px; margin-top: 16px; }
  .form-card {
    width: 934px; min-height: 668px; height: calc(100vh - 46px - 20px - 38px - 16px); background: #090909;
    border: 1px solid #313131; border-radius: 8px;
    display: flex; flex-direction: column; gap: 22px; padding: 24px; overflow: hidden;
  }
  .form-header { display: flex; gap: 4px; align-items: flex-start; width: 100%; flex-shrink: 0; }
  .form-header .stage-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .form-header .stage-label { font-weight: 500; font-size: 7px; color: #848484; text-transform: uppercase; line-height: 1.2; }
  .form-header .stage-title { font-weight: 700; font-size: 20px; color: #fff; line-height: 1.2; }
  .btn-generate {
    height: 30px; background: #121212; border: 1px solid #313131; border-radius: 4px;
    display: flex; gap: 8px; align-items: center; justify-content: center;
    padding: 8px 14px; cursor: pointer; flex-shrink: 0;
    font-weight: 500; font-size: 12px; color: #fff; white-space: nowrap;
  }
  .btn-generate .icon { width: 16px; height: 16px; }
  .header-actions { display: flex; gap: 8px; align-items: center; }
  .btn-reset {
    height: 30px; background: transparent; border: 1px solid #313131; border-radius: 4px;
    display: flex; gap: 8px; align-items: center; justify-content: center;
    padding: 8px 14px; cursor: pointer; flex-shrink: 0;
    font-weight: 500; font-size: 12px; color: #969696; white-space: nowrap;
  }
  .btn-reset:hover { color: #fff; border-color: #e36466; }
  .form-sep { width: 100%; height: 0; flex-shrink: 0; border-top: 1px solid #313131; }

  /* Fields */
  .field { display: flex; flex-direction: column; gap: 16px; width: 100%; flex-shrink: 0; }
  .field-label { font-weight: 500; font-size: 12px; color: #fff; line-height: 1.2; }
  .input-text {
    width: 100%; height: 30px; background: #1e1e1e;
    border: 1px solid #313131; border-radius: 6px;
    padding: 6px 12px; font-family: 'Syne', sans-serif;
    font-weight: 500; font-size: 10px; color: #fff; outline: none;
  }
  .input-text:focus { border-color: #f95bad; }
  .input-text::placeholder { color: #848484; }

  /* Age slider */
  .field-age { display: flex; flex-direction: column; gap: 22px; width: 100%; flex-shrink: 0; }
  .slider-container { display: flex; gap: 4px; align-items: center; width: 100%; }
  .slider-min, .slider-max { font-weight: 500; font-size: 10px; color: #969696; flex-shrink: 0; line-height: 1.2; }
  .slider-track { flex: 1; height: 4px; background: #313131; border-radius: 2px; position: relative; cursor: pointer; }
  .slider-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 8.5%; background: linear-gradient(to right, #c1f0aa, #f95bad); border-radius: 2px; }
  .slider-thumb { position: absolute; right: -6px; top: -4px; width: 12px; height: 12px; background: #fff; border-radius: 50%; cursor: pointer; }
  .slider-tooltip {
    position: absolute; top: -30px; left: 50%; transform: translateX(-50%);
    background: #252525; border: 1px solid #313131; border-radius: 4px; padding: 2px 8px;
    font-weight: 500; font-size: 10px; color: #fff; white-space: nowrap;
  }

  /* Style cards */
  .field-style { display: flex; flex-direction: column; gap: 16px; width: 100%; flex: 1; min-height: 0; }
  .style-row { display: flex; gap: 10px; width: 100%; }
  .style-card {
    flex: 1; height: 160px; border-radius: 8px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 12px; overflow: hidden; position: relative; cursor: pointer;
    background: #121212;
  }
  .style-card { transition: border-color .15s ease, box-shadow .2s ease, transform .15s ease; border: 1px solid #313131; }
  .style-card:hover { border-color: #5b5b5b; }
  .style-card.selected {
    border: 2px solid #f95bad;
    box-shadow: 0 0 0 3px rgba(249,91,173,0.18), 0 0 22px rgba(249,91,173,0.35);
    transform: translateY(-1px);
  }
  .style-card.unselected { border: 1px solid #313131; }
  .style-card.unselected .style-card-img { opacity: 0.35; filter: grayscale(0.35); }
  .style-card.selected::after, .ethnicity-card.selected:not(.color-card)::after, .personality-card.selected::after {
    content: ''; position: absolute; top: 8px; right: 8px; z-index: 2;
    width: 18px; height: 18px; border-radius: 50%;
    background: linear-gradient(135deg, #f95bad, #ff0084) center / 100% no-repeat;
    box-shadow: 0 0 10px rgba(249,91,173,0.6);
  }
  .style-card.selected::before, .ethnicity-card.selected:not(.color-card)::before, .personality-card.selected::before {
    content: ''; position: absolute; top: 13px; right: 12.5px; z-index: 3;
    width: 8px; height: 4.5px; border-left: 1.8px solid #fff; border-bottom: 1.8px solid #fff;
    transform: rotate(-45deg);
  }
  .style-card .name { position: relative; z-index: 1; font-weight: 700; font-size: 16px; color: #fff; text-align: center; width: 100%; }
  .style-card-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.5; z-index: 0; }
  .style-card.selected .style-card-img { opacity: 0.95; filter: none; }

  /* Buttons */
  .buttons-row { display: flex; gap: 8px; width: 100%; flex-shrink: 0; }
  .btn-cancel {
    flex: 1; height: 38px; background: #121212; border: 1px solid #313131; border-radius: 4px;
    display: flex; align-items: center; justify-content: center; padding: 10px 32px; cursor: pointer;
    font-weight: 500; font-size: 14px; color: #fff;
  }
  .btn-continue {
    flex: 1; height: 38px; background: linear-gradient(to right, #f95bad, #ff0084);
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
    padding: 10px 32px; cursor: pointer; font-weight: 500; font-size: 14px; color: #fff; border: none;
  }
  .btn-bring-to-life {
    flex: 1; height: 38px; background: linear-gradient(to right, #f95bad, #ff0084);
    border-radius: 4px; display: flex; align-items: center; justify-content: center;
    padding: 10px 32px; cursor: pointer; font-weight: 500; font-size: 14px; color: #fff; border: none;
  }
  .btn-bring-to-life.disabled { opacity: 0.5; pointer-events: none; }

  /* Dropdown containers */
  .dropdown-row { display: flex; gap: 4px; align-items: center; width: 100%; flex-shrink: 0; }
  .dropdown-container { position: relative; flex: 1; }
  .dropdown-btn {
    height: 30px; background: #1e1e1e; border-radius: 4px;
    display: flex; align-items: center; justify-content: space-between; padding: 7px 10px;
    overflow: hidden; cursor: pointer;
  }
  .dropdown-btn .text { display: flex; gap: 4px; align-items: center; font-weight: 500; font-size: 10px; white-space: nowrap; }
  .dropdown-btn .text .lbl { color: #969696; }
  .dropdown-btn .text .val { color: #fff; }
  .dropdown-btn .chevron { width: 16px; height: 16px; flex-shrink: 0; }
  .dropdown-menu {
    position: absolute; top: 100%; left: 0; right: 0;
    background: #1e1e1e; border: 1px solid #313131; border-radius: 0 0 4px 4px;
    z-index: 100; max-height: 200px; overflow-y: auto; display: none;
  }
  .dropdown-menu.open { display: block; }
  .dropdown-option { padding: 8px 10px; cursor: pointer; font-weight: 500; font-size: 10px; color: #fff; }
  .dropdown-option:hover { background: #252525; }
  .dropdown-menu::-webkit-scrollbar { width: 4px; }
  .dropdown-menu::-webkit-scrollbar-track { background: transparent; }
  .dropdown-menu::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }

  /* Ethnicity / card grids */
  .ethnicity-section { display: flex; flex-direction: column; gap: 16px; width: 100%; flex: 1; min-height: 0; }
  .ethnicity-grid { display: flex; gap: 10px; width: 100%; flex-wrap: wrap; overflow-y: auto; overflow-x: hidden; }
  .ethnicity-card {
    width: calc(20% - 8px); aspect-ratio: 1; border-radius: 8px; position: relative;
    display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;
    border: 1px solid #313131; background: #121212;
    transition: border-color .15s ease, box-shadow .2s ease, background .15s ease;
  }
  .ethnicity-card:hover { border-color: #5b5b5b; }
  .ethnicity-card.selected {
    border: 2px solid #f95bad; background: rgba(249,91,173,0.14);
    box-shadow: 0 0 0 3px rgba(249,91,173,0.18), 0 0 22px rgba(249,91,173,0.35);
  }
  .ethnicity-card.selected .card-name { color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,0.8); }
  .ethnicity-card .card-name { position: relative; z-index: 1; font-weight: 700; font-size: 14px; color: #fff; text-align: center; }
  .ethnicity-card-img {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: cover; opacity: 0.45; z-index: 0; border-radius: 8px;
    transition: opacity .15s ease;
  }
  .ethnicity-card:hover .ethnicity-card-img { opacity: 0.6; }
  .ethnicity-card.selected .ethnicity-card-img { opacity: 1; }
  .facial-grid { flex-wrap: wrap; overflow-x: hidden; overflow-y: hidden; }
  .facial-grid .ethnicity-card { width: calc(25% - 8px); flex-shrink: 0; }
  /* Цветовые плашки (Цвет глаз / Цвет волос) — как в генерации изображения. */
  .color-grid { gap: 8px; overflow: visible; }
  .color-card {
    width: auto; aspect-ratio: auto; flex: 0 0 auto;
    flex-direction: row; gap: 6px; padding: 6px 12px;
    border: 1px solid #3a3a3a; border-radius: 8px;
  }
  .color-card .color-dot {
    width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.15);
  }
  .color-card .card-name { font-size: 13px; font-weight: 500; color: #ccc; }
  .color-card.selected { border: 1px solid #f95bad; background: rgba(249,91,173,0.2); box-shadow: 0 0 14px rgba(249,91,173,0.35); }
  .color-card.selected .card-name { color: #fff; }
  .color-card.selected .color-dot { box-shadow: 0 0 0 2px #090909, 0 0 0 3.5px #f95bad; }

  /* Иконки вместо эмодзи */
  .ic { display: block; flex-shrink: 0; }
  .ic-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 50%; color: #fff; flex-shrink: 0;
    background: linear-gradient(135deg, rgba(249,91,173,0.28), rgba(255,0,132,0.12));
    border: 1px solid rgba(249,91,173,0.45);
  }
  .ic-gem {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; border-radius: 50%; color: #fff;
    background: linear-gradient(135deg, #f95bad, #ff0084);
  }

  /* Карточки с иконкой (образ жизни) */
  .icon-grid { gap: 8px; }
  .icon-card {
    width: calc(16.666% - 7px); aspect-ratio: auto; min-height: 84px;
    flex-direction: column; gap: 8px; padding: 12px 6px;
  }
  .icon-card .card-name { font-size: 11px; font-weight: 600; color: #ccc; }
  .icon-card.selected .card-name { color: #fff; }
  .icon-card.selected .ic-badge { background: linear-gradient(135deg, #f95bad, #ff0084); border-color: transparent; box-shadow: 0 0 12px rgba(249,91,173,0.6); }

  /* Поле «свой вариант» */
  .custom-input-row {
    display: flex; align-items: center; gap: 8px; width: 100%; max-width: 420px;
    height: 32px; margin-top: 8px; padding: 0 4px 0 10px;
    background: #121212; border: 1px dashed #3a3a3a; border-radius: 6px;
    transition: border-color .15s ease;
  }
  .custom-input-row:focus-within { border: 1px solid #f95bad; }
  .custom-input-icon { color: #969696; display: flex; }
  .custom-input {
    flex: 1; min-width: 0; background: transparent; border: none; outline: none;
    font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 500; color: #fff;
  }
  .custom-input::placeholder { color: #6b6b6b; }
  .custom-add-btn {
    display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px;
    border: none; border-radius: 4px; cursor: pointer; color: #fff;
    background: linear-gradient(to right, #f95bad, #ff0084);
    font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 600;
  }
  .tag-chip.custom { border-style: dashed; }
  .facial-scroll {
    display: flex; flex-direction: column; gap: 22px; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  }
  .facial-scroll .ethnicity-section { flex: none; }
  /* Внутри общей области скролла сетки не должны скроллиться отдельно —
     скроллится только сам .facial-scroll (актуально для Шага 2). */
  .facial-scroll .ethnicity-grid { overflow-y: visible; }

  /* Voice section */
  .voice-section { display: flex; flex-direction: column; gap: 16px; width: 100%; flex-shrink: 0; }
  .voice-row { display: flex; gap: 8px; width: 100%; }
  .voice-btn {
    flex: 1; height: 34px; background: #1e1e1e; border-radius: 4px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; font-weight: 500; font-size: 12px; color: #fff; border: 1px solid transparent;
  }
  .voice-btn.selected { background: rgba(249,91,173,0.16); border: 1px solid #f95bad; box-shadow: 0 0 10px rgba(249,91,173,0.3); }
  .voice-btn .voice-icon { width: 16px; height: 16px; flex-shrink: 0; }

  /* Personality grid */
  .personality-scroll { display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
  .personality-scroll::-webkit-scrollbar { width: 4px; }
  .personality-scroll::-webkit-scrollbar-track { background: transparent; }
  .personality-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
  .personality-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; width: 100%; }
  .personality-card {
    background: #121212; border: 1px solid #313131; border-radius: 8px; padding: 12px;
    display: flex; flex-direction: column; gap: 8px; cursor: pointer; min-height: 90px;
  }
  .personality-card { position: relative; transition: border-color .15s ease, box-shadow .2s ease, background .15s ease; }
  .personality-card:hover { border-color: #5b5b5b; }
  .personality-card.selected {
    border: 2px solid #f95bad; background: rgba(249,91,173,0.12);
    box-shadow: 0 0 0 3px rgba(249,91,173,0.15), 0 0 20px rgba(249,91,173,0.3);
  }
  .personality-card .p-icon {
    width: 28px; height: 28px; border-radius: 50%; color: #f95bad;
    background: rgba(249,91,173,0.12); border: 1px solid rgba(249,91,173,0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .personality-card.selected .p-icon { color: #fff; background: linear-gradient(135deg, #f95bad, #ff0084); border-color: transparent; }
  .personality-card.selected .p-desc { color: #d6d6d6; }
  .personality-card .p-title { font-weight: 700; font-size: 10px; color: #fff; line-height: 1.3; }
  .personality-card .p-desc { font-weight: 400; font-size: 8px; color: #969696; line-height: 1.3; }

  /* Tags / chips */
  .tags-section { display: flex; flex-direction: column; gap: 12px; width: 100%; flex-shrink: 0; }
  .tags-wrap { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
  .tag-chip {
    height: 28px; background: #1e1e1e; border: 1px solid #313131; border-radius: 4px;
    display: flex; align-items: center; justify-content: center; padding: 6px 14px;
    cursor: pointer; font-weight: 500; font-size: 10px; color: #fff; white-space: nowrap;
  }
  .tag-chip { transition: background .15s ease, border-color .15s ease; }
  .tag-chip:hover { border-color: #5b5b5b; }
  .tag-chip.selected {
    background: linear-gradient(to right, rgba(249,91,173,0.35), rgba(255,0,132,0.25));
    border-color: #f95bad; color: #fff; box-shadow: 0 0 10px rgba(249,91,173,0.3);
  }

  /* Memory textareas */
  .memory-field { display: flex; flex-direction: column; gap: 12px; width: 100%; flex-shrink: 0; }
  .memory-label {
    display: flex; align-items: center; gap: 6px;
    font-weight: 700; font-size: 12px; color: #fff; line-height: 1.2;
  }
  .memory-label .premium-badge {
    width: 18px; height: 18px;
    background: linear-gradient(135deg, #f95bad, #ff0084); border-radius: 50%;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .memory-label .premium-badge svg { width: 10px; height: 10px; }
  .memory-textarea {
    width: 100%; min-height: 80px; background: #1e1e1e;
    border: 1px solid #313131; border-radius: 6px; padding: 10px 12px;
    font-family: 'Syne', sans-serif; font-weight: 400; font-size: 10px; color: #fff;
    line-height: 1.4; resize: vertical; outline: none;
  }
  .memory-textarea::placeholder { color: #848484; }
  .memory-textarea:focus { border-color: #f95bad; }
  .stage-title-with-icon { display: flex; align-items: center; gap: 8px; }
  .btn-generate.disabled { opacity: 0.4; pointer-events: none; }

  /* Preview (Stage 09) */
  .preview-tabs { display: flex; gap: 0; width: 100%; flex-shrink: 0; position: relative; }
  .preview-tabs::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: #313131; }
  .preview-tab {
    flex: 1; padding: 10px 0; text-align: center;
    font-weight: 500; font-size: 12px; color: #969696;
    cursor: pointer; position: relative; z-index: 1;
    border-bottom: 2px solid transparent; transition: color 0.2s;
  }
  .preview-tab.active { color: #fff; border-image: linear-gradient(to right, #f95bad, #ff0084) 1; }
  .preview-tab-content { display: none; flex-direction: column; gap: 10px; flex: 1; min-height: 0; overflow-y: auto; }
  .preview-tab-content.active { display: flex; }
  .preview-tab-content::-webkit-scrollbar { width: 4px; }
  .preview-tab-content::-webkit-scrollbar-track { background: transparent; }
  .preview-tab-content::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }

  .pers-list { display: flex; flex-direction: column; gap: 0; flex: 1; min-height: 0; }
  .pers-row { display: flex; align-items: center; gap: 8px; padding: 12px 0; border-bottom: 1px solid #1e1e1e; }
  .pers-row-icon {
    width: 32px; height: 32px; border-radius: 30px; flex-shrink: 0;
    background: #313131; display: flex; align-items: center; justify-content: center;
    overflow: hidden; padding: 6px; font-size: 14px;
  }
  .pers-row-text { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .pers-row-label { font-weight: 500; font-size: 10px; color: #848484; text-transform: uppercase; line-height: 1.2; }
  .pers-row-value { font-weight: 500; font-size: 12px; color: #fff; line-height: 1.2; }

  /* Stages panel */
  .stages-panel {
    width: 200px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end;
  }
  .progress-stage { display: flex; gap: 8px; align-items: center; width: 200px; }
  .stage-icon-wrap { display: flex; align-items: center; align-self: stretch; }
  .stage-icon-active {
    width: 36px; height: 36px;
    background: linear-gradient(180deg, #f9a0c8 0%, #f95bad 30%, #ff0084 100%);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: visible; flex-shrink: 0;
    box-shadow: 0 0 14px rgba(249,91,173,0.55);
  }
  .stage-icon-active .icon-content { position: relative; z-index: 2; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
  /* Пульсирующий ореол */
  .stage-halo {
    position: absolute; inset: -4px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle, rgba(255,153,206,0.55) 0%, rgba(249,91,173,0.25) 45%, transparent 70%);
    animation: stage-halo 2.2s ease-in-out infinite;
  }
  /* Орбита: вращающийся контейнер с кольцом-«шлейфом» и шариком, летающим вокруг иконки */
  .stage-orbit {
    position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px;
    pointer-events: none; z-index: 1;
    animation: stage-orbit 2.4s linear infinite;
  }
  .stage-orbit-ring {
    position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0deg, transparent 200deg, rgba(249,91,173,0.05) 220deg, rgba(255,153,206,0.85) 358deg, transparent 360deg);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  }
  .stage-orbit-ball {
    position: absolute; left: 50%; top: 0; width: 8px; height: 8px; margin: -3px 0 0 -4px;
    border-radius: 50%; background: #fff;
    box-shadow: 0 0 6px 2px #ff99ce, 0 0 14px 4px rgba(249,91,173,0.7);
  }
  .stage-icon-active.stage-enter { animation: stage-enter .55s cubic-bezier(.34,1.56,.64,1); }
  @keyframes stage-orbit { to { transform: rotate(360deg); } }
  @keyframes stage-halo { 0%,100% { transform: scale(1); opacity: .75; } 50% { transform: scale(1.45); opacity: .15; } }
  @keyframes stage-enter { 0% { transform: scale(.6); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
  .stage-sep-line.pink { animation: sep-fill .5s ease-out; transform-origin: top; }
  @keyframes sep-fill { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .mobile-dot.active { animation: mdot-pulse 1.6s ease-in-out infinite; }
  @keyframes mdot-pulse { 0%,100% { box-shadow: 0 0 6px rgba(249,91,173,0.6); } 50% { box-shadow: 0 0 14px 3px rgba(249,91,173,0.75); } }
  @media (prefers-reduced-motion: reduce) {
    .stage-orbit, .stage-halo, .stage-icon-active.stage-enter, .stage-sep-line.pink, .mobile-dot.active { animation: none; }
  }
  .stage-icon-inactive {
    width: 36px; height: 36px; background: #313131; border-radius: 34px;
    display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;
  }
  .stage-icon-completed {
    width: 36px; height: 36px;
    background: linear-gradient(180deg, #f9a0c8 0%, #f95bad 30%, #ff0084 100%);
    border-radius: 34px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .stage-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .stage-text.with-desc { gap: 10px; padding: 4px 0; }
  .stage-text .header { display: flex; flex-direction: column; gap: 4px; }
  .stage-number { font-weight: 500; font-size: 7px; color: #848484; text-transform: uppercase; line-height: 1.2; }
  .stage-name { font-weight: 500; font-size: 12px; color: #fff; line-height: 1.2; }
  .stage-desc { font-weight: 400; font-size: 8px; color: #fff; line-height: 1.3; }
  .stage-separator { display: flex; align-items: center; padding-left: 17px; width: 100%; }
  .stage-sep-line { width: 2px; height: 22px; }
  .stage-sep-line.pink { background: linear-gradient(to bottom, #f95bad, #ff0084); }
  .stage-sep-line.gray { background: #313131; }
  .loader-icon { width: 16px; height: 16px; flex-shrink: 0; }
  .stage-content { display: none; }
  .stage-content.active { display: contents; }

  /* Scrollbars */
  .ethnicity-grid::-webkit-scrollbar { width: 4px; height: 4px; }
  .ethnicity-grid::-webkit-scrollbar-track { background: transparent; }
  .ethnicity-grid::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }
  .facial-scroll::-webkit-scrollbar { width: 4px; }
  .facial-scroll::-webkit-scrollbar-track { background: transparent; }
  .facial-scroll::-webkit-scrollbar-thumb { background: #f95bad; border-radius: 2px; }

  /* Error/submitting overlay */
  .create-overlay {
    position: absolute; inset: 0; background: rgba(9,9,9,0.8);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; font-size: 16px; color: #fff;
  }
  .create-error { color: #e36466; font-size: 12px; margin-top: 8px; text-align: center; }
  .field-error-ring { outline: 2px solid #e36466; outline-offset: 2px; border-radius: 6px; }
  .btn-continue.shake { animation: shake 0.4s ease-in-out; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-4px)} 40%,80%{transform:translateX(4px)} }

  /* Stage 09 */
  .s9-header { display: flex; align-items: flex-start; width: 100%; flex-shrink: 0; }
  .s9-sep { width: 100%; border-top: 1px solid #313131; flex-shrink: 0; }
  .s9-body { display: flex; gap: 16px; flex: 1; min-height: 0; overflow: hidden; }
  .s9-avatar-col { display: flex; flex-direction: column; gap: 8px; width: 220px; flex-shrink: 0; }
  /* Пропорция 9:16 = как у сгенерированного аватара (aspectRatio "9:16" → 768×1344).
     Раньше блок тянулся на всю высоту колонки (~205×500), и cover-кроп
     превращал портрет в узкую вытянутую полосу. */
  .s9-avatar-wrap { position: relative; flex: none; width: 100%; aspect-ratio: 9 / 16; background: #1e1e1e; border-radius: 8px; overflow: hidden; }
  .s9-avatar-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
  .s9-spinner-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; }
  .s9-spinner { width: 28px; height: 28px; border: 2px solid #313131; border-top-color: #f95bad; border-radius: 50%; animation: s9spin 0.8s linear infinite; }
  @keyframes s9spin { to { transform: rotate(360deg); } }
  .s9-spinner-txt { font-size: 10px; font-weight: 500; color: #969696; }
  .s9-regen-btn { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; background: rgba(18,18,18,0.8); backdrop-filter: blur(4px); border: 1px solid #313131; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; }
  .s9-regen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .s9-name-row, .s9-age-row { display: flex; gap: 6px; align-items: center; }
  .s9-name { font-weight: 700; font-size: 18px; color: #fff; }
  .s9-age { font-weight: 500; font-size: 14px; color: #969696; }
  .s9-edit-btn { background: none; border: none; cursor: pointer; color: #969696; display: flex; align-items: center; padding: 2px; }
  .s9-edit-btn:hover { color: #fff; }
  .s9-manage-tags-btn { width: 100%; height: 30px; background: #121212; border: 1px solid #313131; border-radius: 4px; color: #fff; font-weight: 500; font-size: 12px; cursor: pointer; font-family: "Syne", sans-serif; }
  .s9-attrs-col { flex: 1; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: hidden; }
  .s9-tab-sep { width: 100%; border-top: 1px solid #313131; flex-shrink: 0; }
  .s9-attr-grid { display: grid; grid-template-columns: repeat(3, 1fr) repeat(1, 120px); gap: 8px; }
  .s9-tile { background: #1e1e1e; border: 1px solid #313131; border-radius: 8px; padding: 10px 8px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-height: 80px; cursor: default; position: relative; overflow: hidden; }
  .s9-tile-icon { margin-bottom: 4px; display: flex; }
  .s9-tile-name { font-weight: 700; font-size: 13px; color: #fff; text-align: center; }
  .s9-tile-label { font-size: 8px; font-weight: 500; color: #969696; text-transform: uppercase; letter-spacing: 0.5px; }
  .s9-color-tiles { display: flex; flex-direction: column; gap: 8px; }
  .s9-color-tile { background: #1e1e1e; border: 1px solid #313131; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; }
  .s9-color-dot { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; }
  .s9-color-info { display: flex; flex-direction: column; gap: 2px; }
  .s9-color-name { font-weight: 700; font-size: 13px; color: #fff; }
  .s9-custom-textareas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .s9-custom-label { font-size: 10px; font-weight: 500; color: #fff; display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
  .s9-custom-textarea { width: 100%; height: 80px; background: #1e1e1e; border: 1px solid #313131; border-radius: 6px; padding: 8px 10px; font-family: "Syne", sans-serif; font-size: 10px; color: #969696; resize: none; outline: none; }
  .s9-custom-textarea::placeholder { color: #5b5b5b; }
  .s9-pers-list { display: flex; flex-direction: column; gap: 8px; }
  .s9-pers-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid #1e1e1e; }
  .s9-pers-icon { flex-shrink: 0; display: flex; }
  .s9-pers-icon .ic-badge { width: 28px; height: 28px; }
  .s9-pers-text { display: flex; flex-direction: column; gap: 2px; }
  .s9-pers-label { font-size: 10px; font-weight: 500; color: #969696; }
  .s9-pers-value { font-size: 12px; font-weight: 500; color: #fff; }

  /* Mobile dots progress */
  .mobile-progress-dots {
    display: none;
    position: absolute;
    left: 16px;
    right: 16px;
    top: 60px;
    align-items: center;
    justify-content: center;
    gap: 0;
    z-index: 5;
  }
  .mobile-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #313131;
    flex-shrink: 0;
    transition: background 0.2s, transform 0.2s;
  }
  .mobile-dot.active {
    background: #f95bad;
    transform: scale(1.25);
    box-shadow: 0 0 8px rgba(249, 91, 173, 0.6);
  }
  .mobile-dot.done {
    background: #c1f0aa;
  }
  .mobile-dot-line {
    flex: 1;
    height: 1px;
    background: #313131;
    min-width: 4px;
  }

  @media (max-width: 900px) {
    /* На мобиле уходим от десктопной схемы «панель фикс. высоты + внутренние
       скроллы» к естественной прокрутке всей страницы: иначе блоки (стиль,
       позы) наезжают на кнопку «Далее», а низ формы уходит под нижний бар. */
    .create-content { padding: 20px 16px 100px; overflow: visible; min-height: 0; }
    .stages-panel { display: none; }
    .page-title { padding-left: 0; font-size: 22px; }
    .create-body { gap: 0; }
    .form-card { width: 100%; height: auto !important; min-height: 0 !important; overflow: visible !important; }
    .mobile-progress-dots { display: flex; }
    /* Внутренние скролл-области раскрываем по содержимому — скроллит страница. */
    .field-style, .ethnicity-section, .facial-scroll, .personality-scroll,
    .preview-tab-content, .s9-body, .s9-attrs-col {
      flex: none !important;
      min-height: 0 !important;
      overflow: visible !important;
      height: auto !important;
    }
    /* Ряд выбора стиля — горизонтальная лента вместо сжатых/наезжающих карточек. */
    .style-row { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
    .style-card { flex: 0 0 100px; height: 140px; }
    /* Шапка шага (заголовок + Reset/Generate) переносится, не обрезается. */
    .form-header { flex-wrap: wrap; gap: 8px; }
    .header-actions { flex-wrap: wrap; }
    .btn-generate, .btn-reset { flex: 1 1 auto; }
  }
  @media (max-width: 600px) {
    .s9-body { flex-direction: column; }
    .s9-avatar-col { width: 100%; max-width: 280px; align-self: center; }
    .s9-attrs-col { width: 100%; }
    .s9-custom-textareas { grid-template-columns: 1fr; }
    .dropdown-row { flex-direction: column; gap: 8px; }
    /* Плотные сетки на узком экране: 5 колонок нечитаемы. */
    .personality-grid { grid-template-columns: repeat(2, 1fr); }
    .icon-card { width: calc(33.333% - 6px); }
    .custom-input-row { max-width: none; }
    .ethnicity-card { width: calc(33.333% - 7px); }
    .facial-grid .ethnicity-card { width: calc(50% - 5px); }
    .s9-attr-grid { grid-template-columns: repeat(2, 1fr); }
    /* Кнопки шага занимают всю ширину, чтобы не сжимались. */
    .buttons-row { flex-wrap: wrap; }
  }
`;
