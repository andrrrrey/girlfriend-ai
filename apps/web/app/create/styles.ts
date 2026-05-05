export const PAGE_CSS = `
  .create-content { position: relative; min-height: calc(100vh - 46px); overflow: hidden; }
  .breadcrumb {
    position: absolute; left: 36px; top: 20px;
    font-weight: 500; font-size: 10px; color: #969696;
    text-transform: uppercase; line-height: 1.2;
  }
  .page-title {
    position: absolute; left: 274px; top: 20px;
    font-weight: 700; font-size: 32px; line-height: 1.1; width: 696px;
  }
  .page-title .pink { color: #ff99ce; }
  .form-card {
    position: absolute; left: 274px; top: 78px;
    width: 934px; height: 668px; background: #090909;
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
  .style-card.selected { border: 1px solid #f95bad; }
  .style-card.unselected { border: 1px dashed #969696; }
  .style-card .name { position: relative; z-index: 1; font-weight: 700; font-size: 16px; color: #fff; text-align: center; width: 100%; }

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
    width: calc(20% - 8px); height: 120px; border-radius: 8px; position: relative;
    display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer;
    border: 1px dashed #969696; background: #121212;
  }
  .ethnicity-card.selected { border: 1px solid #f95bad; background: #1a1316; }
  .ethnicity-card .card-name { position: relative; z-index: 1; font-weight: 700; font-size: 14px; color: #fff; text-align: center; }
  .facial-grid { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; }
  .facial-grid .ethnicity-card { width: 120px; flex-shrink: 0; }
  .facial-scroll {
    display: flex; flex-direction: column; gap: 22px; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  }
  .facial-scroll .ethnicity-section { flex: none; }

  /* Voice section */
  .voice-section { display: flex; flex-direction: column; gap: 16px; width: 100%; flex-shrink: 0; }
  .voice-row { display: flex; gap: 8px; width: 100%; }
  .voice-btn {
    flex: 1; height: 34px; background: #1e1e1e; border-radius: 4px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    cursor: pointer; font-weight: 500; font-size: 12px; color: #fff; border: 1px solid transparent;
  }
  .voice-btn.selected { background: #252525; border: 1px solid #313131; }
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
  .personality-card.selected { border: 1px solid #f95bad; }
  .personality-card .p-icon {
    width: 24px; height: 24px; background: #252525; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 12px;
  }
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
  .tag-chip.selected { background: #252525; border-color: #f95bad; }

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
    position: absolute; left: 36px; top: 78px;
    width: 200px; display: flex; flex-direction: column; align-items: flex-end;
  }
  .progress-stage { display: flex; gap: 8px; align-items: center; width: 200px; }
  .stage-icon-wrap { display: flex; align-items: center; align-self: stretch; }
  .stage-icon-active {
    width: 36px; align-self: stretch; min-height: 36px;
    background: linear-gradient(180deg, #f9a0c8 0%, #f95bad 30%, #ff0084 100%);
    border-radius: 34px; display: flex; align-items: center; justify-content: center;
    position: relative; overflow: visible; flex-shrink: 0;
  }
  .stage-icon-active::before {
    content: ''; position: absolute; top: -5px; left: -5px;
    width: 35px; height: 35px;
    background: radial-gradient(ellipse at center, rgba(255,200,80,0.55) 0%, rgba(249,160,100,0.25) 50%, transparent 75%);
    border-radius: 50%; pointer-events: none;
  }
  .stage-icon-active .icon-content { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
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
  .s9-avatar-col { display: flex; flex-direction: column; gap: 8px; width: 205px; flex-shrink: 0; }
  .s9-avatar-wrap { position: relative; flex: 1; background: #1e1e1e; border-radius: 8px; overflow: hidden; min-height: 280px; }
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
  .s9-tile-icon { font-size: 20px; margin-bottom: 4px; }
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
  .s9-pers-icon { font-size: 16px; flex-shrink: 0; }
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
    .stages-panel { display: none; }
    .page-title { left: 16px; right: 16px; width: auto; font-size: 22px; }
    .form-card { left: 16px; right: 16px; width: auto; top: 90px; }
    .breadcrumb { left: 16px; }
    .mobile-progress-dots { display: flex; }
  }
  @media (max-width: 600px) {
    .s9-body { flex-direction: column; }
    .s9-avatar-col { width: 100%; }
    .s9-attrs-col { width: 100%; }
    .s9-custom-textareas { grid-template-columns: 1fr; }
    .dropdown-row { flex-direction: column; gap: 8px; }
  }
`;
