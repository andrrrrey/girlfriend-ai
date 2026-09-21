"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import {
  admin,
  type AutoChatTask,
  type AutoChatStatus,
  type AutoChatFinding,
  type Character,
} from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const STATUS_LABELS: Record<AutoChatStatus, string> = {
  running: "Идёт переписка",
  paused: "На паузе",
  completed: "Завершено",
  cancelled: "Отменено",
  stopped_no_balance: "Остановлено: нет баланса",
  failed: "Ошибка",
};

const STATUS_COLORS: Record<AutoChatStatus, string> = {
  running: "#4caf7d",
  paused: "#e2b53a",
  completed: "#7d9cff",
  cancelled: "#888",
  stopped_no_balance: "#e36466",
  failed: "#e36466",
};

const SEVERITY_COLORS: Record<AutoChatFinding["severity"], string> = {
  high: "#e36466",
  medium: "#e2b53a",
  low: "#7d9cff",
};

const s: Record<string, React.CSSProperties> = {
  formBox: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  charList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 8,
    maxHeight: 260,
    overflowY: "auto",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  charRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    color: "#e5e5e5",
  },
  charRowOn: { background: "#1e2a22", border: "1px solid #2f5b41" },
  charRowOff: { background: "#1a1a1a", border: "1px solid transparent" },
  avatar: { width: 28, height: 28, borderRadius: 6, objectFit: "cover", flexShrink: 0, background: "#222" },
  avatarPh: {
    width: 28,
    height: 28,
    borderRadius: 6,
    flexShrink: 0,
    background: "#222",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
  },
  controls: { display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" },
  taskCard: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: 20,
    marginBottom: 14,
  },
  taskHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  barTrack: { height: 8, borderRadius: 999, background: "#1e1e1e", overflow: "hidden", margin: "10px 0" },
  counts: { display: "flex", gap: 18, color: "#969696", fontSize: 12, marginBottom: 8 },
  charBlock: {
    borderTop: "1px solid #232323",
    padding: "12px 0 4px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  charBlockHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  analysisBox: {
    background: "#171717",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: 12,
    fontSize: 12.5,
    color: "#cfcfcf",
    lineHeight: 1.5,
  },
  finding: { borderLeft: "3px solid #444", padding: "4px 0 4px 10px", margin: "8px 0" },
};

const severityTag = (c: string): React.CSSProperties => ({
  fontSize: 10,
  padding: "1px 7px",
  borderRadius: 999,
  border: `1px solid ${c}`,
  color: c,
  marginRight: 6,
  textTransform: "uppercase",
});

const badge = (color: string): React.CSSProperties => ({
  fontSize: 11,
  padding: "2px 10px",
  borderRadius: 999,
  border: `1px solid ${color}`,
  color,
  whiteSpace: "nowrap",
});

function isLive(status: AutoChatStatus): boolean {
  return status === "running" || status === "paused" || status === "stopped_no_balance";
}

