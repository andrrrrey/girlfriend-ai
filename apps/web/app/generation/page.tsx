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
  :root {
    --bg-dark: #0b0512;
    --sidebar-bg: #120a1d;
    --accent-purple: #8e44ad;
    --active-violet: #6c5ce7;
    --text-main: #ffffff;
    --text-dim: #a0a0a0;
    --card-bg: #1c1427;
    --tag-border: #3d2b55;
    --coral: #ff7675;
  }
  .sidebar {
    background-color: var(--sidebar-bg);
    border-right-color: var(--tag-border);
  }
  .logo { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: bold; margin-bottom: 30px; }
  .logo-box { width: 30px; height: 30px; background: linear-gradient(135deg, #a29bfe, #6c5ce7); border-radius: 6px; }
  .menu-item {
    display: flex; align-items: center; gap: 12px; padding: 10px 15px;
    color: var(--text-dim); text-decoration: none; border-radius: 8px; font-size: 14px; margin-bottom: 4px;
    transition: all 0.2s ease;
  }
  .menu-item:hover { color: white; background-color: rgba(255,255,255,0.05); transform: translateX(5px); }
  .menu-item.active { background-color: var(--active-violet); color: white; }
  .btn-footer {
    display: block; width: 100%; padding: 10px; margin-top: 8px;
    border: 1px solid var(--tag-border); background: transparent; color: white;
    border-radius: 8px; cursor: pointer; text-align: left; font-size: 13px;
  }
  .content { flex-grow: 1; overflow-y: auto; padding: 20px 40px; }

  .tabs-switcher {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-bottom: 30px;
  }
  .tab-btn {
    padding: 10px 60px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s;
    border: 1px solid var(--tag-border);
    color: var(--text-dim);
    background: transparent;
  }
  .tab-btn.active { background: var(--active-violet); border: none; color: white; }
  .tab-btn:hover:not(.active) { border-color: var(--active-violet); color: white; }

  .gen-section-title { font-size: 24px; margin-bottom: 20px; text-align: left; }

  .gen-grid {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 15px;
    margin-bottom: 15px;
  }
  .gen-box {
    background: var(--card-bg);
    border: 1px dashed var(--tag-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--text-dim);
    font-size: 13px;
    text-align: center;
    gap: 10px;
    transition: all 0.2s ease;
    opacity: 0.5;
  }
  .gen-box.clickable {
    cursor: pointer;
    opacity: 1;
  }
  .gen-box.clickable:hover { border-color: var(--active-violet); background: #251b35; color: white; }
  .gen-box.active-box { border-color: var(--active-violet); background: #251b35; border-style: solid; opacity: 1; }
  .full-width-box { grid-column: 1 / -1; padding: 20px; }
  .premium-text { color: var(--coral); font-size: 11px; opacity: 0.8; }

  .custom-prompt-area {
    grid-column: 1 / -1;
    background: var(--card-bg);
    border: 1px solid var(--active-violet);
    border-radius: 12px;
    padding: 20px;
  }
  .custom-prompt-area textarea {
    width: 100%;
    min-height: 80px;
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--tag-border);
    border-radius: 8px;
    color: white;
    padding: 12px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    margin-bottom: 12px;
  }
  .custom-prompt-area textarea:focus {
    outline: none;
    border-color: var(--active-violet);
  }
  .custom-prompt-area textarea::placeholder { color: var(--text-dim); }

  .model-selector {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .model-selector label {
    font-size: 13px;
    color: var(--text-dim);
  }
  .model-selector select {
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--tag-border);
    border-radius: 8px;
    color: white;
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    min-width: 200px;
  }
  .model-selector select:focus {
    outline: none;
    border-color: var(--active-violet);
  }
  .model-selector select option { background: #1c1427; }

  .generate-btn {
    display: block;
    width: 100%;
    padding: 14px;
    margin-top: 20px;
    background: linear-gradient(135deg, var(--active-violet), var(--accent-purple));
    border: none;
    border-radius: 10px;
    color: white;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .generate-btn:hover:not(:disabled) { opacity: 0.9; }
  .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .spinner-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px;
    color: var(--text-dim);
  }
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--tag-border);
    border-top-color: var(--active-violet);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    background: rgba(255, 118, 117, 0.1);
    border: 1px solid var(--coral);
    border-radius: 8px;
    padding: 12px;
    color: var(--coral);
    font-size: 13px;
    margin-top: 12px;
  }

  .gallery-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 40px 0 20px;
  }
  .gallery-header h3 { font-size: 20px; }
  .gallery-header span { color: var(--active-violet); }

  .image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }
  .img-item {
    aspect-ratio: 1/1;
    background: #2d1b44;
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
    color: var(--text-dim);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .img-item:hover .img-overlay { opacity: 1; }

  .empty-gallery {
    text-align: center;
    padding: 40px;
    color: var(--text-dim);
    font-size: 14px;
  }
`;

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
  const [activeTab, setActiveTab] = useState<"photo" | "video">("photo");
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
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-box"></div>
          <span>Lovecast.AI</span>
        </div>
        <nav>
          <a href="/" className="menu-item">&#127968; Home</a>
          <a href="#" className="menu-item">&#128241; Shorts</a>
          <a href="/generation" className="menu-item active">&#128248; Generate</a>
          <a href="#" className="menu-item">&#128100; My AI</a>
          <a href="#" className="menu-item">&#128444;&#65039; Gallery</a>
          <a href="#" className="menu-item">&#10024; Character</a>
          <a href="/chat" className="menu-item">&#128172; Chat</a>
        </nav>
        <div style={{ marginTop: "auto" }}>
          <button className="btn-footer">&#128081; Premium</button>
          <button className="btn-footer">&#128216; Guide</button>
        </div>
      </aside>

      <main className="content">
        {/* Tabs */}
        <div className="tabs-switcher">
          <button
            className={`tab-btn ${activeTab === "photo" ? "active" : ""}`}
            onClick={() => setActiveTab("photo")}
          >
            &#128248; Photo
          </button>
          <button
            className={`tab-btn ${activeTab === "video" ? "active" : ""}`}
            onClick={() => setActiveTab("video")}
          >
            &#127916; Video
          </button>
        </div>

        {activeTab === "video" ? (
          <div className="empty-gallery">
            Video generation coming soon
          </div>
        ) : (
          <>
            <h2 className="gen-section-title">Image Generator</h2>

            {/* Generator Grid */}
            <div className="gen-grid">
              <div className="gen-box" style={{ gridRow: "span 2" }}>
                <span>&#128100;</span>
                <p>Character</p>
                <span className="premium-text">(coming soon)</span>
              </div>
              <div className="gen-box" style={{ gridRow: "span 2" }}>
                <span>&#128336;</span>
                <p>Pose</p>
                <span className="premium-text">(coming soon)</span>
              </div>
              <div className="gen-box">
                <span>&#128444;&#65039;</span>
                <p>Background</p>
                <span className="premium-text">(coming soon)</span>
              </div>
              <div className="gen-box">
                <span>&#127912;</span>
                <p>Decor</p>
                <span className="premium-text">(coming soon)</span>
              </div>

              {/* Custom Prompt - clickable */}
              {!promptOpen ? (
                <div
                  className="gen-box full-width-box clickable"
                  onClick={() => setPromptOpen(true)}
                  style={{ borderColor: "#4a1d2e" }}
                >
                  <p>&#127919; Custom Prompt</p>
                </div>
              ) : (
                <div className="custom-prompt-area">
                  <textarea
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

            {/* Generate Button */}
            {promptOpen && (
              <button
                className="generate-btn"
                disabled={!prompt.trim() || generating}
                onClick={handleGenerate}
              >
                {generating ? "Generating..." : "Generate Image"}
              </button>
            )}

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
            <div className="gallery-header">
              <h3>
                Gallery <span>generated images</span>
              </h3>
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
      </main>
    </>
  );
}
