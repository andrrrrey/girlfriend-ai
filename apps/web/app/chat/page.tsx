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

  if (loading) return <div className="chat-content"><p style={{ color: "#aaa", padding: 40 }}>Загрузка...</p></div>;
  if (!user) {
    return (
      <div className="chat-content">
        <div style={{ padding: 40 }}>
          <p style={{ color: "#aaa", marginBottom: 16 }}>Войдите, чтобы использовать чат.</p>
          <a href="/login" style={{ color: "#f95bad", textDecoration: "none" }}>Войти</a>
        </div>
      </div>
    );
  }

  const handleDemoError = (err: string, code?: number) => {
    if (code === 429) {
      setDemoBanner(`Достигнут дневной лимит ${DEMO_MESSAGE_LIMIT} сообщений. Оформите подписку для безлимитного общения.`);
    } else if (code === 403) {
      setDemoBanner("Голосовые функции доступны только по подписке.");
    } else if (code === 503) {
      setDemoBanner("AI-сервис временно недоступен. Попробуйте позже.");
    } else {
      setDemoBanner(`Ошибка: ${err}`);
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
    <div className="chat-content">
      <style>{`
.chat-content { display: flex; flex: 1; min-height: 0; }
.chats-panel { width: 256px; flex-shrink: 0; background: #121212; padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; height: calc(100vh - 46px); }
.chats-panel-title { font-size: 16px; font-weight: 700; }
.chats-search { background: #121212; border: 1px solid #313131; border-radius: 4px; width: 100%; height: 30px; display: flex; align-items: center; gap: 10px; padding: 7px 12px; color: #848484; font-size: 12px; font-weight: 500; }
.chats-list { display: flex; flex-direction: column; gap: 8px; }
.chat-item { display: flex; gap: 8px; align-items: flex-start; padding: 6px; border-radius: 8px; background: #252525; cursor: pointer; }
.chat-item.active { background: #474747; border: 0.8px solid #969696; }
.chat-item-avatar { width: 40px; height: 40px; border-radius: 4px; flex-shrink: 0; background: #313131; }
.chat-item-message { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; min-width: 0; }
.chat-item-name { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-item-preview { font-size: 10px; font-weight: 500; color: #848484; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chat-item-dots { width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: transparent; border: none; color: #969696; font-size: 14px; }
.chat-center { flex: 1; display: flex; min-width: 0; padding: 0 18px; }
.chat-center-inner { width: 100%; max-width: 696px; display: flex; flex-direction: column; height: calc(100vh - 46px); }
.chat-header { display: flex; align-items: center; gap: 20px; padding: 20px 0 0 0; }
.chat-header-avatar { width: 46px; height: 46px; border-radius: 8px; border: 1px solid #313131; background: #313131; }
.chat-header-name { flex: 1; font-size: 24px; font-weight: 700; }
.chat-messages { flex: 1; display: flex; flex-direction: column; padding: 20px 0; overflow-y: auto; gap: 8px; }
.message { display: flex; flex-direction: column; gap: 4px; }
.message.from-ai { align-items: flex-start; max-width: 330px; }
.message.from-me { align-items: flex-end; align-self: flex-end; max-width: 330px; }
.message.from-ai .message-bubble { background: #1e1e1e; border-radius: 8px 8px 8px 1px; }
.message.from-me .message-bubble { background: linear-gradient(to right, #f95bad, #ff0084); border-radius: 8px 8px 1px 8px; }
.message-bubble { padding: 10px 12px; font-size: 10px; font-weight: 500; line-height: 1.3; word-break: break-word; }
.message-actions { display: flex; gap: 4px; align-items: center; }
.message-time { flex: 1; text-align: right; font-size: 10px; font-weight: 500; color: #848484; }
.action-btn { width: 24px; height: 24px; border-radius: 8px; background: rgba(48,39,43,0.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; color: #fff; font-size: 10px; }
.chat-input-bar { display: flex; align-items: center; gap: 8px; padding: 12px 0 24px 0; border-top: 1px solid #313131; }
.chat-text-input { background: #1e1e1e; border: 1px solid #313131; border-radius: 6px; height: 32px; flex: 1; padding: 6px 12px; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff; outline: none; }
.chat-text-input::placeholder { color: #848484; }
.input-icon-btn { width: 30px; height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 1px solid #313131; background: #121212; color: #fff; font-size: 12px; }
.new-chat-btn { background: linear-gradient(to right, #f95bad, #ff0084); border: none; color: #fff; width: 30px; height: 30px; border-radius: 4px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.new-chat-modal { padding: 12px; border-bottom: 1px solid #313131; }
.char-option { display: flex; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; align-items: center; }
.char-option:hover { background: #1e1e1e; }
.char-avatar { width: 32px; height: 32px; border-radius: 4px; background: linear-gradient(to right, #f95bad, #ff0084); flex-shrink: 0; }
.cancel-btn { background: #121212; border: 1px solid #313131; color: #969696; padding: 6px 14px; border-radius: 4px; font-size: 12px; cursor: pointer; margin-top: 8px; width: 100%; font-family: 'Syne', sans-serif; }
.demo-badge { margin-left: auto; background: rgba(249,91,173,0.2); border: 1px solid #f95bad; color: #f95bad; border-radius: 54px; font-size: 8px; padding: 4px 10px; }
.demo-banner { background: rgba(249,91,173,0.1); border: 1px solid rgba(228,0,120,0.2); border-radius: 8px; padding: 12px 16px; margin-top: 10px; font-size: 10px; }
.demo-banner-btn { background: linear-gradient(to right, #f95bad, #ff0084); border: none; color: #fff; padding: 6px 14px; border-radius: 4px; font-size: 10px; cursor: pointer; text-decoration: none; display: inline-block; font-family: 'Syne', sans-serif; }
.demo-banner-close { background: #121212; border: 1px solid #313131; color: #969696; padding: 6px 14px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: 'Syne', sans-serif; }
.empty-state { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 40px; }
.recording-bar { flex: 1; display: flex; align-items: center; gap: 12px; background: rgba(233,100,102,0.1); border: 1px solid #e36466; border-radius: 4px; padding: 6px 12px; }
.recording-dot { width: 8px; height: 8px; border-radius: 50%; background: #e36466; }
.recording-time { color: #e36466; font-size: 12px; font-weight: 600; flex: 1; }
.record-cancel-btn { background: #121212; border: 1px solid #313131; color: #969696; padding: 4px 12px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: 'Syne', sans-serif; }
.record-stop-btn { background: linear-gradient(to right, #f95bad, #ff0084); border: none; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; font-family: 'Syne', sans-serif; }
.abort-btn { background: #e36466; border: none; color: #fff; padding: 6px 14px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: 'Syne', sans-serif; }
.voice-label { font-size: 8px; color: #f95bad; margin-bottom: 4px; font-style: italic; }
.edit-textarea { background: #1e1e1e; border: 1px solid #f95bad; border-radius: 6px; color: #fff; font-size: 10px; padding: 8px 10px; resize: none; outline: none; width: 100%; line-height: 1.3; font-family: 'Syne', sans-serif; }
.edit-save-btn { background: linear-gradient(to right, #f95bad, #ff0084); border: none; color: #fff; padding: 4px 12px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: 'Syne', sans-serif; }
.edit-cancel-btn { background: #121212; border: 1px solid #313131; color: #969696; padding: 4px 12px; border-radius: 4px; font-size: 10px; cursor: pointer; font-family: 'Syne', sans-serif; }
.msg-bubble:hover .msg-actions { opacity: 1 !important; }
      `}</style>

      {/* Chats Panel */}
      <aside className="chats-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="chats-panel-title">Chats</h2>
          <button onClick={() => setShowNewChat(true)} className="new-chat-btn">+</button>
        </div>

        <div className="chats-search">
          <span>🔍</span>
          <span>Search</span>
        </div>

        {showNewChat && (
          <div className="new-chat-modal">
            <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 12 }}>Выберите персонажа:</h3>
            {charList.map((c) => (
              <div
                key={c.id}
                onClick={() => handleNewChat(c.id)}
                className="char-option"
              >
                <div className="char-avatar" />
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.name}</div>
                  <div style={{ color: "#848484", fontSize: 11 }}>
                    {c.tags.join(", ")}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => setShowNewChat(false)} className="cancel-btn">
              Отмена
            </button>
          </div>
        )}

        <div className="chats-list">
          {chatList.map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveChat(c.id)}
              className={`chat-item${c.id === activeChat ? " active" : ""}`}
            >
              <div className="chat-item-avatar" />
              <div className="chat-item-message">
                <div className="chat-item-name">
                  {c.character?.name || "Неизвестный"}
                </div>
                <div className="chat-item-preview">
                  {c.lastMessage?.content?.slice(0, 40) || c.title || "Новый чат"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(c.id);
                }}
                className="chat-item-dots"
                title="Удалить чат"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat Center */}
      <section className="chat-center">
        {activeChat ? (
          <div className="chat-center-inner">
            <div className="chat-header">
              <div className="chat-header-avatar" />
              <span className="chat-header-name">
                {activeChatData?.character?.name || "Чат"}
              </span>
              {isDemo && (
                <span className="demo-badge">Free</span>
              )}
            </div>

            {/* Demo banner */}
            {demoBanner && (
              <div className="demo-banner">
                <span>{demoBanner}</span>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <a href="/profile" className="demo-banner-btn">Оформить подписку</a>
                  <button onClick={() => setDemoBanner(null)} className="demo-banner-close">Закрыть</button>
                </div>
              </div>
            )}

            <div ref={scrollRef} className="chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message msg-bubble ${msg.role === "user" ? "from-me" : "from-ai"}`}
                >
                  {msg.type === "audio" && msg.role === "user" && (
                    <div className="voice-label">Голосовое сообщение</div>
                  )}

                  {/* Inline edit mode for user messages */}
                  {editingMsgId === msg.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="edit-textarea"
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
                        <button onClick={handleSubmitEdit} className="edit-save-btn" disabled={streaming}>
                          Сохранить
                        </button>
                        <button onClick={handleCancelEdit} className="edit-cancel-btn">
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="message-bubble">{msg.content}</div>
                  )}

                  <div className="message-actions" style={editingMsgId === msg.id ? { display: "none" } : {}}>
                    <span className="message-time">
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="msg-actions" style={{ display: "flex", gap: 4, alignItems: "center", opacity: 0, transition: "opacity 0.15s" }}>
                      {msg.role === "user" && !msg.id.startsWith("temp-") && (
                        <button
                          onClick={() => handleStartEdit(msg)}
                          className="action-btn"
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
                            className="action-btn"
                            style={isDemo ? { color: "#555", cursor: "default" } : {}}
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
                            className="action-btn"
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
                          className="action-btn"
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
                <div className="message from-ai">
                  <div className="message-bubble">{streamContent}</div>
                  <span className="message-time">печатает...</span>
                </div>
              )}
            </div>

            <div className="chat-input-bar">
              {streaming ? (
                <button onClick={handleAbort} className="abort-btn">
                  Стоп
                </button>
              ) : null}

              {recording ? (
                <div className="recording-bar">
                  <div className="recording-dot" />
                  <span className="recording-time">
                    {formatRecordingTime(recordingTime)}
                  </span>
                  <button onClick={cancelRecording} className="record-cancel-btn" title="Отмена">
                    Отмена
                  </button>
                  <button onClick={stopRecording} className="record-stop-btn" title="Отправить">
                    Отправить
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={startRecording}
                    disabled={streaming}
                    className="input-icon-btn"
                    style={isDemo ? { color: "#555", cursor: "default" } : {}}
                    title={isDemo ? "Голосовые функции доступны по подписке" : "Голосовое сообщение"}
                  >
                    {isDemo ? "🔒" : "🎤"}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="chat-text-input"
                    placeholder="Введите сообщение..."
                    disabled={streaming}
                  />
                  <button
                    onClick={handleSend}
                    disabled={streaming || !input.trim()}
                    className="input-icon-btn"
                    style={{ background: "linear-gradient(to right, #f95bad, #ff0084)", border: "none" }}
                  >
                    ➤
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2 style={{ color: "#fff", marginBottom: 12 }}>Выберите чат или создайте новый</h2>
            <p style={{ color: "#848484" }}>
              Нажмите + чтобы начать новый чат с AI-персонажем.
            </p>
            {isDemo && (
              <p style={{ color: "#f95bad", marginTop: 12, fontSize: 13 }}>
                Бесплатный план: {DEMO_MESSAGE_LIMIT} сообщений/день, без голосовых функций.{" "}
                <a href="/profile" style={{ color: "#f95bad" }}>Оформить подписку →</a>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
