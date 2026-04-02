"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/auth";
import {
  createImageJob,
  getJobStatus,
  getImageStyles,
  getGenerationHistory,
} from "../../lib/api";

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
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  .editor-row {
    display: flex;
    gap: 10px;
  }
  .editor-card {
    flex: 1;
    height: 319px;
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
  .editor-card:hover { border-color: #f95bad; }
  .editor-card .card-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
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

  .video-placeholder {
    text-align: center;
    padding: 60px;
    color: #969696;
    font-size: 14px;
  }
`;

const CHEVRON_DOWN = `<svg viewBox="0 0 9 5" fill="none"><path d="M0.5 0.5L4.5 4.5L8.5 0.5" stroke="#969696" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PREMIUM_GEM = `<svg viewBox="0 0 15.86 13.51" fill="none"><path d="M12.09.5l.01-.5c.27.01.54.08.77.21.24.13.44.31.59.53l2.08 2.88c.22.31.33.68.31 1.06-.02.38-.16.74-.41 1.03L9.21 12.9c-.15.19-.34.34-.56.45-.22.11-.47.17-.72.17s-.5-.06-.72-.17c-.22-.11-.41-.26-.56-.45L.41 5.71c-.25-.29-.39-.65-.41-1.03-.02-.38.09-.75.31-1.06l2.08-2.88c.15-.22.36-.4.59-.53.24-.13.5-.2.77-.21h8.33V.5zM5.3 5.31l2.64 6.37 2.65-6.37H5.3zM1.39 5.31l5.4 6.22-2.58-6.22H1.39zm10.28 0l-2.59 6.21 5.39-6.21h-2.8zM3.7 1.01a.68.68 0 0 0-.48.3l-2.08 2.88c-.03.04-.05.07-.06.12h3.21l2.14-3.31H3.79zm1.77 3.3h4.95L8.3 1H7.6zm6.14 0h3.19c-.02-.04-.04-.08-.06-.12l-2.08-2.87a.72.72 0 0 0-.49-.3L12.08 1H9.48l2.13 3.31z" fill="url(#pg)"/><defs><linearGradient id="pg" x1="0" y1="6.76" x2="15.86" y2="6.76" gradientUnits="userSpaceOnUse"><stop stop-color="#F95BAD"/><stop offset="1" stop-color="#FF0084"/></linearGradient></defs></svg>`;

interface ImageModel {
  id: string;
  name: string;
  description: string;
}

interface HistoryItem {
  jobId: string;
  output: { url?: string } | null;
  input: { prompt?: string; model?: string } | null;
  createdAt: string;
}

export default function GenerationPage() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<"image" | "video">("image");
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("realistic-vision-v51");
  const [models, setModels] = useState<ImageModel[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    getImageStyles()
      .then(setModels)
      .catch(() => {});
    getGenerationHistory()
      .then(setHistory)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    setError(null);
    setGenerating(true);

    try {
      const { jobId } = await createImageJob({
        prompt: prompt.trim(),
        model: selectedModel,
      });

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
                output: status.output,
                input: { prompt: prompt.trim(), model: selectedModel },
                createdAt: status.createdAt,
              },
              ...prev,
            ]);
            setPrompt("");
          } else if (status.status === "failed") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setGenerating(false);
            setError(status.error || "Image generation failed");
          }
        } catch {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setGenerating(false);
          setError("Failed to check job status");
        }
      }, 2000);
    } catch (err: any) {
      setGenerating(false);
      setError(err.message || "Failed to start generation");
    }
  }, [prompt, selectedModel, generating]);

  if (loading) return null;

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

          {activeTab === "video" ? (
            <div className="video-placeholder">
              Video generation coming soon
            </div>
          ) : (
            <>
              {/* Separator */}
              <div className="sep" />

              {/* Sorting row */}
              <div className="sorting-row">
                <div className="sort-btn">
                  <div className="sort-text">
                    <span className="label">Gender:</span>
                    <span className="value">Female</span>
                  </div>
                  <span dangerouslySetInnerHTML={{ __html: CHEVRON_DOWN }} />
                </div>
                <div className="sort-btn">
                  <div className="sort-text">
                    <span className="label">Style:</span>
                    <span className="value">Realistic</span>
                  </div>
                  <span dangerouslySetInnerHTML={{ __html: CHEVRON_DOWN }} />
                </div>
                <div className="sort-btn">
                  <div className="sort-text">
                    <span className="label">AI model:</span>
                    <span className="value">FireFly 12</span>
                  </div>
                  <span dangerouslySetInnerHTML={{ __html: CHEVRON_DOWN }} />
                </div>
                <div className="btn-random">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M3.33 8C6.58 8 8 6.63 8 3.33C8 6.63 9.41 8 12.67 8C9.41 8 8 9.41 8 12.67C8 9.41 6.58 8 3.33 8Z" stroke="#C1F0AA" strokeLinejoin="round"/><path d="M1.83 4.83C3.92 4.83 4.83 3.95 4.83 1.83C4.83 3.95 5.74 4.83 7.83 4.83C5.74 4.83 4.83 5.74 4.83 7.83C4.83 5.74 3.92 4.83 1.83 4.83Z" stroke="#C1F0AA" strokeLinejoin="round"/></svg>
                  Generate Random
                </div>
              </div>

              {/* Editor cards */}
              <div className="editor-section">
                {/* Row 1 */}
                <div className="editor-row">
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3.5" stroke="#fff" strokeWidth="1.3"/><path d="M16 18c0-3.31-2.69-6-6-6s-6 2.69-6 6" stroke="#fff" strokeWidth="1.3"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Character</div>
                        <div className="sub required">required</div>
                      </div>
                    </div>
                  </div>
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="5" r="2.5" stroke="#fff" strokeWidth="1.2"/><path d="M7 10c-1 2-1 5 0 7M13 10c1 2 1 5 0 7M10 8v9" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Pose</div>
                        <div className="sub required">required</div>
                      </div>
                    </div>
                  </div>
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><rect x="2" y="2" width="16" height="16" rx="2" stroke="#fff" strokeWidth="1.2"/><path d="M2 14l4-4 3 3 4-4 5 5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Background</div>
                        <div className="sub">optional</div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Row 2 */}
                <div className="editor-row">
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><path d="M6 3h8l2 4H4l2-4zM4 7h12v2a6 6 0 0 1-12 0V7z" stroke="#fff" strokeWidth="1.2"/><path d="M10 15v3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Outfit</div>
                        <div className="sub">optional</div>
                      </div>
                    </div>
                  </div>
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="8" r="3" stroke="#fff" strokeWidth="1.2"/><path d="M10 11v4M7 18h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/><circle cx="10" cy="8" r="1" fill="#fff"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Jewelry</div>
                        <div className="sub">optional</div>
                      </div>
                    </div>
                  </div>
                  <div className="editor-card">
                    <div className="card-content">
                      <div className="editor-icon">
                        <svg viewBox="0 0 20 20" fill="none"><path d="M8 6c1-2 3-2 4 0s0 4-2 5c-2-1-3-3-2-5z" stroke="#fff" strokeWidth="1.2"/><path d="M6 12c1.5 0 3 1 3 3s-1.5 3-3 3" stroke="#fff" strokeWidth="1.2"/></svg>
                      </div>
                      <div className="editor-text">
                        <div className="name">Body Marks</div>
                        <div className="sub">optional</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Prompt */}
                {!promptOpen ? (
                  <div
                    className="custom-prompt-card"
                    onClick={() => setPromptOpen(true)}
                  >
                    <div className="custom-prompt-icon">
                      <svg viewBox="0 0 20 20" fill="none"><path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div className="heading">
                      <span>Custom Prompt</span>
                      <span className="premium-gem" dangerouslySetInnerHTML={{ __html: PREMIUM_GEM }} />
                    </div>
                    <div className="premium-label">premium feature</div>
                  </div>
                ) : (
                  <div className="custom-prompt-card expanded">
                    <textarea
                      className="prompt-textarea"
                      placeholder="Describe the image you want to generate..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      autoFocus
                    />
                    <div className="model-selector">
                      <label>AI model:</label>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {m.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
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

              {/* Number of Images */}
              <div className="chips-section">
                <div className="section-title">Number of Images</div>
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
                  {generating ? "Generating..." : "Generate Image"}
                </button>
              </div>

              {/* Spinner */}
              {generating && (
                <div className="spinner-container">
                  <div className="spinner" />
                  <span>Creating your image...</span>
                </div>
              )}

              {/* Error */}
              {error && <div className="error-msg">{error}</div>}

              {/* Gallery */}
              <div className="sep" />
              <div className="gallery-header">
                <h3>Gallery <span>generated images</span></h3>
              </div>

              {history.length === 0 ? (
                <div className="empty-gallery">
                  No generated images yet. Create your first one above!
                </div>
              ) : (
                <div className="image-grid">
                  {history.map((item) => {
                    const url = item.output?.url;
                    if (!url) return null;
                    return (
                      <div key={item.jobId} className="img-item">
                        <img src={url} alt={item.input?.prompt || "Generated"} loading="lazy" />
                        <div className="img-overlay">
                          {item.input?.prompt?.slice(0, 60)}
                          {(item.input?.prompt?.length || 0) > 60 ? "..." : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
