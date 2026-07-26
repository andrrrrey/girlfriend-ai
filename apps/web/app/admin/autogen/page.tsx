"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type AutogenTask, type AutogenStatus } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const STATUS_LABELS: Record<AutogenStatus, string> = {
  running: "Выполняется",
  paused: "На паузе",
  completed: "Завершено",
  cancelled: "Отменено",
  stopped_no_balance: "Остановлено: нет баланса",
  failed: "Ошибка",
};

const STATUS_COLORS: Record<AutogenStatus, string> = {
  running: "#4caf7d",
  paused: "#e2b53a",
  completed: "#7d9cff",
  cancelled: "#888",
  stopped_no_balance: "#e36466",
  failed: "#e36466",
};

const s: Record<string, React.CSSProperties> = {
  formBox: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    display: "flex",
    alignItems: "flex-end",
    gap: 14,
    flexWrap: "wrap",
  },
  taskCard: {
    background: "#121212",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: 20,
    marginBottom: 14,
  },
  taskHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  barTrack: {
    height: 8,
    borderRadius: 999,
    background: "#1e1e1e",
    overflow: "hidden",
    margin: "10px 0",
  },
  counts: { display: "flex", gap: 18, color: "#969696", fontSize: 12, marginBottom: 8 },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    fontSize: 11,
    color: "#cfcfcf",
    background: "#1a1a1a",
    border: "1px solid #313131",
    borderRadius: 6,
    padding: "3px 8px",
    textDecoration: "none",
  },
};

const badge = (color: string): React.CSSProperties => ({
  fontSize: 11,
  padding: "2px 10px",
  borderRadius: 999,
  border: `1px solid ${color}`,
  color,
  whiteSpace: "nowrap",
});

/** Активный статус — задачу можно ставить на паузу/возобновлять/отменять. */
function isLive(status: AutogenStatus): boolean {
  return status === "running" || status === "paused" || status === "stopped_no_balance";
}

export default function AdminAutogenPage() {
  const { user, loading } = useAuth();
  const [tasks, setTasks] = useState<AutogenTask[]>([]);
  const [count, setCount] = useState("10");
  const [genMode, setGenMode] = useState<"nsfw" | "sfw">("nsfw");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    admin.getAutogenTasks().then(setTasks).catch(() => {});
  }, []);

  useEffect(() => {
    if (loading || user?.role !== "admin") return;
    load();
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

  const start = async () => {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      setError("Укажите количество от 1 до 200");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await admin.startAutogen(n, genMode);
      load();
    } catch (err: any) {
      setError(err.message || "Не удалось запустить");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<AutogenTask>) => {
    try {
      await fn();
      load();
    } catch (err: any) {
      setError(err.message || "Ошибка");
    }
  };

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="autogen" />

      <h1 style={adminStyles.title}>Автогенерация персонажей</h1>
      <p style={adminStyles.subtitle}>
        Фоновое создание персонажей со случайными атрибутами и AI-заполнением бэкстори.
        Готовые персонажи сразу появляются в каталоге. При нехватке баланса генерация
        останавливается автоматически.
      </p>

      {error && <div style={adminStyles.error}>{error}</div>}

      <div style={s.formBox}>
        <div>
          <label style={adminStyles.label}>Количество персонажей</label>
          <input
            style={{ ...adminStyles.input, width: 140 }}
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </div>
        <div>
          <label style={adminStyles.label}>Режим контента</label>
          <select
            style={{ ...adminStyles.input, width: 160 }}
            value={genMode}
            onChange={(e) => setGenMode(e.target.value as "nsfw" | "sfw")}
          >
            <option value="nsfw">NSFW</option>
            <option value="sfw">SFW</option>
          </select>
        </div>
        <button style={adminStyles.button} onClick={start} disabled={busy}>
          {busy ? "Запуск..." : "Запустить"}
        </button>
      </div>

      {tasks.length === 0 && (
        <p style={{ color: "#848484", fontSize: 12 }}>Задач ещё нет.</p>
      )}

      {tasks.map((t) => {
        const done = t.succeeded + t.failed;
        const pct = t.total > 0 ? Math.round((done / t.total) * 100) : 0;
        const color = STATUS_COLORS[t.status];
        return (
          <div key={t.id} style={s.taskCard}>
            <div style={s.taskHead}>
              <span style={badge(color)}>{STATUS_LABELS[t.status]}</span>
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                {done} / {t.total}
              </span>
              <span style={{ color: "#848484", fontSize: 11 }}>
                {new Date(t.createdAt).toLocaleString("ru-RU")}
              </span>
            </div>

            <div style={s.barTrack}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width .4s" }} />
            </div>

            <div style={s.counts}>
              <span>✅ Создано: {t.succeeded}</span>
              <span>⚠️ Пропущено: {t.failed}</span>
            </div>

            {t.lastError && (
              <div style={{ color: "#e36466", fontSize: 11, marginBottom: 8 }}>
                Последняя ошибка: {t.lastError}
              </div>
            )}

            {isLive(t.status) && (
              <div style={adminStyles.btnRow}>
                {t.status === "running" && (
                  <button style={adminStyles.btnSecondary} onClick={() => act(() => admin.pauseAutogen(t.id))}>
                    Пауза
                  </button>
                )}
                {(t.status === "paused" || t.status === "stopped_no_balance") && (
                  <button style={adminStyles.btnSecondary} onClick={() => act(() => admin.resumeAutogen(t.id))}>
                    Возобновить
                  </button>
                )}
                <button
                  style={{ ...adminStyles.btnSecondary, borderColor: "#e36466", color: "#e36466" }}
                  onClick={() => act(() => admin.cancelAutogen(t.id))}
                >
                  Отменить
                </button>
              </div>
            )}

            {t.characterIds.length > 0 && (
              <div style={s.chips}>
                {t.characterIds.map((id, i) => (
                  <Link key={id} href={`/characters/${id}`} target="_blank" style={s.chip}>
                    Персонаж #{i + 1}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
