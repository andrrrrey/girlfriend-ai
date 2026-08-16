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

interface Opt { id: string; name: string; thumb: string | null }

const st: Record<string, React.CSSProperties> = {
  h2: { color: "#fff", fontSize: 16, fontWeight: 700, margin: "20px 0 6px" },
  hint: { color: "#6f7496", fontSize: 12, margin: "0 0 10px" },
  select: { background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  num: { width: 90, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { padding: "9px 22px", borderRadius: 8, border: "none", background: "#f95bad", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "6px 14px", borderRadius: 8, border: "1px solid #313131", background: "transparent", color: "#cfcfcf", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  axis: { border: "1px solid #222", borderRadius: 8, padding: 12, marginBottom: 12 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid #313131", background: "#0f0f0f", color: "#ccc", fontSize: 12, cursor: "pointer" },
  chipOn: { border: "1px solid #f95bad", background: "#241019", color: "#fff" },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 },
  cardR: { border: "1px solid #222", borderRadius: 10, overflow: "hidden", background: "#111" },
  img: { width: "100%", aspectRatio: "3 / 4", objectFit: "cover", background: "#181818", display: "block" },
  imgPh: { width: "100%", aspectRatio: "3 / 4", background: "#181818", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: 12 },
  cardLabel: { padding: 8, fontSize: 11, color: "#cfcfcf", lineHeight: 1.35 },
};

const badgeStyle = (bg: string): React.CSSProperties => ({ display: "inline-block", padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: bg, color: "#fff", marginBottom: 4 });

const STATUS_COLOR: Record<string, string> = { pending: "#555", processing: "#2b6cb0", completed: "#2f855a", failed: "#c53030" };

export default function AdminGenTestPage() {
  const { user, loading } = useAuth();
  const isAdmin = !!user && user.role === "admin";

  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [mode, setMode] = useState<"img2img" | "txt2img">("img2img");
  const [concurrency, setConcurrency] = useState("3");
  const [optionsBySub, setOptionsBySub] = useState<Record<string, Opt[]>>({});
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState("");

  const [task, setTask] = useState<GenTestTask | null>(null);
  const [items, setItems] = useState<GenTestItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Загрузка персонажей и опций.
  useEffect(() => {
    if (!isAdmin) return;
    admin.getCharacters().then(setCharacters).catch(() => {});
    Promise.all([getAppearanceOptions(), getPoseOptions(), getSceneOptions(), getCameraOptions()])
      .then(([ap, po, sc, ca]) => {
        const flat = (cats: { options: { id: string; name: string; imageThumbUrl?: string | null }[] }[]): Opt[] =>
          cats.flatMap((c) => c.options.map((o) => ({ id: o.id, name: o.name, thumb: o.imageThumbUrl || null })));
        const flatFlat = (opts: { id: string; name: string; imageThumbUrl?: string | null }[]): Opt[] =>
          opts.map((o) => ({ id: o.id, name: o.name, thumb: o.imageThumbUrl || null }));
        setOptionsBySub({
          OUTFITS: flat(ap.OUTFITS),
          OUTFIT_DETAILS: flat(ap.OUTFIT_DETAILS),
          FACIAL_EXPRESSION: flat(po.FACIAL_EXPRESSION),
          POSE: flat(po.POSE),
          LOCATION: flat(sc.LOCATION),
          FRAMING: flatFlat(ca.FRAMING),
          CAMERA_ANGLE: flatFlat(ca.CAMERA_ANGLE),
        });
      })
      .catch(() => {});
  }, [isAdmin]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback(async (id: string) => {
    try {
      const res = await admin.getGenTest(id);
      setTask(res.task);
      setItems(res.items);
      if (res.task.status !== "running") stopPolling();
    } catch {
      stopPolling();
    }
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const toggle = (sub: string, id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[sub] || []);
      if (set.has(id)) set.delete(id); else set.add(id);
      next[sub] = set;
      return next;
    });
  };
  const toggleAll = (sub: string) => {
    setSelected((prev) => {
      const all = (optionsBySub[sub] || []).map((o) => o.id);
      const cur = prev[sub] || new Set();
      const next = { ...prev };
      next[sub] = cur.size === all.length ? new Set() : new Set(all);
      return next;
    });
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
        selections,
      });
      setTask(t);
      setItems([]);
      stopPolling();
      await poll(t.id);
      pollRef.current = setInterval(() => poll(t.id), 3000);
    } catch (e: any) {
      setErr(e?.message || "Не удалось запустить");
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!task) return;
    try { await admin.cancelGenTest(task.id); await poll(task.id); } catch {}
  };

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
        </div>

        {/* Оси опций */}
        <h2 style={st.h2}>Опции</h2>
        {AXES.map((a) => {
          const opts = optionsBySub[a.key] || [];
          const sel = selected[a.key] || new Set<string>();
          return (
            <div key={a.key} style={st.axis}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ color: "#fff", fontSize: 13 }}>{a.label}</strong>
                <span style={{ color: "#848484", fontSize: 12 }}>{opts.length} опц. · выбрано {sel.size}</span>
                {opts.length > 0 && <button style={st.btnGhost} onClick={() => toggleAll(a.key)}>{sel.size === opts.length ? "Снять всё" : "Выбрать всё"}</button>}
              </div>
              {opts.length === 0 ? (
                <p style={{ ...st.hint, margin: "8px 0 0" }}>Нет опций</p>
              ) : (
                <div style={st.chips}>
                  {opts.map((o) => {
                    const on = sel.has(o.id);
                    return (
                      <span key={o.id} style={{ ...st.chip, ...(on ? st.chipOn : {}) }} onClick={() => toggle(a.key, o.id)}>
                        <input type="checkbox" checked={on} readOnly />
                        {o.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Запуск */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button style={{ ...st.btn, opacity: starting ? 0.6 : 1 }} onClick={handleStart} disabled={starting}>
            {starting ? "Запуск..." : `Старт (${comboCount} комбинаций)`}
          </button>
          {comboCount > 300 && <span style={{ color: "#e36466", fontSize: 12 }}>Лимит 300 комбинаций — сократите выбор</span>}
          {err && <span style={{ color: "#e36466", fontSize: 13 }}>{err}</span>}
        </div>

        {/* Результаты */}
        {task && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ ...st.h2, margin: 0 }}>Результаты</h2>
              <span style={{ color: "#cfcfcf", fontSize: 13 }}>
                {task.status} · {task.done}/{task.total} готово · {task.failed} ошибок · режим {task.mode}
              </span>
              {task.status === "running" && <button style={st.btnGhost} onClick={handleCancel}>Отменить</button>}
            </div>
            <div style={st.resultGrid}>
              {items.map((it) => (
                <div key={it.id} style={st.cardR}>
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrl} alt={it.label} style={st.img} />
                  ) : (
                    <div style={st.imgPh}>{it.status === "failed" ? "ошибка" : it.status === "processing" ? "генерация…" : "в очереди"}</div>
                  )}
                  <div style={st.cardLabel}>
                    <span style={badgeStyle(STATUS_COLOR[it.status] || "#555")}>{it.status}</span>
                    <div>{it.label}</div>
                    {it.error && <div style={{ color: "#e36466", marginTop: 4 }}>{it.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
