"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { getJobStatus } from "../lib/api";
import { useT } from "./language";
import { showBrowserNotification } from "../lib/browserNotify";

interface ActiveJob {
  jobId: string;
  type: "image" | "video";
  prompt: string;
  model: string;
  startedAt: string;
  source?: string; // "character-creation" | "generation" | "chat" etc.
  metadata?: Record<string, unknown>;
}

interface GenerationNotification {
  id: string;
  jobId: string;
  type: "image" | "video";
  status: "started" | "completed" | "failed";
  output?: { url?: string } | null;
  error?: string | null;
  timestamp: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

const MAX_CONCURRENT = 2;
const LS_KEY = "gen_active_jobs";
const HISTORY_LS_KEY = "gen_notification_history";

function loadJobs(): ActiveJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs: ActiveJob[]) {
  try {
    if (jobs.length === 0) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(jobs));
  } catch {}
}

function loadHistory(): GenerationNotification[] {
  try {
    const raw = localStorage.getItem(HISTORY_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: GenerationNotification[]) {
  try {
    if (history.length === 0) localStorage.removeItem(HISTORY_LS_KEY);
    else localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(history));
  } catch {}
}

interface GenerationContextValue {
  activeJobs: ActiveJob[];
  notifications: GenerationNotification[];
  notificationHistory: GenerationNotification[];
  completedCount: number;
  canGenerate: boolean;
  startGeneration: (jobId: string, type: "image" | "video", prompt: string, model: string, source?: string, metadata?: Record<string, unknown>) => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
  dismissHistoryItem: (id: string) => void;
  clearNotificationHistory: () => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  // Human label for a notification based on its source/type.
  const sourceLabel = (source?: string, type?: string) =>
    type === "video" ? t("notif.video")
    : source === "character-creation" ? t("notif.character")
    : source === "chat" ? t("notif.chatImage") : t("notif.image");
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>(() => loadJobs());
  const [notifications, setNotifications] = useState<GenerationNotification[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<GenerationNotification[]>(() => loadHistory());
  const pollErrorsRef = useRef<Map<string, number>>(new Map());
  // Задачи, по которым уже выпущено финальное уведомление (completed/failed).
  // Защищает от дублей: при долгой генерации поллинг (каждые 3с) может
  // наложиться сам на себя и увидеть одну и ту же завершённую задачу несколько
  // раз, пока setActiveJobs ещё не убрал её из activeJobsRef.
  const finalizedJobsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const activeJobsRef = useRef<ActiveJob[]>(activeJobs);

  // Keep ref in sync + persist to localStorage
  useEffect(() => {
    activeJobsRef.current = activeJobs;
    saveJobs(activeJobs);
  }, [activeJobs]);

  // Persist notification history
  useEffect(() => {
    saveHistory(notificationHistory);
  }, [notificationHistory]);

  const completedCount = notifications.filter((n) => n.status === "completed").length;
  const canGenerate = activeJobs.length < MAX_CONCURRENT;

  const addNotification = useCallback((n: Omit<GenerationNotification, "id" | "timestamp">) => {
    const notif: GenerationNotification = {
      ...n,
      id: `${n.jobId}-${n.status}`,
      timestamp: Date.now(),
    };
    // Дедуп по id (id = `${jobId}-${status}`, детерминирован): не плодим
    // одинаковые уведомления, если по какой-то причине пришло повторно.
    setNotifications((prev) => (prev.some((x) => x.id === notif.id) ? prev : [...prev, notif]));
    // Also add to persistent history (only completed and failed)
    if (n.status === "completed" || n.status === "failed") {
      setNotificationHistory((prev) => (prev.some((x) => x.id === notif.id) ? prev : [...prev, notif]));
      // Браузерное уведомление о завершении генерации (если выдано разрешение).
      const label = n.source === "character-creation" ? t("notif.character")
        : n.source === "chat" ? t("notif.chatImage")
        : n.type === "video" ? t("notif.video") : t("notif.image");
      const url = n.source === "character-creation" ? "/create"
        : n.source === "chat" && n.metadata?.chatId ? `/chat?sessionId=${n.metadata.chatId}`
        : "/gallery";
      showBrowserNotification(
        n.status === "completed" ? t("notif.ready", { label }) : t("notif.failed", { label }),
        { tag: `gen-${notif.jobId}`, url },
      );
    }
  }, [t]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = dismissTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, []);

  const dismissAllNotifications = useCallback(() => {
    setNotifications([]);
    dismissTimersRef.current.forEach((t) => clearTimeout(t));
    dismissTimersRef.current.clear();
  }, []);

  const dismissHistoryItem = useCallback((id: string) => {
    setNotificationHistory((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotificationHistory = useCallback(() => {
    setNotificationHistory([]);
  }, []);

  const startGeneration = useCallback((jobId: string, type: "image" | "video", prompt: string, model: string, source?: string, metadata?: Record<string, unknown>) => {
    setActiveJobs((prev) => {
      const next = [...prev, { jobId, type, prompt, model, startedAt: new Date().toISOString(), source, metadata }];
      return next;
    });
    addNotification({ jobId, type, status: "started", source, metadata });
  }, [addNotification]);

  // Auto-dismiss notifications after 5 seconds
  useEffect(() => {
    for (const n of notifications) {
      if (dismissTimersRef.current.has(n.id)) continue;
      const timer = setTimeout(() => {
        dismissNotification(n.id);
      }, 5000);
      dismissTimersRef.current.set(n.id, timer);
    }
  }, [notifications, dismissNotification]);

  // Polling — uses ref to always read fresh activeJobs
  useEffect(() => {
    const jobs = activeJobsRef.current;
    if (jobs.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const currentJobs = [...activeJobsRef.current];
      if (currentJobs.length === 0) return;

      for (const job of currentJobs) {
        // Уже финализирована (наложившимся циклом поллинга) — пропускаем,
        // чтобы не выпустить второе уведомление по той же задаче.
        if (finalizedJobsRef.current.has(job.jobId)) continue;
        try {
          const status = await getJobStatus(job.jobId);
          pollErrorsRef.current.set(job.jobId, 0);

          if (status.status === "completed") {
            if (finalizedJobsRef.current.has(job.jobId)) continue;
            finalizedJobsRef.current.add(job.jobId);
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "completed",
              output: status.output,
              source: job.source,
              metadata: job.metadata,
            });
          } else if (status.status === "failed") {
            if (finalizedJobsRef.current.has(job.jobId)) continue;
            finalizedJobsRef.current.add(job.jobId);
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "failed",
              error: status.error,
              source: job.source,
              metadata: job.metadata,
            });
          }
        } catch {
          const errs = (pollErrorsRef.current.get(job.jobId) ?? 0) + 1;
          pollErrorsRef.current.set(job.jobId, errs);
          if (errs >= 3) {
            if (finalizedJobsRef.current.has(job.jobId)) continue;
            finalizedJobsRef.current.add(job.jobId);
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "failed",
              error: "Failed to check job status",
              source: job.source,
              metadata: job.metadata,
            });
          }
        }
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeJobs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GenerationContext.Provider
      value={{
        activeJobs, notifications, notificationHistory, completedCount, canGenerate,
        startGeneration, dismissNotification, dismissAllNotifications,
        dismissHistoryItem, clearNotificationHistory,
      }}
    >
      {children}
      {notifications.length > 0 && (
        <div className="gen-toast-container">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`gen-toast ${n.status}${n.status === "completed" ? " clickable" : ""}`}
              onClick={n.status === "completed" ? () => {
                dismissNotification(n.id);
                if (n.source === "character-creation") window.location.href = "/create";
                else if (n.source === "chat" && n.metadata?.chatId) window.location.href = `/chat?sessionId=${n.metadata.chatId}`;
                else window.location.href = "/gallery";
              } : undefined}
            >
              <div className="gen-toast-icon">
                {n.status === "started" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                )}
                {n.status === "completed" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
                {n.status === "failed" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                )}
              </div>
              <div className="gen-toast-body">
                <div className="gen-toast-title">
                  {n.status === "started" && t("notif.startedTitle", { label: sourceLabel(n.source, n.type) })}
                  {n.status === "completed" && t("notif.completedTitle", { label: sourceLabel(n.source, n.type) })}
                  {n.status === "failed" && t("notif.failedTitle", { label: sourceLabel(n.source, n.type) })}
                </div>
                {n.status === "completed" && (
                  <div className="gen-toast-subtitle">
                    {n.source === "character-creation" ? t("notif.clickContinue") : n.source === "chat" ? t("notif.clickViewChat") : t("notif.clickViewGallery")}
                  </div>
                )}
                {n.status === "failed" && n.error && <div className="gen-toast-subtitle">{n.error}</div>}
              </div>
              <button className="gen-toast-close" onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error("useGeneration must be used within a GenerationProvider");
  }
  return context;
}
