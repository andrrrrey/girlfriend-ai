"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../context/auth";
import {
  admin,
  getAppearanceOptions,
  getPoseOptions,
  getSceneOptions,
  getCameraOptions,
  type Character,
  type GenTestItem,
  type GenTestTask,
} from "../../../lib/api";
import { localizeOption } from "../../../lib/optionLabel";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

/** Оси перебора (подгруппы) — порядок совпадает с бэкендом. */
const AXES = [
  { key: "OUTFITS", label: "Одежда" },
  { key: "OUTFIT_DETAILS", label: "Детали одежды" },
  { key: "FACIAL_EXPRESSION", label: "Выражение лица" },
  { key: "POSE", label: "Поза" },
  { key: "LOCATION", label: "Сцена" },
  { key: "FRAMING", label: "Кадрирование" },
  { key: "CAMERA_ANGLE", label: "Ракурс" },
] as const;
type AxisKey = (typeof AXES)[number]["key"];

/** Опция оси → функция сохранения промпта (правка глобальная, в реальную опцию). */
const AXIS_UPDATE: Record<AxisKey, (id: string, data: { prompt?: string }) => Promise<unknown>> = {
  OUTFITS: admin.updateAppearanceOption,
  OUTFIT_DETAILS: admin.updateAppearanceOption,
  FACIAL_EXPRESSION: admin.updatePoseOption,
  POSE: admin.updatePoseOption,
  LOCATION: admin.updateSceneOption,
  FRAMING: admin.updateCameraOption,
  CAMERA_ANGLE: admin.updateCameraOption,
};

interface Opt { id: string; name: string; thumb: string | null; prompt: string }

/** Локализует составную подпись "name · name · …" пофрагментно. */
function localizeLabel(label: string): string {
  return label.split(" · ").map((p) => localizeOption(p, "ru")).join(" · ");
}

