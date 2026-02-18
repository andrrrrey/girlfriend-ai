"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Static CSS injected once — avoids layout shifts and external stylesheet round-trips
const CSS = `
  :root {
    --bg-dark: #0b0512;
    --sidebar-bg: #120a1d;
    --active-violet: #6c5ce7;
    --text-main: #ffffff;
    --text-dim: #a0a0a0;
    --card-bg: #1c1427;
    --coral: #ff7675;
    --tag-border: #3d2b55;
    --chat-bubble-user: #6c5ce7;
    --chat-bubble-ai: #1c1427;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { margin: 0; }
  .chat-root {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background-color: var(--bg-dark);
    color: var(--text-main);
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
  /* Main nav sidebar */
  .sidebar {
    width: 250px;
    background-color: var(--sidebar-bg);
    border-right: 1px solid var(--tag-border);
    display: flex;
    flex-direction: column;
    padding: 20px 15px;
    flex-shrink: 0;
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
    transition: all 0.2s ease;
  }
  .btn-footer:hover { background-color: var(--tag-border); }
  /* Character list */
  .char-list {
    width: 260px;
    border-right: 1px solid var(--tag-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    overflow: hidden;
  }
  .char-list-header {
    padding: 16px;
    border-bottom: 1px solid var(--tag-border);
    font-size: 15px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .char-list-scroll { overflow-y: auto; flex-grow: 1; }
  .char-item {
    display: flex; gap: 12px; align-items: center; padding: 12px 16px;
    cursor: pointer; border-bottom: 1px solid rgba(61,43,85,0.4);
    transition: background 0.15s ease;
  }
  .char-item:hover { background: rgba(255,255,255,0.04); }
  .char-item.selected { background: rgba(108,92,231,0.15); border-left: 3px solid var(--active-violet); }
  .char-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, #a29bfe, #6c5ce7);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
  }
  .char-meta { overflow: hidden; }
  .char-name { font-size: 14px; font-weight: 600; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .char-preview { font-size: 12px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Chat window */
  .chat-window {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .chat-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--tag-border);
    display: flex; align-items: center; gap: 12px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
  }
  .chat-header-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, #a29bfe, #6c5ce7);
    display: flex; align-items: center; justify-content: center; font-size: 18px;
  }
  .chat-header-name { font-size: 15px; font-weight: 600; }
  .chat-header-status { font-size: 12px; color: #4ade80; }
  .chat-messages {
    flex-grow: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    scroll-behavior: smooth;
  }
  /* Scrollbar */
  .chat-messages::-webkit-scrollbar { width: 4px; }
  .chat-messages::-webkit-scrollbar-track { background: transparent; }
  .chat-messages::-webkit-scrollbar-thumb { background: var(--tag-border); border-radius: 2px; }
  .msg-row { display: flex; gap: 10px; align-items: flex-end; }
  .msg-row.user { flex-direction: row-reverse; }
  .msg-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #a29bfe, #6c5ce7); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
  .msg-bubble {
    max-width: 62%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.5;
  }
  .msg-bubble.ai { background: var(--card-bg); border-bottom-left-radius: 4px; }
  .msg-bubble.user { background: var(--chat-bubble-user); border-bottom-right-radius: 4px; }
  .msg-time { font-size: 10px; color: var(--text-dim); margin-top: 4px; text-align: right; }
  .typing-dot {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: var(--text-dim); margin-right: 3px;
    animation: typing 1.2s infinite;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; margin-right: 0; }
  @keyframes typing { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
  /* Input */
  .chat-input-area {
    padding: 14px 20px;
    border-top: 1px solid var(--tag-border);
    display: flex; gap: 10px; align-items: flex-end;
    flex-shrink: 0;
  }
  .chat-input {
    flex-grow: 1;
    background: var(--card-bg);
    border: 1px solid var(--tag-border);
    border-radius: 22px;
    padding: 10px 18px;
    color: white;
    font-size: 14px;
    resize: none;
    outline: none;
    max-height: 120px;
    line-height: 1.5;
    font-family: inherit;
    transition: border-color 0.2s;
  }
  .chat-input:focus { border-color: var(--active-violet); }
  .chat-input::placeholder { color: var(--text-dim); }
  .send-btn {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--active-violet); border: none; color: white;
    font-size: 18px; cursor: pointer; flex-shrink: 0;
    transition: background 0.2s, transform 0.15s;
    display: flex; align-items: center; justify-content: center;
  }
  .send-btn:hover:not(:disabled) { background: #7d6dfa; transform: scale(1.08); }
  .send-btn:disabled { opacity: 0.5; cursor: default; }
  /* Empty state */
  .empty-chat {
    flex-grow: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 16px;
    color: var(--text-dim); text-align: center; padding: 40px;
  }
  .empty-chat-icon { font-size: 60px; opacity: 0.3; }
  .empty-chat-text { font-size: 16px; }
`;

