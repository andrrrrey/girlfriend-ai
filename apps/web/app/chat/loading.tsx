const CSS = `
  :root {
    --bg-dark: #0b0512;
    --sidebar-bg: #120a1d;
    --card-bg: #1c1427;
    --tag-border: #3d2b55;
    --text-dim: #a0a0a0;
    --active-violet: #6c5ce7;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; }
  .chat-skeleton-root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-dark);
    color: #fff;
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  .sidebar-skeleton {
    width: 250px;
    background-color: var(--sidebar-bg);
    border-right: 1px solid var(--tag-border);
    padding: 20px 15px;
    flex-shrink: 0;
  }
  .skeleton {
    background: linear-gradient(90deg, var(--card-bg) 25%, #251b35 50%, var(--card-bg) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .sk-logo { height: 30px; width: 140px; margin-bottom: 30px; }
  .sk-menu { height: 38px; margin-bottom: 6px; }
  .chat-area { flex-grow: 1; display: flex; flex-direction: column; }
  .chat-list-skeleton { flex-grow: 1; padding: 20px; display: flex; flex-direction: column; gap: 12px; overflow: hidden; }
  .sk-msg-row { display: flex; gap: 10px; align-items: flex-end; }
  .sk-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
  .sk-bubble { height: 48px; border-radius: 14px; flex-grow: 1; }
  .sk-msg-row.right { flex-direction: row-reverse; }
  .sk-msg-row.right .sk-bubble { max-width: 60%; }
  .chat-input-skeleton {
    padding: 16px 20px; border-top: 1px solid var(--tag-border);
    display: flex; gap: 10px; align-items: center;
  }
  .sk-input { flex-grow: 1; height: 44px; border-radius: 22px; }
  .sk-send-btn { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; }
  /* Chat list sidebar */
  .chat-chars-skeleton { width: 260px; border-right: 1px solid var(--tag-border); padding: 16px; flex-shrink: 0; }
  .sk-char { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
  .sk-char-avatar { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; }
  .sk-char-text { flex-grow: 1; }
  .sk-char-name { height: 14px; width: 70%; margin-bottom: 6px; border-radius: 4px; }
  .sk-char-preview { height: 11px; width: 90%; border-radius: 4px; }
`;

export default function ChatLoading() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="chat-skeleton-root">
        {/* Main nav sidebar */}
        <div className="sidebar-skeleton">
          <div className="skeleton sk-logo" />
          {[...Array(7)].map((_, i) => (
            <div key={i} className="skeleton sk-menu" />
          ))}
        </div>

        {/* Character list */}
        <div className="chat-chars-skeleton">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="sk-char">
              <div className="skeleton sk-char-avatar" />
              <div className="sk-char-text">
                <div className="skeleton sk-char-name" />
                <div className="skeleton sk-char-preview" />
              </div>
            </div>
          ))}
        </div>

        {/* Chat window */}
        <div className="chat-area">
          <div className="chat-list-skeleton">
            <div className="sk-msg-row">
              <div className="skeleton sk-avatar" />
              <div className="skeleton sk-bubble" style={{ maxWidth: "55%" }} />
            </div>
            <div className="sk-msg-row right">
              <div className="skeleton sk-bubble" style={{ maxWidth: "45%" }} />
            </div>
            <div className="sk-msg-row">
              <div className="skeleton sk-avatar" />
              <div className="skeleton sk-bubble" style={{ maxWidth: "65%" }} />
            </div>
            <div className="sk-msg-row right">
              <div className="skeleton sk-bubble" style={{ maxWidth: "40%" }} />
            </div>
            <div className="sk-msg-row">
              <div className="skeleton sk-avatar" />
              <div className="skeleton sk-bubble" style={{ maxWidth: "50%" }} />
            </div>
          </div>
          <div className="chat-input-skeleton">
            <div className="skeleton sk-input" />
            <div className="skeleton sk-send-btn" />
          </div>
        </div>
      </div>
    </>
  );
}