const st: Record<string, React.CSSProperties> = {
  h2: { color: "#fff", fontSize: 16, fontWeight: 700, margin: "20px 0 6px" },
  hint: { color: "#6f7496", fontSize: 12, margin: "0 0 10px" },
  select: { background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  num: { width: 90, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { padding: "9px 22px", borderRadius: 8, border: "none", background: "#f95bad", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "6px 14px", borderRadius: 8, border: "1px solid #313131", background: "transparent", color: "#cfcfcf", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  btnMini: { padding: "3px 8px", borderRadius: 6, border: "1px solid #313131", background: "transparent", color: "#cfcfcf", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  axis: { border: "1px solid #222", borderRadius: 8, padding: 12, marginBottom: 12 },
  search: { flex: 1, minWidth: 160, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" },
  // Таблица опций
  optRow: { display: "grid", gridTemplateColumns: "28px 44px 1fr 1.4fr", gap: 10, alignItems: "center", padding: "6px 4px", borderTop: "1px solid #1b1b1b" },
  optThumb: { width: 40, height: 40, borderRadius: 6, objectFit: "cover", background: "#181818", display: "block" },
  optThumbPh: { width: 40, height: 40, borderRadius: 6, background: "#181818", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 9 },
  optName: { color: "#e6e6e6", fontSize: 12, lineHeight: 1.3 },
  optKey: { color: "#5b5f7a", fontSize: 10, marginTop: 2, fontFamily: "monospace" },
  promptInput: { width: "100%", background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "5px 8px", color: "#dcdcdc", fontSize: 12, fontFamily: "monospace", outline: "none" },
  // Результаты
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 },
  cardR: { border: "1px solid #222", borderRadius: 10, overflow: "hidden", background: "#111", display: "flex", flexDirection: "column" },
  img: { width: "100%", aspectRatio: "3 / 4", objectFit: "cover", background: "#181818", display: "block" },
  imgPh: { width: "100%", aspectRatio: "3 / 4", background: "#181818", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 12 },
  cardLabel: { padding: 8, fontSize: 11, color: "#cfcfcf", lineHeight: 1.35 },
  promptBox: { marginTop: 6, maxHeight: 84, overflow: "auto", background: "#0c0c0c", border: "1px solid #1e1e1e", borderRadius: 6, padding: 6, fontSize: 10, fontFamily: "monospace", color: "#9aa0b5", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  // История
  histRow: { display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 10, alignItems: "center", padding: "7px 8px", borderTop: "1px solid #1b1b1b", cursor: "pointer", fontSize: 12, color: "#cfcfcf" },
};

const badgeStyle = (bg: string): React.CSSProperties => ({ display: "inline-block", padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: bg, color: "#fff", marginBottom: 4 });

const STATUS_COLOR: Record<string, string> = { pending: "#555", processing: "#2b6cb0", completed: "#2f855a", failed: "#c53030", running: "#2b6cb0", cancelled: "#8a6d3b" };

/** fetch → blob → временная ссылка (S3-URL кроссдоменный, прямой download не сработает). */
async function downloadUrl(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = obj;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(obj);
}

export default function AdminGenTestPage() {
  const { user, loading } = useAuth();
  const isAdmin = !!user && user.role === "admin";

  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [mode, setMode] = useState<"img2img" | "txt2img">("img2img");
  const [concurrency, setConcurrency] = useState("3");
  const [denoise, setDenoise] = useState("0.65");
  const [maxCombos, setMaxCombos] = useState("300");
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const [optionsBySub, setOptionsBySub] = useState<Record<string, Opt[]>>({});
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [promptStatus, setPromptStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const savedPrompts = useRef<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");

  const [task, setTask] = useState<GenTestTask | null>(null);
  const [items, setItems] = useState<GenTestItem[]>([]);
  const [history, setHistory] = useState<GenTestTask[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const charName = useCallback((id: string) => characters.find((c) => c.id === id)?.name || id.slice(0, 8), [characters]);

  const refreshHistory = useCallback(() => {
    admin.getGenTests().then(setHistory).catch(() => {});
  }, []);

  // Загрузка персонажей, опций и истории.
  useEffect(() => {
    if (!isAdmin) return;
    admin.getCharacters().then(setCharacters).catch(() => {});
    refreshHistory();
    Promise.all([getAppearanceOptions(), getPoseOptions(), getSceneOptions(), getCameraOptions()])
      .then(([ap, po, sc, ca]) => {
        type RawOpt = { id: string; name: string; imageThumbUrl?: string | null; prompt?: string | null };
        const flat = (cats: { options: RawOpt[] }[]): Opt[] =>
          cats.flatMap((c) => c.options.map((o) => ({ id: o.id, name: o.name, thumb: o.imageThumbUrl || null, prompt: o.prompt || "" })));
        const flatFlat = (opts: RawOpt[]): Opt[] =>
          opts.map((o) => ({ id: o.id, name: o.name, thumb: o.imageThumbUrl || null, prompt: o.prompt || "" }));
        const built: Record<string, Opt[]> = {
          OUTFITS: flat(ap.OUTFITS),
          OUTFIT_DETAILS: flat(ap.OUTFIT_DETAILS),
          FACIAL_EXPRESSION: flat(po.FACIAL_EXPRESSION),
          POSE: flat(po.POSE),
          LOCATION: flat(sc.LOCATION),
          FRAMING: flatFlat(ca.FRAMING),
          CAMERA_ANGLE: flatFlat(ca.CAMERA_ANGLE),
        };
        // Запоминаем сохранённые значения промптов для детекции изменений.
        for (const opts of Object.values(built)) for (const o of opts) savedPrompts.current[o.id] = o.prompt;
        setOptionsBySub(built);
      })
      .catch(() => {});
  }, [isAdmin, refreshHistory]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback(async (id: string): Promise<GenTestTask | null> => {
    try {
      const res = await admin.getGenTest(id);
      setTask(res.task);
      setItems(res.items);
      if (res.task.status !== "running") stopPolling();
      return res.task;
    } catch {
      stopPolling();
      return null;
    }
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  /** Загрузить существующую задачу в грид (из истории), возобновив поллинг если идёт. */
  const openTask = useCallback(async (id: string) => {
    stopPolling();
    const t = await poll(id);
    if (t && t.status === "running") pollRef.current = setInterval(() => poll(id), 3000);
  }, [poll, stopPolling]);

  const toggle = (sub: string, id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[sub] || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      next[sub] = set;
      return next;
    });
  };
  const toggleAll = (sub: string, ids: string[]) => {
    setSelected((prev) => {
      const cur = prev[sub] || new Set();
      const next = { ...prev };
      const allSelected = ids.length > 0 && ids.every((id) => cur.has(id));
      next[sub] = allSelected ? new Set() : new Set([...cur, ...ids]);
      return next;
    });
  };

  // Глобальный выбор всех опций во всех осях.
  const allGlobalSelected = useMemo(
    () => AXES.every((a) => {
      const opts = optionsBySub[a.key] || [];
      return opts.length > 0 && opts.every((o) => selected[a.key]?.has(o.id));
    }) && AXES.some((a) => (optionsBySub[a.key] || []).length > 0),
    [optionsBySub, selected],
  );
  const toggleAllGlobal = () => {
    setSelected(() => {
      if (allGlobalSelected) return {};
      const next: Record<string, Set<string>> = {};
      for (const a of AXES) next[a.key] = new Set((optionsBySub[a.key] || []).map((o) => o.id));
      return next;
    });
  };

  // Правка промпта опции (глобально, в реальную опцию).
  const editPrompt = (axis: AxisKey, id: string, value: string) => {
    setOptionsBySub((prev) => ({
      ...prev,
      [axis]: (prev[axis] || []).map((o) => (o.id === id ? { ...o, prompt: value } : o)),
    }));
  };
  const savePrompt = async (axis: AxisKey, id: string, value: string) => {
    if (savedPrompts.current[id] === value) return;
    setPromptStatus((s) => ({ ...s, [id]: "saving" }));
    try {
      await AXIS_UPDATE[axis](id, { prompt: value });
      savedPrompts.current[id] = value;
      setPromptStatus((s) => ({ ...s, [id]: "saved" }));
    } catch {
      setPromptStatus((s) => ({ ...s, [id]: "error" }));
    }
  };

  const comboCount = useMemo(() => {
    let n = 1;
    let axesUsed = 0;
    for (const a of AXES) {
      const c = selected[a.key]?.size || 0;
      if (c > 0) { n *= c; axesUsed++; }
    }
    return axesUsed === 0 ? 0 : n;
  }, [selected]);

  const handleStart = async () => {
    setErr("");
    if (!characterId) { setErr("Выберите персонажа"); return; }
    if (comboCount === 0) { setErr("Выберите хотя бы одну опцию"); return; }
    const selections: Record<string, string[]> = {};
    for (const a of AXES) {
      const ids = Array.from(selected[a.key] || []);
      if (ids.length) selections[a.key] = ids;
    }
    setStarting(true);
    try {
      const t = await admin.startGenTest({
        characterId,
        mode,
        concurrency: parseInt(concurrency, 10) || 3,
        ...(mode === "img2img" ? { denoise: parseFloat(denoise) || 0.65 } : {}),
        maxCombos: Math.min(Math.max(1, parseInt(maxCombos, 10) || 300), 1000),
        selections,
      });
      setTask(t);
      setItems([]);
      stopPolling();
      await poll(t.id);
      pollRef.current = setInterval(() => poll(t.id), 3000);
      refreshHistory();
    } catch (e: any) {
      setErr(e?.message || "Не удалось запустить");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!task) return;
    try { await admin.cancelGenTest(task.id); await poll(task.id); refreshHistory(); } catch {}
  };

  const handleResume = async () => {
    if (!task) return;
    try {
      await admin.resumeGenTest(task.id);
      stopPolling();
      await poll(task.id);
      pollRef.current = setInterval(() => poll(task.id), 3000);
      refreshHistory();
    } catch (e: any) {
      setErr(e?.message || "Не удалось продолжить");
    }
  };

  const exportRun = () => {
    if (!task) return;
    const data = items.map((it) => ({ label: it.label, prompt: it.prompt, imageUrl: it.imageUrl, status: it.status }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gentest-${task.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const canResume = !!task && task.status !== "running" && (task.failed > 0 || task.done < task.total);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!isAdmin) {
    return <div style={adminStyles.page}><div style={adminStyles.card}><h1 style={adminStyles.title}>Access denied</h1></div></div>;
  }

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="gentest" />
      <div style={adminStyles.card}>
        <h1 style={{ ...adminStyles.title, marginBottom: 8 }}>Тест генераций</h1>
        <p style={st.hint}>
          Перебор комбинаций опций (Appearance × Pose × Scene × Camera) для выбранного персонажа на его стиле/AIR.
          Кросс-произведение выбранных опций — по одной на подгруппу в комбинации.
        </p>

        {/* Параметры */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <select style={st.select} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
            <option value="">— выбрать персонажа —</option>
            {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select style={st.select} value={mode} onChange={(e) => setMode(e.target.value as "img2img" | "txt2img")}>
            <option value="img2img">img2img (как в чате)</option>
            <option value="txt2img">txt2img (чистый промпт)</option>
          </select>
          <label style={{ color: "#848484", fontSize: 12 }}>Потоки</label>
          <input style={st.num} type="number" min={1} max={8} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
          <label style={{ color: "#848484", fontSize: 12 }} title="Максимум комбинаций на прогон. Если выбранных больше — берётся случайная выборка. Потолок 1000.">Лимит комбинаций</label>
          <input style={st.num} type="number" min={1} max={1000} value={maxCombos} onChange={(e) => setMaxCombos(e.target.value)} />
          {mode === "img2img" && (
            <>
              <label style={{ color: "#848484", fontSize: 12 }} title="Сила изменения: ниже — ближе к аватару, выше — свободнее поза/сцена">
                Сила изменения {denoise}
              </label>
              <input type="range" min={0.3} max={0.9} step={0.05} value={denoise} onChange={(e) => setDenoise(e.target.value)} style={{ width: 160 }} />
            </>
          )}
        </div>
        {mode === "img2img" && (
          <p style={{ ...st.hint, margin: "6px 0 0", color: "#8a6d3b" }}>
            ⚠ Аксессуары на голове (шляпа/ободок) в img2img часто не появляются при низком denoise — поднимите к 0.85–0.9
            или используйте txt2img. Можно также усилить токен кнопкой «×1.3» рядом с промптом опции.
          </p>
        )}

        {/* Оси опций */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={st.h2}>Опции</h2>
          <label style={{ color: "#cfcfcf", fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={allGlobalSelected} onChange={toggleAllGlobal} /> Выбрать все опции (во всех осях)
          </label>
        </div>
        {AXES.map((a) => (
          <OptionAxisTable
            key={a.key}
            label={a.label}
            opts={optionsBySub[a.key] || []}
            selected={selected[a.key] || new Set<string>()}
            promptStatus={promptStatus}
            onToggle={(id) => toggle(a.key, id)}
            onToggleAll={(ids) => toggleAll(a.key, ids)}
            onEditPrompt={(id, v) => editPrompt(a.key, id, v)}
            onSavePrompt={(id, v) => savePrompt(a.key, id, v)}
          />
        ))}

        {/* Запуск */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button style={{ ...st.btn, opacity: starting ? 0.6 : 1 }} onClick={handleStart} disabled={starting}>
            {starting ? "Запуск..." : `Старт (${Math.min(comboCount, parseInt(maxCombos, 10) || 300)} комбинаций)`}
          </button>
          {comboCount > (parseInt(maxCombos, 10) || 300) && (
            <span style={{ color: "#8a6d3b", fontSize: 12 }}>
              выбрано {comboCount} — будет сгенерирована случайная выборка {parseInt(maxCombos, 10) || 300}
            </span>
          )}
          {err && <span style={{ color: "#e36466", fontSize: 13 }}>{err}</span>}
        </div>

        {/* Результаты */}
        {task && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button style={st.btnMini} onClick={() => setResultsCollapsed((c) => !c)}>{resultsCollapsed ? "▸" : "▾"}</button>
              <h2 style={{ ...st.h2, margin: 0 }}>Результаты</h2>
              <span style={{ color: "#cfcfcf", fontSize: 13 }}>
                {task.status} · {task.done}/{task.total} готово · {task.failed} ошибок · режим {task.mode}
              </span>
              {task.status === "running" && <button style={st.btnGhost} onClick={handleCancel}>Отменить</button>}
              {canResume && <button style={st.btnGhost} onClick={handleResume}>Продолжить</button>}
              {items.length > 0 && <button style={st.btnGhost} onClick={exportRun}>Экспорт прогона</button>}
              <button style={st.btnGhost} onClick={() => { stopPolling(); setTask(null); setItems([]); }}>Скрыть</button>
            </div>
            {!resultsCollapsed && (
            <div style={st.resultGrid}>
              {items.map((it) => <ResultCard key={it.id} item={it} />)}
            </div>
            )}
          </div>
        )}

        {/* История */}
        <HistoryPanel history={history} charName={charName} activeId={task?.id || null} onOpen={openTask} onRefresh={refreshHistory} />
      </div>
    </div>
  );
}

// ─── Таблица опций одной оси ──────────────────────────────────────────────────

function OptionAxisTable({
  label, opts, selected, promptStatus, onToggle, onToggleAll, onEditPrompt, onSavePrompt,
}: {
  label: string;
  opts: Opt[];
  selected: Set<string>;
  promptStatus: Record<string, "saving" | "saved" | "error">;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onEditPrompt: (id: string, value: string) => void;
  onSavePrompt: (id: string, value: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return opts.filter((o) => {
      if (onlySelected && !selected.has(o.id)) return false;
      if (!q) return true;
      return (
        o.name.toLowerCase().includes(q) ||
        localizeOption(o.name, "ru").toLowerCase().includes(q) ||
        o.prompt.toLowerCase().includes(q)
      );
    });
  }, [opts, query, onlySelected, selected]);

  const filteredIds = useMemo(() => filtered.map((o) => o.id), [filtered]);
  const allShownSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  return (
    <div style={st.axis}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button style={st.btnMini} onClick={() => setCollapsed((c) => !c)}>{collapsed ? "▸" : "▾"}</button>
        <strong style={{ color: "#fff", fontSize: 13 }}>{label}</strong>
        <span style={{ color: "#848484", fontSize: 12 }}>{opts.length} опц. · выбрано {selected.size}</span>
        {!collapsed && opts.length > 0 && (
          <>
            <input style={st.search} placeholder="поиск по названию / ключу / промпту" value={query} onChange={(e) => setQuery(e.target.value)} />
            <label style={{ color: "#848484", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> только выбранные
            </label>
            <button style={st.btnGhost} onClick={() => onToggleAll(filteredIds)}>{allShownSelected ? "Снять всё" : "Выбрать всё"}</button>
          </>
        )}
      </div>

      {!collapsed && (
        opts.length === 0 ? (
          <p style={{ ...st.hint, margin: "8px 0 0" }}>Нет опций</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {filtered.length === 0 && <p style={{ ...st.hint, margin: "6px 0 0" }}>Ничего не найдено</p>}
            {filtered.map((o) => {
              const on = selected.has(o.id);
              const status = promptStatus[o.id];
              return (
                <div key={o.id} style={{ ...st.optRow, ...(on ? { background: "#180d13" } : {}) }}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                  {o.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.thumb} alt={o.name} style={st.optThumb} />
                  ) : (
                    <div style={st.optThumbPh}>нет</div>
                  )}
                  <div>
                    <div style={st.optName}>{localizeOption(o.name, "ru")}</div>
                    <div style={st.optKey}>{o.name}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      style={st.promptInput}
                      value={o.prompt}
                      placeholder="(пусто)"
                      onChange={(e) => onEditPrompt(o.id, e.target.value)}
                      onBlur={(e) => onSavePrompt(o.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <button
                      style={st.btnMini}
                      title="Усилить вес токена: обернуть в (…:1.3)"
                      onClick={() => { const v = `(${o.prompt.trim()}:1.3)`; onEditPrompt(o.id, v); onSavePrompt(o.id, v); }}
                    >×1.3</button>
                    <span style={{ fontSize: 11, width: 16, color: status === "error" ? "#e36466" : "#2f855a" }}>
                      {status === "saving" ? "…" : status === "saved" ? "✓" : status === "error" ? "✕" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ─── Карточка результата ──────────────────────────────────────────────────────

function ResultCard({ item }: { item: GenTestItem }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(item.prompt); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };
  const download = () => {
    if (item.imageUrl) void downloadUrl(item.imageUrl, `gentest-${item.id.slice(0, 8)}.png`);
  };
  return (
    <div style={st.cardR}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt={item.label} style={st.img} />
      ) : (
        <div style={st.imgPh}>{item.status === "failed" ? "ошибка" : item.status === "processing" ? "генерация…" : "в очереди"}</div>
      )}
      <div style={st.cardLabel}>
        <span style={badgeStyle(STATUS_COLOR[item.status] || "#555")}>{item.status}</span>
        <div>{localizeLabel(item.label)}</div>
        {item.error && <div style={{ color: "#e36466", marginTop: 4 }}>{item.error}</div>}
        <div style={st.promptBox}>{item.prompt}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button style={st.btnMini} onClick={copy}>{copied ? "скопировано" : "Копировать промпт"}</button>
          {item.imageUrl && <button style={st.btnMini} onClick={download}>Скачать</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Панель истории прогонов ──────────────────────────────────────────────────

function HistoryPanel({
  history, charName, activeId, onOpen, onRefresh,
}: {
  history: GenTestTask[];
  charName: (id: string) => string;
  activeId: string | null;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button style={st.btnMini} onClick={() => setCollapsed((c) => !c)}>{collapsed ? "▸" : "▾"}</button>
        <h2 style={{ ...st.h2, margin: 0 }}>История</h2>
        <span style={{ color: "#848484", fontSize: 12 }}>{history.length} прогонов</span>
        <button style={st.btnMini} onClick={onRefresh}>Обновить</button>
      </div>
      {!collapsed && (
        history.length === 0 ? (
          <p style={{ ...st.hint, margin: "8px 0 0" }}>Пока нет прогонов</p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {history.map((t) => (
              <div
                key={t.id}
                style={{ ...st.histRow, ...(t.id === activeId ? { background: "#180d13" } : {}) }}
                onClick={() => onOpen(t.id)}
              >
                <span style={{ color: "#fff" }}>{charName(t.characterId)}</span>
                <span style={{ color: "#848484" }}>{new Date(t.createdAt).toLocaleString("ru-RU")}</span>
                <span style={{ color: "#848484" }}>{t.mode}</span>
                <span style={{ color: "#cfcfcf" }}>{t.done}/{t.total}{t.failed ? ` · ${t.failed} ош.` : ""}</span>
                <span style={badgeStyle(STATUS_COLOR[t.status] || "#555")}>{t.status}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