interface Message {
  id: number;
  role: "user" | "ai";
  text: string;
  time: string;
}

interface Character {
  id: number;
  name: string;
  emoji: string;
  tagline: string;
}

const CHARACTERS: Character[] = [
  { id: 1, name: "Harriet", emoji: "🌸", tagline: "Нежная и загадочная..." },
  { id: 2, name: "Jessica", emoji: "💪", tagline: "Спортивная и энергичная" },
  { id: 3, name: "Luna", emoji: "🌙", tagline: "Мечтательная художница" },
  { id: 4, name: "Sophia", emoji: "📚", tagline: "Умная и любопытная" },
  { id: 5, name: "Aria", emoji: "🎵", tagline: "Певица, любит музыку" },
];

function formatTime(date: Date) {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPage() {
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgIdRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  function selectCharacter(char: Character) {
    setSelectedChar(char);
    setMessages([
      {
        id: ++msgIdRef.current,
        role: "ai",
        text: `Привет! Я ${char.name}. Рада познакомиться! 😊 Как я могу тебя сегодня порадовать?`,
        time: formatTime(new Date()),
      },
    ]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isTyping || !selectedChar) return;

    setInputText("");
    const userMsg: Message = {
      id: ++msgIdRef.current,
      role: "user",
      text,
      time: formatTime(new Date()),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate AI response — replace with real API call
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 700));
    setIsTyping(false);
    setMessages((prev) => [
      ...prev,
      {
        id: ++msgIdRef.current,
        role: "ai",
        text: `Это очень интересно! Расскажи мне больше. 💕`,
        time: formatTime(new Date()),
      },
    ]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="chat-root">
        {/* Main nav sidebar */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-box" />
            <span>Leonardo.Ai</span>
          </div>
          <nav>
            <a href="/" className="menu-item">🏠 Главная</a>
            <a href="#" className="menu-item">📱 Шортсы</a>
            <a href="#" className="menu-item">📸 Фото/видео</a>
            <a href="#" className="menu-item">👤 Мой AI</a>
            <a href="#" className="menu-item">🖼️ Галерея</a>
            <a href="#" className="menu-item">✨ Персонаж</a>
            <a href="/chat" className="menu-item active">💬 Чат</a>
            <a href="/profile" className="menu-item">👤 Профиль</a>
          </nav>
          <div style={{ marginTop: "auto" }}>
            <button className="btn-footer">👑 Премиум</button>
            <button className="btn-footer">📘 Гайд</button>
          </div>
        </aside>

        {/* Character list */}
        <div className="char-list">
          <div className="char-list-header">💬 Персонажи</div>
          <div className="char-list-scroll">
            {CHARACTERS.map((char) => (
              <div
                key={char.id}
                className={`char-item${selectedChar?.id === char.id ? " selected" : ""}`}
                onClick={() => selectCharacter(char)}
              >
                <div className="char-avatar">{char.emoji}</div>
                <div className="char-meta">
                  <div className="char-name">{char.name}</div>
                  <div className="char-preview">{char.tagline}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat window */}
        <div className="chat-window">
          {!selectedChar ? (
            <div className="empty-chat">
              <div className="empty-chat-icon">💬</div>
              <div className="empty-chat-text">Выбери персонажа слева, чтобы начать чат</div>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <div className="chat-header-avatar">{selectedChar.emoji}</div>
                <div>
                  <div className="chat-header-name">{selectedChar.name}</div>
                  <div className="chat-header-status">● онлайн</div>
                </div>
              </div>

              <div className="chat-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`msg-row${msg.role === "user" ? " user" : ""}`}>
                    {msg.role === "ai" && (
                      <div className="msg-avatar">{selectedChar.emoji}</div>
                    )}
                    <div>
                      <div className={`msg-bubble ${msg.role}`}>{msg.text}</div>
                      <div className="msg-time">{msg.time}</div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="msg-row">
                    <div className="msg-avatar">{selectedChar.emoji}</div>
                    <div className="msg-bubble ai" style={{ padding: "12px 16px" }}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-input-area">
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  rows={1}
                  placeholder="Написать сообщение..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={!inputText.trim() || isTyping}
                  aria-label="Отправить"
                >
                  ➤
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
