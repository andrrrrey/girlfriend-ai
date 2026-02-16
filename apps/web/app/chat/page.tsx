"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/auth";
import {
  chats,
  characters as charactersApi,
  streamMessage,
  streamRegenerate,
  type ChatSession,
  type Message,
  type Character,
} from "../../lib/api";

export default function ChatPage() {
  const { user, loading } = useAuth();
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

  if (loading) return <div style={s.page}><p style={{ color: "#aaa", padding: 40 }}>Loading...</p></div>;
  if (!user) {
    return (
      <div style={s.page}>
        <div style={{ padding: 40 }}>
          <p style={{ color: "#aaa", marginBottom: 16 }}>Please log in to use the chat.</p>
          <a href="/login" style={s.link}>Login</a>
        </div>
      </div>
    );
  }

  const handleSend = () => {
    if (!input.trim() || !activeChat || streaming) return;
    const content = input.trim();
    setInput("");

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
        // Reload messages to get saved version with proper IDs
        loadMessages(activeChat);
        loadChats();
        setStreamContent("");
      },
      (err) => {
        setStreaming(false);
        setStreamContent(`[Error: ${err}]`);
      },
    );
  };

  const handleRegenerate = (msgId: string) => {
    if (!activeChat || streaming) return;
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
      (err) => {
        setStreaming(false);
        setStreamContent(`[Error: ${err}]`);
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

  const activeChatData = chatList.find((c) => c.id === activeChat);

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.logo}>
          <div style={s.logoBox} />
          <span>Leonardo.Ai</span>
        </div>
        <nav>
          <a href="/" style={s.menuItem}>Home</a>
          <a href="/chat" style={{ ...s.menuItem, ...s.menuActive }}>Chat</a>
          {user.role === "admin" && <a href="/admin" style={s.menuItem}>Admin</a>}
          <a href="/profile" style={s.menuItem}>Profile</a>
        </nav>
      </aside>

      {/* Chat List */}
      <section style={s.chatListPanel}>
        <div style={s.chatListHeader}>
          <h2 style={s.chatTitle}>Chats</h2>
          <button onClick={() => setShowNewChat(true)} style={s.newChatBtn}>+</button>
        </div>

        {showNewChat && (
          <div style={s.newChatModal}>
            <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 12 }}>Choose a character:</h3>
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
              Cancel
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
                  {c.character?.name || "Unknown"}
                </div>
                <div style={s.chatItemPreview}>
                  {c.lastMessage?.content?.slice(0, 40) || c.title || "New chat"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(c.id);
                }}
                style={s.deleteChatBtn}
                title="Delete chat"
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
                {activeChatData?.character?.name || "Chat"}
              </span>
            </div>

            <div ref={scrollRef} style={s.messagesScroll}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    ...s.bubble,
                    ...(msg.role === "user" ? s.bubbleUser : s.bubbleAi),
                  }}
                >
                  <div>{msg.content}</div>
                  <div style={s.msgMeta}>
                    <span style={s.msgDate}>
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {msg.role === "assistant" && !msg.id.startsWith("temp-") && (
                      <button
                        onClick={() => handleRegenerate(msg.id)}
                        style={s.msgAction}
                        disabled={streaming}
                        title="Regenerate"
                      >
                        Regen
                      </button>
                    )}
                    {!msg.id.startsWith("temp-") && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        style={s.msgAction}
                        title="Delete"
                      >
                        Del
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {streaming && streamContent && (
                <div style={{ ...s.bubble, ...s.bubbleAi }}>
                  <div>{streamContent}</div>
                  <span style={s.msgDate}>typing...</span>
                </div>
              )}
            </div>

            <div style={s.inputContainer}>
              {streaming ? (
                <button onClick={handleAbort} style={s.abortBtn}>
                  Stop
                </button>
              ) : null}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={s.chatInput}
                placeholder="Type a message..."
                disabled={streaming}
              />
              <button
                onClick={handleSend}
                disabled={streaming || !input.trim()}
                style={s.sendBtn}
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div style={s.emptyState}>
            <h2 style={{ color: "#fff", marginBottom: 12 }}>Select a chat or start a new one</h2>
            <p style={{ color: "#888" }}>
              Click + to create a new chat with an AI character.
            </p>
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
    display: "block",
    padding: "10px 15px",
    color: "#a0a0a0",
    textDecoration: "none",
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 4,
  },
  menuActive: { background: "#6c5ce7", color: "#fff" },

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
  },
  bubbleAi: { background: "#2d1b44", alignSelf: "flex-start" },
  bubbleUser: { background: "#4a3b61", alignSelf: "flex-end" },
  msgMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 4,
  },
  msgDate: { fontSize: 10, color: "#a0a0a0" },
  msgAction: {
    background: "transparent",
    border: "none",
    color: "#6c5ce7",
    fontSize: 10,
    cursor: "pointer",
    padding: 0,
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
