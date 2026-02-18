"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/auth";
import {
  chats,
  characters as charactersApi,
  streamMessage,
  streamRegenerate,
  streamVoiceMessage,
  streamEditMessage,
  fetchTTS,
  type ChatSession,
  type Message,
  type Character,
} from "../../lib/api";

const DEMO_MESSAGE_LIMIT = 20;

export default function ChatPage() {
  const { user, loading } = useAuth();
  const isDemo = !user || user.subscription === "free";

  const [chatList, setChatList] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [charList, setCharList] = useState<Character[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Demo banner state
  const [demoBanner, setDemoBanner] = useState<string | null>(null);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TTS playback state
  const [playingTTSId, setPlayingTTSId] = useState<string | null>(null);
  const [loadingTTSId, setLoadingTTSId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Edit message state
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Load chat list
  const loadChats = useCallback(async () => {
    try {
      const res = await chats.list();
      setChatList(res.items);
    } catch {
      // not authenticated or error
    }
  }, []);

  // Load messages for active chat
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await chats.getMessages(chatId);
      setMessages(res.items);
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      loadChats();
      charactersApi.listPublic().then(setCharList).catch(() => {});
    }
  }, [loading, user, loadChats]);

  useEffect(() => {
    if (activeChat) loadMessages(activeChat);
  }, [activeChat, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamContent]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  if (loading) return <div style={s.page}><p style={{ color: "#aaa", padding: 40 }}>Загрузка...</p></div>;
  if (!user) {
    return (
      <div style={s.page}>
        <div style={{ padding: 40 }}>
          <p style={{ color: "#aaa", marginBottom: 16 }}>Войдите, чтобы использовать чат.</p>
          <a href="/login" style={s.link}>Войти</a>
        </div>
      </div>
    );
  }

  const handleDemoError = (err: string, code?: number) => {
    if (code === 429) {
      setDemoBanner(`Достигнут дневной лимит ${DEMO_MESSAGE_LIMIT} сообщений. Оформите подписку для безлимитного общения.`);
    } else if (code === 403) {
      setDemoBanner("Голосовые функции доступны только по подписке.");
    } else {
      setStreamContent(`[Error: ${err}]`);
    }
  };

  const handleSend = () => {
    if (!input.trim() || !activeChat || streaming) return;
    const content = input.trim();
    setInput("");
    setDemoBanner(null);

    // Optimistic: add user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      type: "text",
      mediaUrl: null,
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamContent("");

    abortRef.current = streamMessage(
      activeChat,
      content,
      (delta) => setStreamContent((prev) => prev + delta),
      () => {
        setStreaming(false);
        loadMessages(activeChat);
        loadChats();
        setStreamContent("");
      },
      (err, code) => {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code);
      },
    );
  };

  const handleRegenerate = (msgId: string) => {
    if (!activeChat || streaming) return;
    setDemoBanner(null);
    setStreaming(true);
    setStreamContent("");

    // Remove the target message and everything after it from UI
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });

    abortRef.current = streamRegenerate(
      activeChat,
      msgId,
      (delta) => setStreamContent((prev) => prev + delta),
      () => {
        setStreaming(false);
        loadMessages(activeChat);
        setStreamContent("");
      },
      (err, code) => {
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code);
      },
    );
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
    setDemoBanner(null);
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditContent("");
  };

  const handleSubmitEdit = () => {
    if (!editContent.trim() || !activeChat || !editingMsgId || streaming) return;
    const content = editContent.trim();
    setDemoBanner(null);

    // Optimistically update the message in UI and remove all after it
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === editingMsgId);
      if (idx < 0) return prev;
      const updated = [...prev.slice(0, idx), { ...prev[idx], content }];
      return updated;
    });

    setEditingMsgId(null);
    setEditContent("");
    setStreaming(true);
    setStreamContent("");

    abortRef.current = streamEditMessage(
      activeChat,
      editingMsgId,
      content,
      (delta) => setStreamContent((prev) => prev + delta),
      () => {
        setStreaming(false);
        loadMessages(activeChat);
        loadChats();
        setStreamContent("");
      },
      (err, code) => {
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code);
        // Reload to restore original message
        if (activeChat) loadMessages(activeChat);
      },
    );
  };

  const handleAbort = () => {
    abortRef.current?.abort();
    setStreaming(false);
    if (activeChat) loadMessages(activeChat);
    setStreamContent("");
  };

  const handleNewChat = async (charId: string) => {
    try {
      const chat = await chats.create(charId);
      setShowNewChat(false);
      await loadChats();
      setActiveChat(chat.id);
    } catch {
      // error
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await chats.remove(chatId);
      if (activeChat === chatId) {
        setActiveChat(null);
        setMessages([]);
      }
      loadChats();
    } catch {
      // error
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeChat) return;
    try {
      await chats.deleteMessage(activeChat, msgId);
      loadMessages(activeChat);
    } catch {
      // error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Voice recording ──────────────────────────────────────────

  const startRecording = async () => {
    if (!activeChat || streaming || recording) return;
    if (isDemo) {
      setDemoBanner("Голосовые функции доступны только по подписке.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        handleVoiceSend(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      // Microphone access denied or unavailable
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        const stream = mediaRecorderRef.current?.stream;
        stream?.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };

  const handleVoiceSend = (audioBlob: Blob) => {
    if (!activeChat) return;

    setStreaming(true);
    setStreamContent("");

    const userMsg: Message = {
      id: `temp-voice-${Date.now()}`,
      role: "user",
      content: "...",
      type: "audio",
      mediaUrl: null,
      metadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    abortRef.current = streamVoiceMessage(
      activeChat,
      audioBlob,
      (transcription) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, content: transcription } : m,
          ),
        );
      },
      (delta) => setStreamContent((prev) => prev + delta),
      () => {
        setStreaming(false);
        loadMessages(activeChat);
        loadChats();
        setStreamContent("");
      },
      (err, code) => {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code);
      },
    );
  };

  // ─── TTS playback ──────────────────────────────────────────────

  const handlePlayTTS = async (msgId: string) => {
    if (!activeChat) return;

    if (isDemo) {
      setDemoBanner("Озвучивание доступно только по подписке.");
      return;
    }

    if (playingTTSId === msgId) {
      audioRef.current?.pause();
      setPlayingTTSId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setLoadingTTSId(msgId);

    try {
      const audioBuffer = await fetchTTS(activeChat, msgId);
      const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      audio.onended = () => {
        setPlayingTTSId(null);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        setPlayingTTSId(null);
        URL.revokeObjectURL(url);
      };

      audioRef.current = audio;
      setLoadingTTSId(null);
      setPlayingTTSId(msgId);
      audio.play();
    } catch {
      setLoadingTTSId(null);
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const activeChatData = chatList.find((c) => c.id === activeChat);

  return (
    <div style={s.root}>
      <style>{`
        .sidebar-menu-item { transition: all 0.2s ease; }
        .sidebar-menu-item:hover { color: white !important; background-color: rgba(255,255,255,0.05) !important; transform: translateX(5px); }
        .sidebar-btn-footer { transition: all 0.2s ease; }
        .sidebar-btn-footer:hover { background-color: #3d2b55 !important; }
        .msg-bubble:hover .msg-actions { opacity: 1 !important; }
      `}</style>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoBox} />
          <span>Leonardo.Ai</span>
        </div>
        <nav>
          <a href="/" style={s.menuItem} className="sidebar-menu-item">🏠 Главная</a>
          <a href="#" style={s.menuItem} className="sidebar-menu-item">📱 Шортсы</a>
          <a href="/generation" style={s.menuItem} className="sidebar-menu-item">📸 Фото/видео</a>
          <a href="#" style={s.menuItem} className="sidebar-menu-item">👤 Мой AI</a>
          <a href="#" style={s.menuItem} className="sidebar-menu-item">🖼️ Галерея</a>
          <a href="#" style={s.menuItem} className="sidebar-menu-item">✨ Персонаж</a>
          <a href="/chat" style={{ ...s.menuItem, ...s.menuActive }}>💬 Чат</a>
        </nav>
        <div style={s.sidebarFooter}>
          <button style={s.btnFooter} className="sidebar-btn-footer">👑 Премиум</button>
          <button style={s.btnFooter} className="sidebar-btn-footer">📘 Гайд</button>
        </div>
      </aside>

      {/* Chat List */}
      <section style={s.chatListPanel}>
        <div style={s.chatListHeader}>
          <h2 style={s.chatTitle}>Чаты</h2>
          <button onClick={() => setShowNewChat(true)} style={s.newChatBtn}>+</button>
        </div>

        {showNewChat && (
          <div style={s.newChatModal}>
            <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 12 }}>Выберите персонажа:</h3>
            {charList.map((c) => (
              <div
                key={c.id}
                onClick={() => handleNewChat(c.id)}
                style={s.charOption}
              >
                <div style={s.charAvatar} />
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.name}</div>
                  <div style={{ color: "#888", fontSize: 11 }}>
                    {c.tags.join(", ")}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setShowNewChat(false)} style={s.cancelBtn}>
              Отмена
            </button>
          </div>
        )}

        <div style={s.chatListScroll}>
          {chatList.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveChat(c.id)}
              style={{
                ...s.chatItem,
                ...(c.id === activeChat ? s.chatItemActive : {}),
              }}
            >
              <div style={s.chatAvatar} />
              <div style={s.chatInfo}>
                <div style={s.chatItemName}>
                  {c.character?.name || "Неизвестный"}
                </div>
                <div style={s.chatItemPreview}>
                  {c.lastMessage?.content?.slice(0, 40) || c.title || "Новый чат"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(c.id);
                }}
                style={s.deleteChatBtn}
                title="Удалить чат"
              >
                x
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Messages Panel */}
      <section style={s.messagesPanel}>
        {activeChat ? (
          <>
            <div style={s.messagesHeader}>
              <div style={s.chatAvatar} />
              <span style={{ fontWeight: "bold", color: "#fff" }}>
                {activeChatData?.character?.name || "Чат"}
              </span>
              {isDemo && (
                <span style={s.demoBadge}>Free</span>
              )}
            </div>

            {/* Demo banner */}
            {demoBanner && (
              <div style={s.demoBanner}>
                <span>{demoBanner}</span>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <a href="/profile" style={s.demoBannerBtn}>Оформить подписку</a>
                  <button onClick={() => setDemoBanner(null)} style={s.demoBannerClose}>Закрыть</button>
                </div>
              </div>
            )}

            <div ref={scrollRef} style={s.messagesScroll}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    ...s.bubble,
                    ...(msg.role === "user" ? s.bubbleUser : s.bubbleAi),
                  }}
                  className="msg-bubble"
                >
                  {msg.type === "audio" && msg.role === "user" && (
                    <div style={s.voiceLabel}>Голосовое сообщение</div>
                  )}

                  {/* Inline edit mode for user messages */}
                  {editingMsgId === msg.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        style={s.editTextarea}
                        autoFocus
                        rows={3}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmitEdit();
                          }
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={handleSubmitEdit} style={s.editSaveBtn} disabled={streaming}>
                          Сохранить
                        </button>
                        <button onClick={handleCancelEdit} style={s.editCancelBtn}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>{msg.content}</div>
                  )}

                  <div style={{ ...s.msgMeta, ...(editingMsgId === msg.id ? { display: "none" } : {}) }}>
                    <span style={s.msgDate}>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div style={{ ...s.msgActions, opacity: 0 }} className="msg-actions">
                      {msg.role === "user" && !msg.id.startsWith("temp-") && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          style={s.msgAction}
                          disabled={streaming}
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                      )}
                      {msg.role === "assistant" && !msg.id.startsWith("temp-") && (
                        <>
                          <button
                            onClick={() => handlePlayTTS(msg.id)}
                            style={{
                              ...s.msgAction,
                              ...(isDemo ? s.msgActionLocked : {}),
                            }}
                            disabled={loadingTTSId === msg.id}
                            title={isDemo ? "Доступно по подписке" : (playingTTSId === msg.id ? "Остановить" : "Озвучить")}
                          >
                            {loadingTTSId === msg.id
                              ? "..."
                              : playingTTSId === msg.id
                                ? "⏹"
                                : isDemo ? "🔒" : "🔊"}
                          </button>
                          <button
                            onClick={() => handleRegenerate(msg.id)}
                            style={s.msgAction}
                            disabled={streaming}
                            title="Перегенерировать"
                          >
                            🔄
                          </button>
                        </>
                      )}
                      {!msg.id.startsWith("temp-") && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          style={s.msgAction}
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {streaming && streamContent && (
                <div style={{ ...s.bubble, ...s.bubbleAi }}>
                  <div>{streamContent}</div>
                  <span style={s.msgDate}>печатает...</span>
                </div>
              )}
            </div>

            <div style={s.inputContainer}>
              {streaming ? (
                <button onClick={handleAbort} style={s.abortBtn}>
                  Стоп
                </button>
              ) : null}

              {recording ? (
                <div style={s.recordingBar}>
                  <div style={s.recordingDot} />
                  <span style={s.recordingTime}>
                    {formatRecordingTime(recordingTime)}
                  </span>
                  <button onClick={cancelRecording} style={s.recordCancelBtn} title="Отмена">
                    Отмена
                  </button>
                  <button onClick={stopRecording} style={s.recordStopBtn} title="Отправить">
                    Отправить
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={startRecording}
                    disabled={streaming}
                    style={{
                      ...s.micBtn,
                      ...(isDemo ? s.micBtnLocked : {}),
                    }}
                    title={isDemo ? "Голосовые функции доступны по подписке" : "Голосовое сообщение"}
                  >
                    {isDemo ? "🔒" : "🎤"}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    style={s.chatInput}
                    placeholder="Введите сообщение..."
                    disabled={streaming}
                  />
                  <button
                    onClick={handleSend}
                    disabled={streaming || !input.trim()}
                    style={s.sendBtn}
                  >
                    Отправить
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div style={s.emptyState}>
            <h2 style={{ color: "#fff", marginBottom: 12 }}>Выберите чат или создайте новый</h2>
            <p style={{ color: "#888" }}>
              Нажмите + чтобы начать новый чат с AI-персонажем.
            </p>
            {isDemo && (
              <p style={{ color: "#a29bfe", marginTop: 12, fontSize: 13 }}>
                Бесплатный план: {DEMO_MESSAGE_LIMIT} сообщений/день, без голосовых функций.{" "}
                <a href="/profile" style={{ color: "#6c5ce7" }}>Оформить подписку →</a>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0512",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  root: {
    display: "flex",
    height: "100vh",
    background: "#0b0512",
    color: "#fff",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    overflow: "hidden",
  },
  link: { color: "#6c5ce7", textDecoration: "none" },

  // Sidebar
  sidebar: {
    width: 200,
    background: "#120a1d",
    borderRight: "1px solid #3d2b55",
    padding: "20px 15px",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 30,
  },
  logoBox: {
    width: 26,
    height: 26,
    background: "linear-gradient(135deg, #a29bfe, #6c5ce7)",
    borderRadius: 6,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 15px",
    color: "#a0a0a0",
    textDecoration: "none",
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 4,
  },
  menuActive: { background: "#6c5ce7", color: "#fff" },
  sidebarFooter: { marginTop: "auto" },
  btnFooter: {
    display: "block",
    width: "100%",
    padding: 10,
    marginTop: 8,
    border: "1px solid #3d2b55",
    background: "transparent",
    color: "#fff",
    borderRadius: 8,
    cursor: "pointer",
    textAlign: "left" as const,
    fontSize: 13,
  },

  // Chat List
  chatListPanel: {
    width: 280,
    borderRight: "1px solid #3d2b55",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  chatListHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 15px 10px",
  },
  chatTitle: { fontSize: 18, margin: 0 },
  newChatBtn: {
    width: 32,
    height: 32,
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    borderRadius: 8,
    fontSize: 18,
    cursor: "pointer",
  },
  chatListScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 10px",
  },
  chatItem: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    marginBottom: 4,
    alignItems: "center",
    position: "relative" as const,
  },
  chatItemActive: { background: "#2d1b44" },
  chatAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "#4a3b61",
    flexShrink: 0,
  },
  chatInfo: { overflow: "hidden", flex: 1 },
  chatItemName: { fontSize: 13, fontWeight: "bold" as const, marginBottom: 2 },
  chatItemPreview: {
    fontSize: 11,
    color: "#a0a0a0",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  deleteChatBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    fontSize: 14,
    cursor: "pointer",
    padding: "2px 6px",
  },

  // New chat modal
  newChatModal: {
    padding: "15px",
    borderBottom: "1px solid #3d2b55",
  },
  charOption: {
    display: "flex",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 4,
    alignItems: "center",
  },
  charAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #a29bfe, #6c5ce7)",
    flexShrink: 0,
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    marginTop: 8,
    width: "100%",
  },

  // Messages
  messagesPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  messagesHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "15px 20px",
    borderBottom: "1px solid #3d2b55",
  },
  demoBadge: {
    marginLeft: "auto",
    background: "rgba(108,92,231,0.2)",
    border: "1px solid #6c5ce7",
    color: "#a29bfe",
    borderRadius: 12,
    fontSize: 11,
    padding: "2px 10px",
  },
  demoBanner: {
    background: "rgba(108,92,231,0.15)",
    border: "1px solid #6c5ce7",
    borderRadius: 8,
    padding: "12px 16px",
    margin: "10px 20px 0",
    fontSize: 13,
    color: "#fff",
  },
  demoBannerBtn: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-block",
  },
  demoBannerClose: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  messagesScroll: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  bubble: {
    maxWidth: "75%",
    padding: "10px 15px",
    borderRadius: 14,
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: "break-word" as const,
    position: "relative" as const,
  },
  bubbleAi: { background: "#2d1b44", alignSelf: "flex-start" },
  bubbleUser: { background: "#4a3b61", alignSelf: "flex-end" },
  voiceLabel: {
    fontSize: 10,
    color: "#a29bfe",
    marginBottom: 4,
    fontStyle: "italic" as const,
  },
  msgMeta: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    marginTop: 4,
  },
  msgActions: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    transition: "opacity 0.15s",
  },
  msgDate: { fontSize: 10, color: "#a0a0a0" },
  msgAction: {
    background: "transparent",
    border: "none",
    color: "#6c5ce7",
    fontSize: 12,
    cursor: "pointer",
    padding: "1px 3px",
    opacity: 0.8,
  },
  msgActionLocked: {
    color: "#555",
    cursor: "default",
  },

  // Edit message
  editTextarea: {
    background: "rgba(0,0,0,0.3)",
    border: "1px solid #6c5ce7",
    borderRadius: 8,
    color: "#fff",
    fontSize: 13,
    padding: "8px 10px",
    resize: "none" as const,
    outline: "none",
    width: "100%",
    lineHeight: 1.5,
  },
  editSaveBtn: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "5px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  editCancelBtn: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "5px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },

  // Input
  inputContainer: {
    padding: "12px 20px",
    borderTop: "1px solid #3d2b55",
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  chatInput: {
    flex: 1,
    background: "rgba(0,0,0,0.2)",
    border: "1px solid #3d2b55",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: "bold" as const,
    cursor: "pointer",
  },
  abortBtn: {
    background: "#ff7675",
    border: "none",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 13,
    cursor: "pointer",
  },

  // Voice recording
  micBtn: {
    background: "transparent",
    border: "1px solid #6c5ce7",
    color: "#6c5ce7",
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  },
  micBtnLocked: {
    border: "1px solid #3d2b55",
    color: "#555",
    cursor: "default",
  },
  recordingBar: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,118,117,0.1)",
    border: "1px solid #ff7675",
    borderRadius: 10,
    padding: "8px 14px",
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ff7675",
    flexShrink: 0,
  },
  recordingTime: {
    color: "#ff7675",
    fontSize: 14,
    fontWeight: "bold" as const,
    flex: 1,
  },
  recordCancelBtn: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
  },
  recordStopBtn: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: "bold" as const,
    cursor: "pointer",
  },

  // Empty state
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center" as const,
    padding: 40,
  },
};
