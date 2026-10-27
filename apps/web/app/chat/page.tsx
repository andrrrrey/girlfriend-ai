"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/auth";
import {
  chats,
  chatProfiles,
  type ChatProfile,
  characters as charactersApi,
  streamMessage,
  streamGreeting,
  streamRegenerate,
  streamVoiceMessage,
  streamEditMessage,
  fetchTTS,
  getPoseOptions,
  requestChatPhoto,
  confirmChatMedia,
  regenerateChatMedia,
  subscribeChatEvents,
  CHAT_MEDIA_EVENT,
  type ChatMediaEventDetail,
  resizedMediaUrl,
  type ChatSession,
  type ChatGalleryImage,
  type Message,
  type Character,
  type PoseOptionsResponse,
} from "../../lib/api";
import ChatPoseModal from "../components/ChatPoseModal";
import PremiumPopup, { premiumPopupFromError, type PremiumLimitType } from "../components/PremiumPopup";
import { useGeneration } from "../../context/generation";
import { useT } from "../../context/language";
import { useContentMode } from "../../context/contentMode";
import { showBrowserNotification } from "../../lib/browserNotify";
import { formatTags } from "../../lib/tags";
import { localizeOption } from "../../lib/optionLabel";

const DEMO_MESSAGE_LIMIT = 20;