/** Одна карточка результата анализа (per-character или сводного). */
function AnalysisView({ summary, findings }: { summary: string; findings: AutoChatFinding[] }) {
  return (
    <div style={s.analysisBox}>
      <div style={{ color: "#e5e5e5", marginBottom: findings.length ? 8 : 0 }}>{summary}</div>
      {findings.map((f, i) => {
        const c = SEVERITY_COLORS[f.severity] || "#888";
        return (
          <div key={i} style={{ ...s.finding, borderLeftColor: c }}>
            <div style={{ marginBottom: 3 }}>
              <span style={severityTag(c)}>{f.severity}</span>
              <span style={{ color: "#fff", fontWeight: 600 }}>{f.category}</span>
            </div>
            {f.quote && <div style={{ color: "#8f8f8f", fontStyle: "italic" }}>«{f.quote}»</div>}
            {f.explanation && <div style={{ marginTop: 3 }}>{f.explanation}</div>}
            {f.suggestion && (
              <div style={{ marginTop: 3, color: "#79c99a" }}>→ {f.suggestion}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAutochatPage() {
  const { user, loading } = useAuth();
  const [tasks, setTasks] = useState<AutoChatTask[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [turns, setTurns] = useState("10");
  const [mode, setMode] = useState<"nsfw" | "sfw">("nsfw");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Результаты анализа в памяти: taskId → { charId|summary → {summary,findings}, busy }
  const [analyses, setAnalyses] = useState<
    Record<string, { summary: string; findings: AutoChatFinding[] }>
  >({});
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    admin.getAutochatTasks().then(setTasks).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || user?.role !== "admin") return;
    load();
    admin.getCharacters().then(setCharacters).catch(() => {});
    pollRef.current = setInterval(load, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, user, load]);

  if (loading) {
    return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  }
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <Link href="/" style={adminStyles.link}>На главную</Link>
        </div>
      </div>
    );
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = async () => {
    const n = Number(turns);
    if (selected.size === 0) {
      setError("Выберите хотя бы одного персонажа");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      setError("Число реплик на персонажа — от 1 до 500");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await admin.startAutochat(Array.from(selected), n, mode);
      setSelected(new Set());
      load();
    } catch (err: any) {
      setError(err.message || "Не удалось запустить");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<AutoChatTask>) => {
    try {
      await fn();
      load();
    } catch (err: any) {
      setError(err.message || "Ошибка");
    }
  };

  const key = (taskId: string, cid: string) => `${taskId}:${cid}`;

  const runAnalysis = async (taskId: string, characterId: string) => {
    const k = key(taskId, characterId);
    setAnalyzing((prev) => new Set(prev).add(k));
    setError("");
    try {
      const res = await admin.analyzeAutochatCharacter(taskId, characterId);
      setAnalyses((prev) => ({ ...prev, [k]: { summary: res.summary, findings: res.findings } }));
    } catch (err: any) {
      setError(err.message || "Ошибка анализа");
    } finally {
      setAnalyzing((prev) => {
        const n = new Set(prev);
        n.delete(k);
        return n;
      });
    }
  };

  const runSummary = async (taskId: string) => {
    const k = key(taskId, "summary");
    setAnalyzing((prev) => new Set(prev).add(k));
    setError("");
    try {
      const res = await admin.analyzeAutochatSummary(taskId);
      setAnalyses((prev) => ({ ...prev, [k]: { summary: res.summary, findings: res.findings } }));
    } catch (err: any) {
      setError(err.message || "Ошибка сводного анализа");
    } finally {
      setAnalyzing((prev) => {
        const n = new Set(prev);
        n.delete(k);
        return n;
      });
    }
  };

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="autochat" />

      <h1 style={adminStyles.title}>Автопереписка с персонажами</h1>
      <p style={adminStyles.subtitle}>
        Робот (ИИ в роли живого пользователя) ведёт диалоги с выбранными персонажами на разные темы
        (в т.ч. 18+) прямо в вашем аккаунте — переписку видно в списке чатов. Сообщения робота
        не тарифицируются (симуляция человека), ответы персонажей учитываются как обычный чат.
        Цель — выявить баги промптов персонажей; после прогона нажмите «Анализ» по персонажу
        и «Сводный вывод».
      </p>

      {error && <div style={adminStyles.error}>{error}</div>}

      <div style={s.formBox}>
        <label style={adminStyles.label}>
          Персонажи ({selected.size} выбрано)
        </label>
        <div style={s.charList}>
          {characters.length === 0 && <span style={{ color: "#848484", fontSize: 12 }}>Нет персонажей.</span>}
          {characters.map((c) => {
            const on = selected.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => toggle(c.id)}
                style={{ ...s.charRow, ...(on ? s.charRowOn : s.charRowOff) }}
              >
                <input type="checkbox" checked={on} readOnly />
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt={c.name} style={s.avatar} loading="lazy" decoding="async" />
                ) : (
                  <div style={s.avatarPh}>👤</div>
                )}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
              </div>
            );
          })}
        </div>

        <div style={s.controls}>
          <div>
            <label style={adminStyles.label}>Реплик на персонажа</label>
            <input
              style={{ ...adminStyles.input, width: 140 }}
              type="number"
              min={1}
              max={500}
              value={turns}
              onChange={(e) => setTurns(e.target.value)}
            />
          </div>
          <div>
            <label style={adminStyles.label}>Режим контента</label>
            <select
              style={{ ...adminStyles.input, width: 160 }}
              value={mode}
              onChange={(e) => setMode(e.target.value as "nsfw" | "sfw")}
            >
              <option value="nsfw">NSFW</option>
              <option value="sfw">SFW</option>
            </select>
          </div>
          <button style={adminStyles.button} onClick={start} disabled={busy}>
            {busy ? "Запуск..." : "Запустить автопереписку"}
          </button>
        </div>
      </div>

      {tasks.length === 0 && <p style={{ color: "#848484", fontSize: 12 }}>Задач ещё нет.</p>}

      {tasks.map((t) => {
        const done = t.succeeded + t.failed;
        const pct = t.total > 0 ? Math.round((done / t.total) * 100) : 0;
        const color = STATUS_COLORS[t.status];
        const summaryKey = key(t.id, "summary");
        return (
          <div key={t.id} style={s.taskCard}>
            <div style={s.taskHead}>
              <span style={badge(color)}>{STATUS_LABELS[t.status]}</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                {done} / {t.total} реплик
              </span>
              <span style={{ color: "#848484", fontSize: 11 }}>
                {t.turnsPerChar} на персонажа · {new Date(t.createdAt).toLocaleString("ru-RU")}
              </span>
            </div>

            <div style={s.barTrack}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width .4s" }} />
            </div>

            <div style={s.counts}>
              <span>✅ Реплик: {t.succeeded}</span>
              <span>⚠️ Ошибок: {t.failed}</span>
            </div>

            {t.lastError && (
              <div style={{ color: "#e36466", fontSize: 11, marginBottom: 8 }}>
                Последняя ошибка: {t.lastError}
              </div>
            )}

            {isLive(t.status) && (
              <div style={adminStyles.btnRow}>
                {t.status === "running" && (
                  <button style={adminStyles.btnSecondary} onClick={() => act(() => admin.pauseAutochat(t.id))}>
                    Пауза
                  </button>
                )}
                {(t.status === "paused" || t.status === "stopped_no_balance") && (
                  <button style={adminStyles.btnSecondary} onClick={() => act(() => admin.resumeAutochat(t.id))}>
                    Возобновить
                  </button>
                )}
                <button
                  style={{ ...adminStyles.btnSecondary, borderColor: "#e36466", color: "#e36466" }}
                  onClick={() => act(() => admin.cancelAutochat(t.id))}
                >
                  Отменить
                </button>
              </div>
            )}

            {/* Персонажи задачи: ссылка на чат + кнопка анализа + результат */}
            {(t.characters ?? []).map((c) => {
              const k = key(t.id, c.id);
              const a = analyses[k];
              const isAnalyzing = analyzing.has(k);
              return (
                <div key={c.id} style={s.charBlock}>
                  <div style={s.charBlockHead}>
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.avatarUrl} alt={c.name} style={s.avatar} loading="lazy" decoding="async" />
                    ) : (
                      <div style={s.avatarPh}>👤</div>
                    )}
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                    {c.sessionId && (
                      <Link
                        href={`/chat/${c.sessionId}`}
                        target="_blank"
                        style={{ ...adminStyles.link, fontSize: 12 }}
                      >
                        Открыть чат ↗
                      </Link>
                    )}
                    <button
                      style={{ ...adminStyles.btnSecondary, marginLeft: "auto" }}
                      onClick={() => runAnalysis(t.id, c.id)}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? "Анализ..." : a ? "Повторить анализ" : "Анализ"}
                    </button>
                  </div>
                  {a && <AnalysisView summary={a.summary} findings={a.findings} />}
                </div>
              );
            })}

            {/* Сводный вывод по задаче */}
            <div style={{ ...s.charBlock, borderTop: "1px solid #2a2a2a" }}>
              <div style={s.charBlockHead}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Сводный вывод</span>
                <button
                  style={{ ...adminStyles.btnSecondary, marginLeft: "auto" }}
                  onClick={() => runSummary(t.id)}
                  disabled={analyzing.has(summaryKey)}
                >
                  {analyzing.has(summaryKey) ? "Анализ..." : "Сводный вывод"}
                </button>
              </div>
              {analyses[summaryKey] && (
                <AnalysisView
                  summary={analyses[summaryKey].summary}
                  findings={analyses[summaryKey].findings}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
