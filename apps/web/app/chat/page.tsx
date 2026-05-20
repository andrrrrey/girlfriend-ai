"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/auth";
import {
  chats,
  characters as charactersApi,
  streamMessage,
  streamRegenerate,
  streamVoiceMessage,
  streamEditMessage,
  fetchTTS,
  getPoseOptions,
  createImageJob,
  getJobStatus,
  saveImageMessage,
  type ChatSession,
  type Message,
  type Character,
  type PoseOptionsResponse,
} from "../../lib/api";
import ChatPoseModal from "../components/ChatPoseModal";
import PremiumPopup, { type PremiumLimitType } from "../components/PremiumPopup";

const DEMO_MESSAGE_LIMIT = 20;

function ChatPageInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isDemo = !user || user.subscription === "free";
  const searchParams = useSearchParams();

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
  const [showPoseSelector, setShowPoseSelector] = useState(false);
  const [poseOptions, setPoseOptions] = useState<PoseOptionsResponse | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const imagePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat);
      // Mark chat as read
      const chat = chatList.find((c) => c.id === activeChat);
      if (chat?.lastMessage) {
        localStorage.setItem(`chat-read-${activeChat}`, chat.lastMessage.createdAt);
      }
    }
  }, [activeChat, loadMessages, chatList]);

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

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) return <div className="chat-content"><p style={{ color: "#aaa", padding: 40 }}>Загрузка...</p></div>;
  if (!user) return null;

  const handleDemoError = (err: string, code?: number, body?: any) => {
    if ((code === 429 || code === 403) && body?.error === "FREE_LIMIT_REACHED") {
      setPremiumPopup({
        limitType: body.limitType as PremiumLimitType,
        limit: body.limit,
        used: body.used,
      });
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
      (err, code, body) => {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setStreaming(false);
        setStreamContent("");
        handleDemoError(err, code, body);
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
      if (err?.status === 403 && err?.body?.error === "FREE_LIMIT_REACHED") {
        setPremiumPopup({
          limitType: err.body.limitType as PremiumLimitType,
          limit: err.body.limit,
          used: err.body.used,
        });
      }
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
  const activeChar = charList.find((c) => c.id === activeChatData?.character?.id);
  const activeCharPersonality = (activeChar?.personality as Record<string, unknown> | null) || {};

  const buildChatImagePrompt = (personality: Record<string, unknown>, posePrompt: string): string => {
    const parts: string[] = ["masterpiece", "best quality", "highres", "nsfw", "explicit"];

    const genderMap: Record<string, string> = { Female: "woman", Male: "man", Femboy: "femboy, feminine male", "Non-binary": "androgynous person" };
    const gender = personality.gender as string | undefined;
    if (gender) parts.push(genderMap[gender] || gender.toLowerCase());

    const age = personality.age as string | number | undefined;
    if (age) parts.push(`${age}-year-old`);

    const ethnicity = (personality.ethnicity || personality.nationality) as string | undefined;
    if (ethnicity) parts.push(ethnicity.toLowerCase());

    const eyeColor = personality.eyeColor as string | undefined;
    if (eyeColor) parts.push(`${eyeColor.toLowerCase()} eyes`);

    const hairColor = personality.hairColor as string | undefined;
    if (hairColor) parts.push(`${hairColor.toLowerCase()} hair`);

    const hairStyle = personality.hairStyle as string | undefined;
    if (hairStyle) parts.push(hairStyle.toLowerCase());

    const bodyType = personality.bodyType as string | undefined;
    if (bodyType) parts.push(bodyType.toLowerCase());

    const breastSize = personality.breastSize as string | undefined;
    if (breastSize) parts.push(`${breastSize.toLowerCase()} breasts`);

    const buttSize = personality.buttSize as string | undefined;
    if (buttSize) parts.push(`${buttSize.toLowerCase()} butt`);

    const height = personality.height as string | undefined;
    if (height) parts.push(height.toLowerCase());

    parts.push(posePrompt);

    return parts.filter(Boolean).join(", ");
  };

  const handleOpenPoseSelector = async () => {
    if (!poseOptions) {
      try {
        const opts = await getPoseOptions();
        setPoseOptions(opts);
      } catch { return; }
    }
    setShowPoseSelector(true);
  };

  const handleGenerateImage = async (poseName: string, posePrompt: string) => {
    if (!activeChat || generatingImage) return;
    setShowPoseSelector(false);
    setGeneratingImage(true);

    const prompt = buildChatImagePrompt(activeCharPersonality, posePrompt);
    const tempId = `temp-img-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        role: "assistant",
        content: `Генерация изображения: ${poseName}...`,
        type: "image",
        mediaUrl: null,
        metadata: null,
        createdAt: new Date().toISOString(),
      } as Message,
    ]);

    try {
      const charStyle = activeCharPersonality.generationStyle as string | undefined;
      const useCivitai = !!charStyle;
      const jobPayload: Parameters<typeof createImageJob>[0] = {
        prompt,
        negativePrompt: "bad anatomy, deformed, disfigured, mutation, extra limbs, extra fingers, bad hands, bad face, ugly, low quality, worst quality, blurry, watermark, text, logo",
        ...(useCivitai
          ? { provider: "civitai", generationStyle: charStyle }
          : { model: "alibaba/wan-2.6/text-to-image", provider: "atlascloud" }),
      };
      const { jobId } = await createImageJob(jobPayload);

      const chatIdSnapshot = activeChat;
      let imageSaved = false;
      imagePollingRef.current = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          if (status.status === "completed" && status.output?.url) {
            if (imagePollingRef.current) clearInterval(imagePollingRef.current);
            imagePollingRef.current = null;
            if (!imageSaved) {
              imageSaved = true;
              await saveImageMessage(chatIdSnapshot, status.output.url, poseName);
              const res = await chats.getMessages(chatIdSnapshot);
              setMessages(res.items);
            }
            setGeneratingImage(false);
          } else if (status.status === "failed") {
            if (imagePollingRef.current) clearInterval(imagePollingRef.current);
            imagePollingRef.current = null;
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setGeneratingImage(false);
          }
        } catch {
          if (imagePollingRef.current) clearInterval(imagePollingRef.current);
          imagePollingRef.current = null;
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setGeneratingImage(false);
        }
      }, 3000);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setGeneratingImage(false);
    }
  };

  const handleRegenerateImage = (poseName: string) => {
    if (!poseOptions) {
      getPoseOptions().then((opts) => {
        setPoseOptions(opts);
        const allPoses = opts.POSE.flatMap((c) => c.options);
        const pose = allPoses.find((o) => o.name === poseName);
        if (pose) handleGenerateImage(pose.name, pose.prompt || pose.name);
      }).catch(() => {});
      return;
    }
    const allPoses = poseOptions.POSE.flatMap((c) => c.options);
    const pose = allPoses.find((o) => o.name === poseName);
    if (pose) handleGenerateImage(pose.name, pose.prompt || pose.name);
  };

  // Cleanup polling on unmount or chat switch
  useEffect(() => {
    return () => {
      if (imagePollingRef.current) {
        clearInterval(imagePollingRef.current);
        imagePollingRef.current = null;
      }
    };
  }, [activeChat]);

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
.chat-gen-image { max-width: 300px; width: 100%; border-radius: 8px; cursor: pointer; display: block; }
.generating-indicator { display: flex; align-items: center; gap: 8px; }
.generating-spinner { width: 14px; height: 14px; border: 2px solid #f95bad; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
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
@media (max-width: 1024px) { .right-panel { display: none; } }
@media (max-width: 768px) {
  .chat-content { flex-direction: column; }
  .chats-panel { width: 100%; height: auto; max-height: 220px; flex-shrink: 0; }
  .chat-center { padding: 0 8px; }
  .chat-center-inner { height: calc(100vh - 266px); }
}
      `}</style>

      {/* Chats Panel */}
      <aside className="chats-panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="chats-panel-title">Chats</h2>
        </div>

        <div className="chats-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}><circle cx="7" cy="7" r="4.5" stroke="#848484" strokeWidth="1.2"/><path d="M10.5 10.5L13.5 13.5" stroke="#848484" strokeWidth="1.2" strokeLinecap="round"/></svg>
          <span>Search for a profile</span>
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
                <div className="char-avatar" style={{overflow:'hidden'}}>
                  {c.avatarUrl && <img src={c.avatarUrl} alt={c.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:4}} />}
                </div>
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
              <div className="chat-item-avatar" style={{overflow:'hidden',borderRadius:4}}>
                {c.character?.avatarUrl && (
                  <img src={c.character.avatarUrl} alt={c.character.name} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                )}
              </div>
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
              <div className="chat-header-avatar" style={{overflow:'hidden'}}>
                {activeChatData?.character?.avatarUrl && (
                  <img src={activeChatData.character.avatarUrl} alt={activeChatData.character.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}} />
                )}
              </div>
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
                  ) : msg.type === "image" && msg.mediaUrl ? (
                    <div className="message-bubble image-message">
                      <img
                        src={msg.mediaUrl}
                        alt={msg.content}
                        className="chat-gen-image"
                        onClick={() => window.open(msg.mediaUrl!, "_blank")}
                      />
                    </div>
                  ) : msg.type === "image" && !msg.mediaUrl ? (
                    <div className="message-bubble generating-indicator">
                      <div className="generating-spinner" />
                      <span>{msg.content}</span>
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
                    <div className="msg-actions" style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {msg.role === "assistant" && !msg.id.startsWith("temp-") && msg.type === "image" && (
                        <>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="action-btn"
                            title="Удалить"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => {
                              const poseName = (msg.metadata as Record<string, unknown>)?.poseName as string;
                              if (poseName) handleRegenerateImage(poseName);
                            }}
                            className="action-btn"
                            disabled={streaming || generatingImage}
                            title="Перегенерировать"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 2v3h3M10.5 10V7h-3" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.3 4.5A4 4 0 003 3L1.5 5M2.7 7.5A4 4 0 009 9l1.5-2" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </>
                      )}
                      {msg.role === "assistant" && !msg.id.startsWith("temp-") && msg.type !== "image" && (
                        <>
                          <button
                            onClick={() => handlePlayTTS(msg.id)}
                            className="action-btn"
                            disabled={loadingTTSId === msg.id}
                            title={playingTTSId === msg.id ? "Остановить" : "Озвучить"}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5h1.5L6 2.5v7L3.5 7.5H2a.5.5 0 01-.5-.5V5a.5.5 0 01.5-.5z" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 4a2.5 2.5 0 010 4" stroke="#fff" strokeWidth="0.8" strokeLinecap="round"/><path d="M9.5 2.5a4.5 4.5 0 010 7" stroke="#fff" strokeWidth="0.8" strokeLinecap="round"/></svg>
                          </button>
                          <button className="action-btn" title="Копировать" onClick={() => navigator.clipboard?.writeText(msg.content)}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="#fff" strokeWidth="0.8"/><path d="M8 4V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V7a1 1 0 001 1H4" stroke="#fff" strokeWidth="0.8"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="action-btn"
                            title="Удалить"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => handleRegenerate(msg.id)}
                            className="action-btn"
                            disabled={streaming}
                            title="Перегенерировать"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 2v3h3M10.5 10V7h-3" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.3 4.5A4 4 0 003 3L1.5 5M2.7 7.5A4 4 0 009 9l1.5-2" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </>
                      )}
                      {msg.role === "user" && !msg.id.startsWith("temp-") && (
                        <>
                          <button className="action-btn" title="Копировать" onClick={() => navigator.clipboard?.writeText(msg.content)}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="6.5" height="6.5" rx="1" stroke="#fff" strokeWidth="0.8"/><path d="M8 4V2.5a1 1 0 00-1-1H2.5a1 1 0 00-1 1V7a1 1 0 001 1H4" stroke="#fff" strokeWidth="0.8"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="action-btn"
                            title="Удалить"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3.5h8M4.5 3.5V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M9 3.5l-.5 6.5a1 1 0 01-1 .9H4.5a1 1 0 01-1-.9L3 3.5" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => handleStartEdit(msg)}
                            className="action-btn"
                            disabled={streaming}
                            title="Редактировать"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-7 7H1.5V8.5l7-7z" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </>
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
                  <div className="input-mode-dropdown-wrap">
                    <button
                      className="input-mode-btn"
                      onClick={() => setShowInputModeDropdown(!showInputModeDropdown)}
                    >
                      {inputMode === "ask" ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12M2 6.5h12M2 10h8M2 13.5h6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" fill="#fff"/><path d="M1.5 11l3.5-3.5 2.5 2.5 2-2L14.5 13" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                      {inputMode === "ask" ? "Ask" : "Image"}
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
                          Ask
                        </button>
                        <button
                          className={`input-mode-option ${inputMode === "image" ? "active" : ""}`}
                          onClick={() => { setInputMode("image"); setShowInputModeDropdown(false); }}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="#fff" strokeWidth="1.2"/><circle cx="5.5" cy="5.5" r="1.5" fill="#fff"/><path d="M1.5 11l3.5-3.5 2.5 2.5 2-2L14.5 13" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Image
                        </button>
                      </div>
                    )}
                  </div>

                  {inputMode === "ask" ? (
                    <>
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="chat-text-input"
                        placeholder="Leave a message..."
                        disabled={streaming}
                      />
                      <button
                        onClick={startRecording}
                        disabled={streaming}
                        className="input-icon-btn"
                        title="Голосовое сообщение"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 0.5C6.17 0.5 5.5 1.17 5.5 2v5c0 0.83 0.67 1.5 1.5 1.5s1.5-0.67 1.5-1.5V2c0-0.83-0.67-1.5-1.5-1.5z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 6v1a4 4 0 008 0V6" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 11.5V13.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={streaming || !input.trim()}
                        className="input-icon-btn send"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleOpenPoseSelector}
                      disabled={generatingImage || streaming}
                      className="choose-pose-btn"
                    >
                      {generatingImage ? "Генерация..." : "Выбрать позу"}
                    </button>
                  )}
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

      {/* Right Info Panel */}
      {activeChat && (
        <aside className="right-panel">
          {/* Profile Gallery */}
          <div className="profile-gallery" style={activeChatData?.character?.avatarUrl ? {backgroundImage:`url(${activeChatData.character.avatarUrl})`,backgroundSize:'cover',backgroundPosition:'center'} : {}}>
            <div className="gallery-bg" style={activeChatData?.character?.avatarUrl ? {display:'none'} : {}}>
              <div className="gallery-bg-overlay" />
            </div>
            {activeChatData?.character?.avatarUrl && <div className="gallery-bg-overlay" style={{position:'absolute',inset:0,background:'linear-gradient(to bottom, rgba(9,9,9,0) 56%, rgba(9,9,9,0.8))',borderRadius:8}} />}
            {/* small-avatar temporarily hidden */}
            <div className="profile-slider">
              <div className="slider-bar active"><div className="slider-bar-inner" /></div>
              <div className="slider-bar inactive"><div className="slider-bar-inner" /></div>
              <div className="slider-bar inactive"><div className="slider-bar-inner" /></div>
              <div className="slider-bar inactive"><div className="slider-bar-inner" /></div>
              <div className="slider-bar inactive"><div className="slider-bar-inner" /></div>
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
               "No description available."}
            </div>
          </div>

          <div className="profile-separator" />

          {/* About Me */}
          <div className="about-me">
            <div className="about-me-title">About me:</div>
            <div className="info-card">
              <div className="info-card-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="#fff" strokeWidth="1.2"/><path d="M8 5v3l2 1" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <div className="info-card-text">
                <div className="info-card-label">AGE</div>
                <div className="info-card-value">
                  {activeCharPersonality["age"] ? `${activeCharPersonality["age"]} years old` : "—"}
                </div>
              </div>
            </div>
            {!!(activeCharPersonality["work"] || activeCharPersonality["occupation"]) && (
              <div className="info-card">
                <div className="info-card-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 5h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                </div>
                <div className="info-card-text">
                  <div className="info-card-label">OCCUPATION</div>
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
                  <div className="info-card-label">NATIONALITY</div>
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
                  <div className="info-card-label">RELATIONSHIP</div>
                  <div className="info-card-value">
                    {String(activeCharPersonality["relationshipType"] || "—")}
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
                  <div className="info-card-label">PERSONALITY</div>
                  <div className="info-card-value">
                    {String(activeCharPersonality["personality"] || "—")}
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