function ChatPageInner() {
  const { user, loading } = useAuth();
  const { t, lang } = useT();
  const { mode: activeContentMode } = useContentMode();
  const router = useRouter();
  const { startGeneration, notifications, activeJobs } = useGeneration();
  const isDemo = !user || user.subscription === "free";
  const searchParams = useSearchParams();

  const [chatList, setChatList] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Полноэкранный просмотр картинки из чата (оригинал, без пережатия).
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxUrl(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [charList, setCharList] = useState<Character[]>([]);
  const [profilesList, setProfilesList] = useState<ChatProfile[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Chat search state
  const [chatSearch, setChatSearch] = useState("");

  // Demo banner state. `subscribeCta` controls whether the banner shows the
  // "Оформить подписку" button — we only want it for actual subscription/limit
  // errors, not for generic network/AI errors.
  const [demoBanner, setDemoBanner] = useState<{ message: string; subscribeCta: boolean } | null>(null);
  const [premiumPopup, setPremiumPopup] = useState<{ limitType: PremiumLimitType; limit: number; used: number } | null>(null);

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

  // Image generation state
  const [inputMode, setInputMode] = useState<"ask" | "image">("ask");
  const [showInputModeDropdown, setShowInputModeDropdown] = useState(false);
  // Выбор чат-профиля (персоны) — селектор в поле ввода сообщения
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [showPoseSelector, setShowPoseSelector] = useState(false);
  const [poseOptions, setPoseOptions] = useState<PoseOptionsResponse | null>(null);

  // «Choose a pose» зависит от режима контента: в SFW скрываются NSFW-позы.
  // Перезагружаем набор при смене режима (getPoseOptions шлёт mode=sfw в SFW).
  useEffect(() => {
    getPoseOptions().then(setPoseOptions).catch(() => {});
  }, [activeContentMode]);

  // Profile gallery carousel state
  const [galleryIndex, setGalleryIndex] = useState(0);
  // Фото персонажа, сгенерированные в чате (переживают сброс чата и перегенерацию)
  const [galleryItems, setGalleryItems] = useState<ChatGalleryImage[]>([]);

  // Load chat list
  const loadChats = useCallback(async () => {
    try {
      const res = await chats.list();
      setChatList(res.items);
      return res.items;
    } catch {
      return [] as ChatSession[];
    }
  }, []);

  // Load messages for active chat
  const loadMessages = useCallback(async (chatId: string): Promise<Message[]> => {
    try {
      const res = await chats.getMessages(chatId);
      setMessages(res.items);
      return res.items;
    } catch {
      setMessages([]);
      return [];
    }
  }, []);

  // Load character gallery (photos generated in this chat)
  const loadGallery = useCallback(async (chatId: string) => {
    try {
      setGalleryItems(await chats.getGallery(chatId));
    } catch {
      setGalleryItems([]);
    }
  }, []);

  // Чаты, для которых приветствие уже запрошено в этой сессии — чтобы не дублировать.
  const greetedRef = useRef<Set<string>>(new Set());

  // Персонаж пишет первым в пустом чате (один раз на сессию/чат).
  const startGreeting = (chatId: string) => {
    if (greetedRef.current.has(chatId)) return;
    greetedRef.current.add(chatId);
    setStreaming(true);
    setStreamContent("");
    abortRef.current = streamGreeting(
      chatId,
      lang === "ru" ? "ru" : "en",
      (delta) => setStreamContent((prev) => prev + delta),
      () => {
        setStreaming(false);
        loadMessages(chatId);
        loadChats();
        setStreamContent("");
      },
      () => {
        // Ошибка — позволяем повторить при следующем открытии чата.
        setStreaming(false);
        setStreamContent("");
        greetedRef.current.delete(chatId);
      },
    );
  };

  // Load user's chat profiles (personas) for the input-bar selector
  useEffect(() => {
    if (!loading && user) {
      chatProfiles.list().then(setProfilesList).catch(() => setProfilesList([]));
    }
  }, [loading, user]);

  // Persist the selected chat profile for the active chat
  const handleProfileChange = useCallback(async (profileId: string | null) => {
    if (!activeChat) return;
    setChatList((prev) => prev.map((c) => (c.id === activeChat ? { ...c, chatProfileId: profileId } : c)));
    try {
      await chats.update(activeChat, { chatProfileId: profileId });
    } catch {
      // revert on failure by reloading the list
      loadChats();
    }
  }, [activeChat, loadChats]);

  useEffect(() => {
    if (!loading && user) {
      const sessionId = searchParams?.get("sessionId");
      const characterId = searchParams?.get("characterId");

      loadChats().then(async (items) => {
        if (sessionId) {
          setActiveChat(sessionId);
        } else if (characterId) {
          const existing = items.find((c) => c.character?.id === characterId);
          if (existing) {
            setActiveChat(existing.id);
          } else {
            try {
              const newChat = await chats.create(characterId);
              await loadChats();
              setActiveChat(newChat.id);
            } catch {}
          }
        }
      });

      Promise.all([charactersApi.listPublic(), charactersApi.listMy()])
        .then(([pub, my]) => {
          const myIds = new Set(my.map((c: Character) => c.id));
          setCharList([...my, ...pub.items.filter((p: Character) => !myIds.has(p.id))]);
        })
        .catch(() => {});
    }
  }, [loading, user, loadChats, searchParams]);

  // Load messages only when the active chat changes — NOT on every chatList
  // update. Otherwise any background refresh of chatList (e.g. lastMessageAt
  // bump after sending) would overwrite optimistic user messages with the
  // server snapshot, making the just-sent message disappear from the UI
  // until the AI reply arrives.
  useEffect(() => {
    if (activeChat) {
      const chatId = activeChat;
      loadMessages(chatId).then((items) => {
        // Пустой чат → персонаж здоровается первым (один раз на сессию/чат).
        if (items.length === 0) startGreeting(chatId);
      });
      setGalleryItems([]);
      loadGallery(chatId);
      setShowPersonaDropdown(false);
      setGalleryIndex(0);
      // Auto-focus the message input
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, loadMessages, loadGallery]);

  // Mark chat as read whenever chatList updates with a new lastMessage or new
  // messages are loaded — separate from message loading so it doesn't trigger a
  // reload. We store the newest known timestamp (max of loaded messages and the
  // chat-list lastMessage) so the sidebar badge clears reliably even if the
  // chatList snapshot lags behind the messages actually shown, then notify the
  // sidebar to recompute its unread count.
  useEffect(() => {
    if (!activeChat) return;
    const chat = chatList.find((c) => c.id === activeChat);
    const candidates: number[] = [];
    if (chat?.lastMessage) candidates.push(new Date(chat.lastMessage.createdAt).getTime());
    for (const m of messages) {
      const t = new Date(m.createdAt).getTime();
      if (!Number.isNaN(t)) candidates.push(t);
    }
    if (candidates.length === 0) return;
    const newest = new Date(Math.max(...candidates)).toISOString();
    localStorage.setItem(`chat-read-${activeChat}`, newest);
    // Запоминаем, сколько сообщений ассистента «прочитано» — для бейджа
    // непрочитанных в списке чатов (unread = assistantCount − это значение).
    if (chat && typeof chat.assistantCount === "number") {
      localStorage.setItem(`chat-read-acount-${activeChat}`, String(chat.assistantCount));
    }
    window.dispatchEvent(new Event("chat-read"));
  }, [activeChat, chatList, messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamContent, activeJobs.length]);

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

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  // NOTE: do NOT early-return here based on `loading` / `user`.
  // There are more hooks (useMemo, useRef, useEffect) declared after the
  // helpers below — an early return would cause React to call a different
  // number of hooks on subsequent renders ("Rendered more hooks than during
  // the previous render"), which triggers the root error boundary
  // ("Something went wrong"). The loading / unauthenticated branches are
  // applied right before the final JSX return instead.

  const handleDemoError = (err: string, code?: number, body?: any) => {
    const popup = code === 429 || code === 403 || code === 402 ? premiumPopupFromError(body) : null;
    if (popup) {
      setPremiumPopup(popup);
    } else if (code === 403 && body?.error === "DEMO_FEATURE_BLOCKED") {
      setDemoBanner({ message: t("chat.voiceSubOnly"), subscribeCta: true });
    } else if (code === 503) {
      setDemoBanner({
        message: "AI-сервис временно недоступен. Попробуйте через минуту.",
        subscribeCta: false,
      });
    } else if (code === 502 || code === 504) {
      setDemoBanner({
        message: t("chat.aiError"),
        subscribeCta: false,
      });
    } else {
      setDemoBanner({ message: `Ошибка: ${err}`, subscribeCta: false });
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
        chatInputRef.current?.focus();
        // Браузерное уведомление о новом сообщении — только если вкладка не в
        // фокусе (иначе пользователь и так видит ответ).
        if (typeof document !== "undefined" && document.hidden) {
          showBrowserNotification(
            activeChatData?.character?.name || t("chat.chatFallback"),
            { body: t("notif.newMessage"), tag: `chat-${activeChat}`, url: `/chat?sessionId=${activeChat}` },
          );
        }
      },
      (err, code, body) => {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code, body);
        chatInputRef.current?.focus();
      },
    );
  };

  const handleRegenerate = (msgId: string) => {
    if (!activeChat || streaming) return;
    setDemoBanner(null);
    setStreaming(true);
    setStreamContent("");

    // Remove the target message and everything after it from UI — кроме
    // сгенерированных фото: бэкенд их тоже не удаляет (см. getMessagesAfter).
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx < 0) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1).filter((m) => m.type === "image")];
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
      (err, code, body) => {
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code, body);
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
      // Фото после редактируемого сообщения остаются (как и на бэкенде).
      const updated = [
        ...prev.slice(0, idx),
        { ...prev[idx], content },
        ...prev.slice(idx + 1).filter((m) => m.type === "image"),
      ];
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
      (err, code, body) => {
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code, body);
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
    } catch (err: any) {
      const popup = premiumPopupFromError(err?.body);
      if (popup) setPremiumPopup(popup);
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
      // Явно удалённое фото убирается и из галереи персонажа.
      loadGallery(activeChat);
    } catch {
      // error
    }
  };

  // Сброс чата: вся история очищается, чат остаётся в списке, фото — в галерее.
  const handleResetChat = async () => {
    if (!activeChat || streaming) return;
    if (!window.confirm(t("chat.resetChatConfirm"))) return;
    const chatId = activeChat;
    try {
      await chats.reset(chatId);
      setMessages([]);
      setEditingMsgId(null);
      setDemoBanner(null);
      loadChats();
      // После сброса персонаж снова здоровается первым.
      greetedRef.current.delete(chatId);
      startGreeting(chatId);
    } catch {
      loadMessages(chatId);
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
      (err, code, body) => {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code, body);
      },
      user?.lang || undefined,
    );
  };

  // ─── TTS playback ──────────────────────────────────────────────

  const handlePlayTTS = async (msgId: string) => {
    if (!activeChat) return;

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
    } catch (err: any) {
      setLoadingTTSId(null);
      const popup = premiumPopupFromError(err?.body);
      if (popup) setPremiumPopup(popup);
    }
  };

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const activeChatData = chatList.find((c) => c.id === activeChat);
  const activeChar = charList.find((c) => c.id === activeChatData?.character?.id);
  const activeCharPersonality = (activeChar?.personality as Record<string, unknown> | null) || {};
  // Генерации фото/видео этого чата — по ним в ленте показываются карточки-заглушки.
  const chatGenerations = activeJobs.filter((j) => j.source === "chat" && j.metadata?.chatId === activeChat);
  const generatingInThisChat = chatGenerations.length > 0;

  // Курсор всегда на поле ввода: возвращаем фокус, как только поле снова
  // активно (после отправки/перегенерации/генерации картинки, смены чата).
  useEffect(() => {
    if (activeChat && inputMode === "ask" && !streaming && !generatingInThisChat) {
      chatInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, inputMode, streaming, generatingInThisChat, messages.length]);

  const galleryImages = useMemo(() => {
    const imgs: { url: string; label: string }[] = [];
    const avatarUrl = activeChatData?.character?.avatarUrl;
    if (avatarUrl) imgs.push({ url: avatarUrl, label: "Avatar" });
    // Фото из чата берём из галереи, а не из сообщений: они остаются в профиле
    // персонажа и после сброса чата.
    for (const img of galleryItems) {
      imgs.push({ url: img.mediaUrl, label: img.content || "Generated" });
    }
    return imgs;
  }, [galleryItems, activeChatData]);

  // Индекс галереи не должен выходить за её границы: иначе после удаления
  // сообщений (перегенерация, удаление фото) панель профиля оставалась пустой —
  // без фото и даже без аватара — до перезагрузки страницы.
  useEffect(() => {
    if (galleryIndex > 0 && galleryIndex >= galleryImages.length) {
      setGalleryIndex(Math.max(0, galleryImages.length - 1));
    }
  }, [galleryIndex, galleryImages.length]);

  const handledJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const n of notifications) {
      if (n.source !== "chat" || handledJobsRef.current.has(n.jobId)) continue;
      const chatId = n.metadata?.chatId as string | undefined;
      if (!chatId) continue;

      if (n.status === "completed") {
        handledJobsRef.current.add(n.jobId);
        // Медиасообщение в диалог добавил сервер (ещё до статуса completed) —
        // только перечитываем ленту и галерею. Главным фото (аватаром) остаётся
        // текущее — индекс галереи не переключаем на новый кадр.
        if (chatId === activeChat) {
          chats.getMessages(chatId).then((res) => setMessages(res.items));
          loadGallery(chatId);
        }
      } else if (n.status === "failed") {
        handledJobsRef.current.add(n.jobId);
      }
    }
  }, [notifications, activeChat, loadGallery]);

  const handleOpenPoseSelector = async () => {
    if (!poseOptions) {
      try {
        const opts = await getPoseOptions();
        setPoseOptions(opts);
      } catch { return; }
    }
    setShowPoseSelector(true);
  };

  const handleGenerateImage = async (poseName: string, _posePrompt?: string) => {
    if (!activeChat || generatingInThisChat) return;
    setShowPoseSelector(false);

    try {
      // Промпт (внешность персонажа + поза), чекпоинт и стиль собирает сервер;
      // готовое фото он сам добавит в диалог (см. ChatMediaService).
      const { jobId, kind } = await requestChatPhoto(activeChat, poseName, activeContentMode);
      startGeneration(jobId, kind, poseName, "", "chat", { chatId: activeChat, poseName });
    } catch (err: any) {
      const popup = premiumPopupFromError(err?.body);
      if (popup) setPremiumPopup(popup);
    }
  };

  // Фото/видео по просьбе в тексте или голосом (роутер намерений на сервере):
  // pending — показываем прогресс; rejected — попап кредитов/лимита; confirm —
  // предложение с ценой придёт сообщением с кнопкой.
  useEffect(() => {
    const onMedia = (e: Event) => {
      const detail = (e as CustomEvent<ChatMediaEventDetail>).detail;
      if (detail.status === "pending" && detail.jobId) {
        startGeneration(detail.jobId, detail.kind, detail.kind, "", "chat", { chatId: detail.chatId, poseName: detail.kind });
      } else if (detail.status === "rejected") {
        const popup = premiumPopupFromError(detail.error);
        if (popup) setPremiumPopup(popup);
      }
    };
    window.addEventListener(CHAT_MEDIA_EVENT, onMedia);
    return () => window.removeEventListener(CHAT_MEDIA_EVENT, onMedia);
  }, [startGeneration]);

  // События чата в реальном времени: сообщения из Telegram, ответы персонажа и
  // готовые фото появляются без перезагрузки страницы. Пачку событий
  // схлопываем в одно перечитывание ленты.
  useEffect(() => {
    if (!activeChat) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let galleryChanged = false;
    const unsubscribe = subscribeChatEvents(activeChat, (event) => {
      if (event.messageType === "image" || event.messageType === "video") galleryChanged = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        chats.getMessages(activeChat).then((res) => setMessages(res.items)).catch(() => undefined);
        loadChats();
        if (galleryChanged) loadGallery(activeChat);
        galleryChanged = false;
      }, 300);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);

  /** Подтверждение цены фото/видео, предложенного персонажем. */
  const handleConfirmMedia = async (token: string) => {
    if (!activeChat) return;
    try {
      const { jobId, kind } = await confirmChatMedia(activeChat, token);
      startGeneration(jobId, kind, kind, "", "chat", { chatId: activeChat, poseName: kind });
      chats.getMessages(activeChat).then((res) => setMessages(res.items));
    } catch (err: any) {
      const popup = premiumPopupFromError(err?.body);
      if (popup) setPremiumPopup(popup);
      else setDemoBanner({ message: err?.body?.message || err.message, subscribeCta: false });
    }
  };

  /** Перегенерация фото/видео из ленты: сервер повторит ту же спецификацию. */
  const handleRegenerateMedia = async (msgId: string) => {
    if (!activeChat || generatingInThisChat) return;
    try {
      const { jobId, kind } = await regenerateChatMedia(activeChat, msgId, activeContentMode);
      startGeneration(jobId, kind, kind, "", "chat", { chatId: activeChat, poseName: kind });
    } catch (err: any) {
      const popup = premiumPopupFromError(err?.body);
      if (popup) setPremiumPopup(popup);
    }
  };

  // Круглая иконка с фото персонажа рядом с каждым его сообщением.
  const charAvatarUrl = activeChatData?.character?.avatarUrl;
  const charMsgAvatar = (
    <div className="msg-char-avatar">
      {charAvatarUrl && (
        <img
          src={resizedMediaUrl(charAvatarUrl, { w: 128 }) ?? charAvatarUrl}
          alt={activeChatData?.character?.name || ""}
          loading="lazy"
          decoding="async"
        />
      )}
    </div>
  );

  // Auth gates — placed here (after all hooks) on purpose. See note above.
  if (loading) return <div className="chat-content"><p style={{ color: "#aaa", padding: 40 }}>{t("common.loading")}</p></div>;
  if (!user) return null;

  return (
    <div className={`chat-content${activeChat ? " chat-has-active" : ""}`}>
      <style>{`
.chat-content { display: flex; flex: 1; min-height: 0; }
/* Скроллбар в цвет сайта (розовый акцент на тёмном фоне) */
.chat-messages, .chats-panel, .right-panel { scrollbar-width: thin; scrollbar-color: #f95bad #121212; }
.chat-messages::-webkit-scrollbar, .chats-panel::-webkit-scrollbar, .right-panel::-webkit-scrollbar { width: 8px; height: 8px; }
.chat-messages::-webkit-scrollbar-track, .chats-panel::-webkit-scrollbar-track, .right-panel::-webkit-scrollbar-track { background: #121212; border-radius: 4px; }
.chat-messages::-webkit-scrollbar-thumb, .chats-panel::-webkit-scrollbar-thumb, .right-panel::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #f95bad, #ff0084); border-radius: 4px; }
.chat-messages::-webkit-scrollbar-thumb:hover, .chats-panel::-webkit-scrollbar-thumb:hover, .right-panel::-webkit-scrollbar-thumb:hover { background: #ff0084; }
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
.chat-item-unread { align-self: center; flex-shrink: 0; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: linear-gradient(to right, #f95bad, #ff0084); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
.chat-center { flex: 1; display: flex; min-width: 0; padding: 0 18px; }
.chat-center-inner { width: 100%; display: flex; flex-direction: column; height: calc(100vh - 46px); }
.chat-header { display: flex; align-items: center; gap: 20px; padding: 20px 0 0 0; }
.chat-header-avatar { width: 46px; height: 46px; border-radius: 8px; border: 1px solid #313131; background: #313131; }
.chat-header-name { flex: 1; font-size: 24px; font-weight: 700; }
.chat-back-btn { display: none; }
.chat-reset-btn { display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; background: #1e1e1e; border: 1px solid #313131; border-radius: 6px; color: #fff; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; flex-shrink: 0; transition: border-color 0.2s; }
.chat-reset-btn:hover:not(:disabled) { border-color: #f95bad; }
.chat-reset-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.persona-btn { max-width: 160px; }
.persona-btn-label { overflow: hidden; text-overflow: ellipsis; }
.persona-btn.selected { border-color: rgba(249,91,173,0.6); }
.persona-dropdown { min-width: 180px; max-height: 260px; overflow-y: auto; }
.persona-dropdown .input-mode-option { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; text-align: left; }
.persona-dropdown-title { padding: 6px 12px 4px; font-size: 10px; font-weight: 500; color: #848484; }
.chat-messages { flex: 1; display: flex; flex-direction: column; padding: 20px 10px 20px 0; overflow-y: auto; gap: 8px; }
.message-row { display: flex; gap: 8px; align-items: flex-start; }
.message-row.from-me-row { justify-content: flex-end; }
.message-row.from-ai-row .message.from-ai { flex: 1 1 auto; min-width: 0; }
.msg-char-avatar { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #313131; border: 1px solid #313131; }
.msg-char-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }
.message { display: flex; flex-direction: column; gap: 4px; }
.message.from-ai { align-items: flex-start; max-width: 65%; }
.message.from-me { align-items: flex-end; align-self: flex-end; max-width: 65%; }
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
.ask-btn { background: #1e1e1e; border-radius: 4px; height: 32px; padding: 7px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0; border: none; font-family: 'Syne', sans-serif; }
.ask-btn-text { font-size: 10px; font-weight: 500; color: #969696; }
.input-mode-dropdown-wrap { position: relative; flex-shrink: 0; }
.input-mode-btn { display: flex; align-items: center; gap: 6px; padding: 7px 12px; background: #1e1e1e; border: 1px solid #313131; border-radius: 6px; color: #fff; font-size: 12px; font-weight: 500; cursor: pointer; font-family: 'Syne', sans-serif; height: 32px; white-space: nowrap; }
.input-mode-btn:hover { border-color: #f95bad; }
.input-mode-dropdown { position: absolute; bottom: calc(100% + 6px); left: 0; background: #1a1a1a; border: 1px solid #313131; border-radius: 8px; padding: 4px; z-index: 10; min-width: 130px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.input-mode-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; background: transparent; border: none; color: #fff; font-size: 12px; font-weight: 500; cursor: pointer; border-radius: 6px; font-family: 'Syne', sans-serif; }
.input-mode-option:hover { background: #2a2a2a; }
.input-mode-option.active { background: rgba(249,91,173,0.15); color: #f95bad; }
.choose-pose-btn { flex: 1; height: 32px; background: linear-gradient(to right, #f95bad, #ff0084); border: none; color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Syne', sans-serif; }
.choose-pose-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.image-message { padding: 4px !important; }
.chat-gen-image { max-width: 300px; width: 100%; border-radius: 8px; cursor: zoom-in; display: block; }
.chat-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.92); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
.chat-lightbox-media { max-width: 90vw; max-height: 90vh; border-radius: 8px; object-fit: contain; box-shadow: 0 0 60px rgba(0,0,0,0.8); cursor: default; }
.chat-lightbox-close { position: absolute; top: 20px; right: 20px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.1); border: none; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.chat-lightbox-close:hover { background: rgba(255,255,255,0.2); }
.generating-indicator { display: flex; align-items: center; gap: 8px; }
.generating-spinner { width: 14px; height: 14px; border: 2px solid #f95bad; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.media-generating { position: relative; width: 240px; max-width: 100%; aspect-ratio: 3 / 4; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 55%, #12081f 100%); color: #f95bad; }
.media-generating-video { aspect-ratio: 9 / 16; width: 200px; }
.media-generating::before { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 25%, rgba(249,91,173,0.18) 45%, rgba(255,255,255,0.12) 50%, rgba(249,91,173,0.18) 55%, transparent 75%); background-size: 250% 100%; animation: media-shimmer 1.8s ease-in-out infinite; }
.media-generating-icon { position: relative; display: flex; animation: media-pulse 1.6s ease-in-out infinite; filter: drop-shadow(0 0 10px rgba(249,91,173,0.55)); }
.media-generating-label { position: relative; color: #e8d6ef; font-size: 13px; font-weight: 500; }
.media-generating-dots i { font-style: normal; animation: media-dot 1.4s infinite; opacity: 0; }
.media-generating-dots i:nth-child(2) { animation-delay: 0.2s; }
.media-generating-dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes media-shimmer { 0% { background-position: 150% 0; } 100% { background-position: -100% 0; } }
@keyframes media-pulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.12); opacity: 1; } }
@keyframes media-dot { 0%, 20% { opacity: 0; } 40%, 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .media-generating::before, .media-generating-icon, .media-generating-dots i { animation: none; opacity: 1; } }
.right-panel { width: 256px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; padding: 20px; overflow-y: auto; height: calc(100vh - 46px); }
.profile-gallery { width: 100%; height: 300px; border-radius: 8px; border: 1px solid #252525; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; padding: 8px; }
.profile-gallery .gallery-bg { position: absolute; inset: 0; pointer-events: none; border-radius: 8px; background: linear-gradient(135deg, #2d1b3d 0%, #1a0a2e 50%, #0d0d1a 100%); }
.profile-gallery .gallery-bg-overlay { position: absolute; inset: 0; border-radius: 8px; background: linear-gradient(to bottom, rgba(9,9,9,0) 56%, rgba(9,9,9,0.8)); }
.profile-gallery .small-avatar { width: 40px; height: 40px; border-radius: 8px; border: 1px solid #313131; position: relative; overflow: visible; z-index: 2; background: #313131; }
.profile-gallery .small-avatar .link-badge { position: absolute; right: -3.5px; bottom: -3.5px; width: 16px; height: 16px; border-radius: 34px; background: linear-gradient(to right, #f95bad, #ff0084); display: flex; align-items: center; justify-content: center; }
.profile-slider { display: flex; gap: 2px; width: 100%; position: relative; z-index: 2; margin-top: 8px; }
.slider-bar { flex: 1; height: 2px; position: relative; }
.slider-bar.active .slider-bar-inner { background: #f95bad; box-shadow: 0px 0px 5px 1px rgba(228,0,120,0.6); border-radius: 1px; position: absolute; inset: 0; }
.slider-bar.inactive { opacity: 0.7; }
.slider-bar.inactive .slider-bar-inner { background: #46383e; border-radius: 1px; position: absolute; inset: 0; }
.profile-buttons { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.profile-btn-secondary { background: #121212; border: 1px solid #313131; border-radius: 4px; height: 30px; width: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff; cursor: pointer; }
.profile-btn-primary { background: linear-gradient(to right, #f95bad, #ff0084); border: none; border-radius: 4px; height: 30px; width: 100%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; font-family: 'Syne', sans-serif; color: #fff; cursor: pointer; }
.profile-text { display: flex; flex-direction: column; gap: 8px; }
.profile-name { font-size: 20px; font-weight: 700; line-height: 1.2; }
.profile-bio { font-size: 10px; font-weight: 500; line-height: 1.3; color: #fff; }
.profile-separator { width: 100%; height: 1px; background: rgba(255,255,255,0.08); }
.about-me { display: flex; flex-direction: column; gap: 12px; }
.about-me-title { font-size: 12px; font-weight: 500; line-height: 1.2; }
.info-card { display: flex; gap: 8px; align-items: center; height: 28px; }
.info-card-icon { width: 28px; height: 28px; border-radius: 30px; background: #313131; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; padding: 6px; }
.info-card-text { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.info-card-label { font-size: 7px; font-weight: 500; text-transform: uppercase; color: #848484; line-height: 1.2; }
.info-card-value { font-size: 10px; font-weight: 500; line-height: 1.3; color: #fff; }
.gallery-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 5; color: #fff; }
.gallery-nav:hover { background: rgba(0,0,0,0.7); }
.gallery-nav-left { left: 8px; }
.gallery-nav-right { right: 8px; }
@media (max-width: 1024px) { .right-panel { display: none; } }
@media (max-width: 768px) {
  .chat-content { flex-direction: column; }
  /* Показываем ЛИБО список чатов, ЛИБО переписку — не стопкой. Так логичнее:
     тапнул чат → открылась переписка на весь экран, кнопка «назад» → список. */
  .chats-panel { width: 100%; height: calc(100vh - 46px - 90px); max-height: none; flex-shrink: 1; }
  .chat-center { padding: 0 10px; }
  .chat-center-inner { height: calc(100vh - 46px); }
  .chat-content.chat-has-active .chats-panel { display: none; }
  .chat-content:not(.chat-has-active) .chat-center { display: none; }
  .chat-back-btn {
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: none; color: #fff; padding: 4px;
    cursor: pointer; flex-shrink: 0;
  }
  .chat-header { gap: 10px; }
  .chat-header-name { font-size: 18px; }
  .chat-reset-label { display: none; }
  /* На телефоне селектор профиля — только иконка, имя видно в выпадающем списке */
  .persona-btn-label { display: none; }
}
      `}</style>

      {/* Chats Panel */}
      <aside className="chats-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="chats-panel-title">{t("chat.title")}</h2>
        </div>

        <div className="chats-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
          <input
            type="text"
            placeholder={t("chat.searchProfile")}
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "#fff", fontSize: 12, fontWeight: 500, fontFamily: "'Syne', sans-serif",
            }}
          />
          {chatSearch && (
            <button
              onClick={() => setChatSearch("")}
              style={{ background: "none", border: "none", color: "#848484", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>

        {showNewChat && (
          <div className="new-chat-modal">
            <h3 style={{ color: "#fff", fontSize: 14, marginBottom: 12 }}>{t("chat.chooseCharacter")}</h3>
            {charList.map((c) => (
              <div
                key={c.id}
                onClick={() => handleNewChat(c.id)}
                className="char-option"
              >
                <div className="char-avatar" style={{overflow:'hidden'}}>
                  {c.avatarUrl && <img src={resizedMediaUrl(c.avatarUrl, { w: 256 }) ?? c.avatarUrl} alt={c.name} loading="lazy" decoding="async" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:4}} />}
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.name}</div>
                  <div style={{ color: "#848484", fontSize: 11 }}>
                    {formatTags(c.tags).join(", ")}
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
          {chatList.filter((c) => {
            if (!chatSearch.trim()) return true;
            const q = chatSearch.trim().toLowerCase();
            const name = (c.character?.name || "").toLowerCase();
            const preview = (c.lastMessage?.content || c.title || "").toLowerCase();
            return name.includes(q) || preview.includes(q);
          }).map((c) => (
            <div
              key={c.id}
              onClick={() => setActiveChat(c.id)}
              className={`chat-item${c.id === activeChat ? " active" : ""}`}
            >
              <div className="chat-item-avatar" style={{overflow:'hidden',borderRadius:4}}>
                {c.character?.avatarUrl && (
                  <img src={resizedMediaUrl(c.character.avatarUrl, { w: 256 }) ?? c.character.avatarUrl} alt={c.character.name} loading="lazy" decoding="async" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                )}
              </div>
              <div className="chat-item-message">
                <div className="chat-item-name">
                  {c.character?.name || t("chat.unknownCharacter")}
                </div>
                <div className="chat-item-preview">
                  {c.lastMessage?.content?.slice(0, 40) || c.title || t("chat.newChat")}
                </div>
              </div>
              {(() => {
                if (c.id === activeChat) return null;
                const readAcount = Number(localStorage.getItem(`chat-read-acount-${c.id}`) || "0");
                const unread = Math.max(0, (c.assistantCount ?? 0) - readAcount);
                if (unread <= 0) return null;
                return <span className="chat-item-unread">{unread > 99 ? "99+" : unread}</span>;
              })()}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(c.id);
                }}
                className="chat-item-dots"
                title={t("chat.deleteChat")}
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
              <button
                className="chat-back-btn"
                onClick={() => setActiveChat(null)}
                aria-label={t("common.back")}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div className="chat-header-avatar" style={{overflow:'hidden'}}>
                {activeChatData?.character?.avatarUrl && (
                  <img src={resizedMediaUrl(activeChatData.character.avatarUrl, { w: 256 }) ?? activeChatData.character.avatarUrl} alt={activeChatData.character.name} decoding="async" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}} />
                )}
              </div>
              <span className="chat-header-name">
                {activeChatData?.character?.name || t("chat.chatFallback")}
              </span>
              <button
                className="chat-reset-btn"
                onClick={handleResetChat}
                disabled={streaming}
                title={t("chat.resetChat")}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2.5 8a5.5 5.5 0 109.9-3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M12.8 1.8v3.2H9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="chat-reset-label">{t("chat.resetChat")}</span>
              </button>
              {isDemo && (
                <span className="demo-badge">{t("chat.freeBadge")}</span>
              )}
            </div>

            {/* Demo banner */}
            {demoBanner && (
              <div className="demo-banner">
                <span>{demoBanner.message}</span>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  {demoBanner.subscribeCta && (
                    <Link href="/profile" className="demo-banner-btn">{t("chat.subscribe")}</Link>
                  )}
                  <button onClick={() => setDemoBanner(null)} className="demo-banner-close">{t("common.close")}</button>
                </div>
              </div>
            )}

            <div ref={scrollRef} className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`message-row ${msg.role === "user" ? "from-me-row" : "from-ai-row"}`}>
                  {msg.role !== "user" && charMsgAvatar}
                  <div
                    className={`message msg-bubble ${msg.role === "user" ? "from-me" : "from-ai"}`}
                  >
                    {msg.type === "audio" && msg.role === "user" && (
                      <div className="voice-label">{t("chat.voiceMessage")}</div>
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
                    ) : msg.type === "image" && msg.mediaUrl ? (
                      <div className="message-bubble image-message">
                        {/* В ленте — webp 768/q90 (хватает для 300px на ретине и
                            грузится в разы быстрее PNG); по клику — оригинал. */}
                        <img
                          src={resizedMediaUrl(msg.mediaUrl, { w: 768, q: 90 }) ?? msg.mediaUrl}
                          alt={msg.content}
                          className="chat-gen-image"
                          decoding="async"
                          onClick={() => setLightboxUrl(msg.mediaUrl!)}
                        />
                      </div>
                    ) : msg.type === "video" && msg.mediaUrl ? (
                      <div className="message-bubble image-message">
                        <video src={msg.mediaUrl} className="chat-gen-image" controls playsInline preload="metadata" />
                      </div>
                    ) : msg.type === "image" && !msg.mediaUrl ? (
                      <div className="message-bubble generating-indicator">
                        <div className="generating-spinner" />
                        <span>{msg.content}</span>
                      </div>
                    ) : (
                      <div className="message-bubble">
                        {msg.content}
                        {(() => {
                          // Предложение фото/видео с ценой — кнопка подтверждения.
                          const offer = (msg.metadata as Record<string, any> | null)?.mediaConfirm;
                          if (!offer?.token || offer.status !== "pending") return null;
                          return (
                            <div style={{ marginTop: 8 }}>
                              <button
                                className="edit-save-btn"
                                disabled={streaming || generatingInThisChat}
                                onClick={() => handleConfirmMedia(offer.token)}
                              >
                                {t("chat.mediaConfirm", { price: String(offer.price ?? "") })}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    <div className="message-actions" style={editingMsgId === msg.id ? { display: "none" } : {}}>
                      <span className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <div className="msg-actions" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {msg.role === "assistant" && !msg.id.startsWith("temp-") && (msg.type === "image" || msg.type === "video") && (
                          <>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="action-btn"
                              title={t("common.delete")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button
                              onClick={() => handleRegenerateMedia(msg.id)}
                              className="action-btn"
                              disabled={streaming || generatingInThisChat}
                              title={t("chat.regenerate")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 2v3h3M10.5 10V7h-3" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.3 4.5A4 4 0 003 3L1.5 5M2.7 7.5A4 4 0 009 9l1.5-2" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                        {msg.role === "assistant" && !msg.id.startsWith("temp-") && msg.type !== "image" && msg.type !== "video" && (
                          <>
                            <button
                              onClick={() => handlePlayTTS(msg.id)}
                              className="action-btn"
                              disabled={loadingTTSId === msg.id}
                              title={playingTTSId === msg.id ? t("chat.pause") : t("chat.play")}
                            >
                              {playingTTSId === msg.id ? (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2.5" y="2" width="2.5" height="8" rx="0.5" fill="#fff"/><rect x="7" y="2" width="2.5" height="8" rx="0.5" fill="#fff"/></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 1.5v9l7-4.5-7-4.5z" fill="#fff"/></svg>
                              )}
                            </button>
                            <button className="action-btn" title={t("chat.copy")} onClick={() => navigator.clipboard?.writeText(msg.content)}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="#fff" strokeWidth="0.8"/><path d="M8 4V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V7a1 1 0 001 1H4" stroke="#fff" strokeWidth="0.8"/></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="action-btn"
                              title={t("common.delete")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button
                              onClick={() => handleRegenerate(msg.id)}
                              className="action-btn"
                              disabled={streaming}
                              title={t("chat.regenerate")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 2v3h3M10.5 10V7h-3" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.3 4.5A4 4 0 003 3L1.5 5M2.7 7.5A4 4 0 009 9l1.5-2" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                        {msg.role === "user" && !msg.id.startsWith("temp-") && (
                          <>
                            <button className="action-btn" title={t("chat.copy")} onClick={() => navigator.clipboard?.writeText(msg.content)}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="#fff" strokeWidth="0.8"/><path d="M8 4V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V7a1 1 0 001 1H4" stroke="#fff" strokeWidth="0.8"/></svg>
                            </button>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="action-btn"
                              title={t("common.delete")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button
                              onClick={() => handleStartEdit(msg)}
                              className="action-btn"
                              disabled={streaming}
                              title={t("chat.edit")}
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5V8.5l7-7z" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {streaming && streamContent && (
                <div className="message-row from-ai-row">
                  {charMsgAvatar}
                  <div className="message from-ai">
                    <div className="message-bubble">{streamContent}</div>
                    <span className="message-time">{t("chat.typing")}</span>
                  </div>
                </div>
              )}

              {chatGenerations.map((job) => (
                // Карточка-заглушка размера будущего фото/видео с анимацией,
                // пока идёт генерация; готовое медиа сервер добавит в ленту сам.
                <div key={job.jobId} className="message-row from-ai-row">
                  {charMsgAvatar}
                  <div className="message from-ai">
                    <div className="message-bubble image-message">
                      <div className={`media-generating${job.type === "video" ? " media-generating-video" : ""}`}>
                        <div className="media-generating-icon">
                          {job.type === "video" ? (
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>
                          ) : (
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>
                          )}
                        </div>
                        <span className="media-generating-label">
                          {t(job.type === "video" ? "chat.generatingVideo" : "chat.generatingPhoto")}
                          <span className="media-generating-dots"><i>.</i><i>.</i><i>.</i></span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="chat-input-bar">
              {streaming ? (
                <button onClick={handleAbort} className="abort-btn">
                  {t("chat.stop")}
                </button>
              ) : null}

              {recording ? (
                <div className="recording-bar">
                  <div className="recording-dot" />
                  <span className="recording-time">
                    {formatRecordingTime(recordingTime)}
                  </span>
                  <button onClick={cancelRecording} className="record-cancel-btn" title={t("common.cancel")}>
                    {t("common.cancel")}
                  </button>
                  <button onClick={stopRecording} className="record-stop-btn" title={t("chat.send")}>
                    {t("chat.send")}
                  </button>
                </div>
              ) : (
                <>
                  {/* От чьего лица пишет пользователь — чат-профиль (персона) */}
                  <div className="input-mode-dropdown-wrap">
                    {(() => {
                      const selectedProfile = profilesList.find((p) => p.id === activeChatData?.chatProfileId);
                      return (
                        <button
                          className={`input-mode-btn persona-btn${selectedProfile ? " selected" : ""}`}
                          onClick={() => { setShowPersonaDropdown(!showPersonaDropdown); setShowInputModeDropdown(false); }}
                          title={t("chat.selectChatProfile")}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><circle cx="8" cy="5.5" r="2.75" stroke="#fff" strokeWidth="1.2"/><path d="M2.75 14c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                          <span className="persona-btn-label">{selectedProfile ? selectedProfile.name : t("chat.noProfile")}</span>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, flexShrink: 0 }}>
                            <path d="M2.5 4L5 6.5L7.5 4" stroke="#888" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      );
                    })()}
                    {showPersonaDropdown && (
                      <div className="input-mode-dropdown persona-dropdown">
                        <div className="persona-dropdown-title">{t("chat.selectChatProfile")}</div>
                        <button
                          className={`input-mode-option ${!activeChatData?.chatProfileId ? "active" : ""}`}
                          onClick={() => { handleProfileChange(null); setShowPersonaDropdown(false); }}
                        >
                          {t("chat.noProfile")}
                        </button>
                        {profilesList.map((p) => (
                          <button
                            key={p.id}
                            className={`input-mode-option ${activeChatData?.chatProfileId === p.id ? "active" : ""}`}
                            onClick={() => { handleProfileChange(p.id); setShowPersonaDropdown(false); }}
                            title={p.name}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="input-mode-dropdown-wrap">
                    <button
                      className="input-mode-btn"
                      onClick={() => { setShowInputModeDropdown(!showInputModeDropdown); setShowPersonaDropdown(false); }}
                    >
                      {inputMode === "ask" ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 6.5h12M2 10h8M2 13.5h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" fill="#fff"/><path d="M1.5 11l3.5-3.5 2.5 2.5 2-2L14.5 13" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                      {inputMode === "ask" ? t("chat.modeAsk") : t("chat.modeImage")}
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2 }}>
                        <path d="M2.5 4L5 6.5L7.5 4" stroke="#888" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {showInputModeDropdown && (
                      <div className="input-mode-dropdown">
                        <button
                          className={`input-mode-option ${inputMode === "ask" ? "active" : ""}`}
                          onClick={() => { setInputMode("ask"); setShowInputModeDropdown(false); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 6.5h12M2 10h8M2 13.5h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                          {t("chat.modeAsk")}
                        </button>
                        <button
                          className={`input-mode-option ${inputMode === "image" ? "active" : ""}`}
                          onClick={() => { setInputMode("image"); setShowInputModeDropdown(false); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" fill="#fff"/><path d="M1.5 11l3.5-3.5 2.5 2.5 2-2L14.5 13" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {t("chat.modeImage")}
                        </button>
                      </div>
                    )}
                  </div>

                  {inputMode === "ask" ? (
                    <>
                      <input
                        ref={chatInputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="chat-text-input"
                        placeholder={t("chat.inputPlaceholder")}
                        disabled={streaming || generatingInThisChat}
                        autoFocus
                      />
                      <button
                        onClick={startRecording}
                        disabled={streaming || generatingInThisChat}
                        className="input-icon-btn"
                        title={t("chat.voiceMessage")}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0.5C6.17 0.5 5.5 1.17 5.5 2v5c0 0.83 0.67 1.5 1.5 1.5s1.5-0.67 1.5-1.5V2c0-0.83-0.67-1.5-1.5-1.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 6v1a4 4 0 008 0V6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 11.5V13.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={streaming || generatingInThisChat || !input.trim()}
                        className="input-icon-btn send"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleOpenPoseSelector}
                      disabled={streaming || generatingInThisChat}
                      className="choose-pose-btn"
                    >
                      {generatingInThisChat ? t("chat.generating") : t("chat.choosePose")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2 style={{ color: "#fff", marginBottom: 12 }}>{t("chat.emptyTitle")}</h2>
            <p style={{ color: "#848484" }}>
              {t("chat.emptyDesc")}
            </p>
            {isDemo && (
              <p style={{ color: "#f95bad", marginTop: 12, fontSize: 13 }}>
                {t("chat.demoPlan", { limit: DEMO_MESSAGE_LIMIT })}{" "}
                <Link href="/profile" style={{ color: "#f95bad" }}>{t("chat.subscribeArrow")}</Link>
              </p>
            )}
          </div>
        )}
      </section>

      {/* Right Info Panel */}
      {activeChat && (
        <aside className="right-panel">
          {/* Profile Gallery */}
          <div
            className="profile-gallery"
            style={galleryImages[galleryIndex]
              ? { backgroundImage: `url(${resizedMediaUrl(galleryImages[galleryIndex].url, { w: 768, q: 90 }) ?? galleryImages[galleryIndex].url})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
              : {}
            }
          >
            {!galleryImages[galleryIndex] && (
              <div className="gallery-bg">
                <div className="gallery-bg-overlay" />
              </div>
            )}
            {galleryImages[galleryIndex] && (
              <div className="gallery-bg-overlay" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(9,9,9,0) 56%, rgba(9,9,9,0.8))', borderRadius: 8 }} />
            )}
            {galleryImages.length > 1 && (
              <>
                <button
                  className="gallery-nav gallery-nav-left"
                  onClick={() => setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  className="gallery-nav gallery-nav-right"
                  onClick={() => setGalleryIndex((i) => (i + 1) % galleryImages.length)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </>
            )}
            <div className="profile-slider">
              {galleryImages.length > 0 ? galleryImages.map((_, i) => (
                <div
                  key={i}
                  className={`slider-bar ${i === galleryIndex ? 'active' : 'inactive'}`}
                  onClick={() => setGalleryIndex(i)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="slider-bar-inner" />
                </div>
              )) : (
                <div className="slider-bar active"><div className="slider-bar-inner" /></div>
              )}
            </div>
          </div>

          {/* Buttons temporarily hidden */}

          {/* Profile Text */}
          <div className="profile-text">
            <div className="profile-name">
              {activeChatData?.character?.name || "Character"}
              {activeCharPersonality["age"] ? `, ${activeCharPersonality["age"]}` : ""}
            </div>
            <div className="profile-bio">
              {(activeCharPersonality["description"] as string) ||
               (activeCharPersonality["bio"] as string) ||
               t("chat.noDescription")}
            </div>
          </div>

          <div className="profile-separator" />

          {/* About Me */}
          <div className="about-me">
            <div className="about-me-title">{t("chat.aboutMe")}</div>
            <div className="info-card">
              <div className="info-card-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="#fff" strokeWidth="1.2"/><path d="M8 5v3l2 1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <div className="info-card-text">
                <div className="info-card-label">{t("chat.age")}</div>
                <div className="info-card-value">
                  {activeCharPersonality["age"] ? t("chat.yearsOld", { age: activeCharPersonality["age"] as string | number }) : "—"}
                </div>
              </div>
            </div>
            {!!(activeCharPersonality["work"] || activeCharPersonality["occupation"]) && (
              <div className="info-card">
                <div className="info-card-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 5h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </div>
                <div className="info-card-text">
                  <div className="info-card-label">{t("chat.occupation")}</div>
                  <div className="info-card-value">
                    {(activeCharPersonality["work"] as string[] | string | undefined)
                      ? Array.isArray(activeCharPersonality["work"])
                        ? (activeCharPersonality["work"] as string[]).join(", ")
                        : String(activeCharPersonality["work"])
                      : String(activeCharPersonality["occupation"] || "—")}
                  </div>
                </div>
              </div>
            )}
            {!!(activeCharPersonality["nationality"] || activeCharPersonality["ethnicity"]) && (
              <div className="info-card">
                <div className="info-card-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14s-5-3.5-5-7a5 5 0 0110 0c0 3.5-5 7-5 7z" stroke="#fff" strokeWidth="1.2"/><circle cx="8" cy="7" r="1.5" stroke="#fff" strokeWidth="1.2"/></svg>
                </div>
                <div className="info-card-text">
                  <div className="info-card-label">{t("chat.nationality")}</div>
                  <div className="info-card-value">
                    {String(activeCharPersonality["nationality"] || activeCharPersonality["ethnicity"] || "—")}
                  </div>
                </div>
              </div>
            )}
            {!!activeCharPersonality["relationshipType"] && (
              <div className="info-card">
                <div className="info-card-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13.5S2 9.5 2 6a3 3 0 015.5-1.7h1A3 3 0 0114 6c0 3.5-6 7.5-6 7.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div className="info-card-text">
                  <div className="info-card-label">{t("chat.relationship")}</div>
                  <div className="info-card-value">
                    {localizeOption(String(activeCharPersonality["relationshipType"]), lang) || "—"}
                  </div>
                </div>
              </div>
            )}
            {!!activeCharPersonality["personality"] && (
              <div className="info-card">
                <div className="info-card-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="#fff" strokeWidth="1.2"/><path d="M6 6s0-2 2-2 2 2 2 2-1 1-2 1-2 1-2 2v1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/><circle cx="8" cy="11" r="0.6" fill="#fff"/></svg>
                </div>
                <div className="info-card-text">
                  <div className="info-card-label">{t("chat.personality")}</div>
                  <div className="info-card-value">
                    {(Array.isArray(activeCharPersonality["personality"])
                      ? (activeCharPersonality["personality"] as string[]).map((x) => localizeOption(String(x), lang)).join(", ")
                      : localizeOption(String(activeCharPersonality["personality"]), lang)) || "—"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {poseOptions && (
        <ChatPoseModal
          open={showPoseSelector}
          onClose={() => setShowPoseSelector(false)}
          onGenerate={handleGenerateImage}
          options={poseOptions}
        />
      )}

      {premiumPopup && (
        <PremiumPopup
          limitType={premiumPopup.limitType}
          limit={premiumPopup.limit}
          used={premiumPopup.used}
          onClose={() => setPremiumPopup(null)}
        />
      )}

      {lightboxUrl && (
        <div className="chat-lightbox" onClick={() => setLightboxUrl(null)}>
          <button className="chat-lightbox-close" onClick={() => setLightboxUrl(null)} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <img className="chat-lightbox-media" src={lightboxUrl} alt="" decoding="async" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

import dynamic from "next/dynamic";

const ChatPageClient = dynamic(() => Promise.resolve(ChatPageInner), {
  ssr: false,
  loading: () => <div style={{ background: "#090909", minHeight: "100vh" }} />,
});

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ background: "#090909", minHeight: "100vh" }} />}>
      <ChatPageClient />
    </Suspense>
  );
}
