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

interface ActiveJob {
  jobId: string;
  type: "image" | "video";
  prompt: string;
  model: string;
  startedAt: string;
}

interface GenerationNotification {
  id: string;
  jobId: string;
  type: "image" | "video";
  status: "started" | "completed" | "failed";
  output?: { url?: string } | null;
  error?: string | null;
  timestamp: number;
}

const MAX_CONCURRENT_GENERATIONS = 2;

interface GenerationContextValue {
  activeJobs: ActiveJob[];
  notifications: GenerationNotification[];
  completedCount: number;
  canGenerate: boolean;
  startGeneration: (jobId: string, type: "image" | "video", prompt: string, model: string) => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [notifications, setNotifications] = useState<GenerationNotification[]>([]);
  const pollErrorsRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const completedCount = notifications.filter((n) => n.status === "completed").length;
  const canGenerate = activeJobs.length < MAX_CONCURRENT_GENERATIONS;

  const addNotification = useCallback((n: Omit<GenerationNotification, "id" | "timestamp">) => {
    const notif: GenerationNotification = {
      ...n,
      id: `${n.jobId}-${n.status}`,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [...prev, notif]);
  }, []);

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

  const startGeneration = useCallback((jobId: string, type: "image" | "video", prompt: string, model: string) => {
    setActiveJobs((prev) => [
      ...prev,
      { jobId, type, prompt, model, startedAt: new Date().toISOString() },
    ]);
    addNotification({ jobId, type, status: "started" });
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

  // Polling for active jobs
  useEffect(() => {
    if (activeJobs.length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const jobsCopy = [...activeJobs];
      for (const job of jobsCopy) {
        try {
          const status = await getJobStatus(job.jobId);
          pollErrorsRef.current.set(job.jobId, 0);

          if (status.status === "completed") {
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "completed",
              output: status.output,
            });
          } else if (status.status === "failed") {
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "failed",
              error: status.error,
            });
          }
        } catch {
          const errs = (pollErrorsRef.current.get(job.jobId) ?? 0) + 1;
          pollErrorsRef.current.set(job.jobId, errs);
          if (errs >= 3) {
            setActiveJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
            pollErrorsRef.current.delete(job.jobId);
            addNotification({
              jobId: job.jobId,
              type: job.type,
              status: "failed",
              error: "Failed to check job status",
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
      value={{ activeJobs, notifications, completedCount, canGenerate, startGeneration, dismissNotification, dismissAllNotifications }}
    >
      {children}
      {notifications.length > 0 && (
        <div className="gen-toast-container">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`gen-toast ${n.status}${n.status === "completed" ? " clickable" : ""}`}
              onClick={n.status === "completed" ? () => { dismissNotification(n.id); window.location.href = "/gallery"; } : undefined}
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
                  {n.status === "started" && `${n.type === "video" ? "Video" : "Image"} generation started`}
                  {n.status === "completed" && `${n.type === "video" ? "Video" : "Image"} generation completed!`}
                  {n.status === "failed" && `${n.type === "video" ? "Video" : "Image"} generation failed`}
                </div>
                {n.status === "completed" && <div className="gen-toast-subtitle">Click to view in gallery</div>}
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
