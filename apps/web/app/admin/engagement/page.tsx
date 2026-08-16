"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

type TargetType = "character" | "short";

/** Унифицированная цель для пикера (персонаж или видео-шорт). */
interface TargetItem {
  id: string;
  label: string;
  thumb: string | null;
}

const s: Record<string, React.CSSProperties> = {
  card: { background: "#1a1a1a", borderRadius: 10, padding: 20, marginTop: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: { flex: 1, minWidth: 200, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  numInput: { width: 120, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  select: { background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { padding: "8px 20px", borderRadius: 8, border: "none", background: "#f95bad", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { padding: "6px 14px", borderRadius: 8, border: "1px solid #313131", background: "transparent", color: "#cfcfcf", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  label: { color: "#848484", fontSize: 12, fontWeight: 600 },
  result: { color: "#4ade80", fontSize: 13 },
  error: { color: "#e36466", fontSize: 13 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 4px" },
  hint: { color: "#6f7496", fontSize: 12, margin: 0 },
  pickerBox: { maxWidth: 720, marginTop: 12, border: "1px solid #262626", borderRadius: 10, background: "#141414", overflow: "hidden" },
  pickerToolbar: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 12, borderBottom: "1px solid #222" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, padding: 12, maxHeight: 360, overflowY: "auto" },
  cell: { display: "flex", gap: 8, alignItems: "center", padding: 8, borderRadius: 8, border: "1px solid #262626", background: "#0f0f0f", cursor: "pointer" },
  cellActive: { border: "1px solid #f95bad", background: "#241019" },
  thumb: { width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0, background: "#222" },
  thumbPh: { width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: "#222", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 },
  cellLabel: { color: "#e5e5e5", fontSize: 12, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" },
};

export default function AdminEngagementPage() {
  const { user, loading } = useAuth();

  // Общий для обеих операций выбор целей.
  const [targetType, setTargetType] = useState<TargetType>("character");
  const [items, setItems] = useState<TargetItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Накрутка лайков
  const [likeBoost, setLikeBoost] = useState("100");
  const [likeMsg, setLikeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  // Автокомментарии
  const [cmtCount, setCmtCount] = useState("5");
  const [cmtMsg, setCmtMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cmtBusy, setCmtBusy] = useState(false);

  const isAdmin = !!user && user.role === "admin";

  const loadTargets = useCallback(async (type: TargetType) => {
    setListLoading(true);
    try {
      if (type === "character") {
        const chars = await admin.getCharacters();
        setItems(chars.map((c) => ({ id: c.id, label: c.name, thumb: c.avatarUrl })));
      } else {
        const res = await admin.getGenerations({ type: "video", limit: 200 });
        setItems(
          (res.items || []).map((j: any) => ({
            id: j.id,
            label: (j.input?.prompt as string) || `Видео ${String(j.id).slice(0, 8)}`,
            thumb: (j.output?.thumbUrl as string) || (j.output?.posterUrl as string) || null,
          })),
        );
      }
    } catch {
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setSelected(new Set());
    void loadTargets(targetType);
  }, [isAdmin, targetType, loadTargets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q));
  }, [items, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((it) => it.id)));
  const clearSelection = () => setSelected(new Set());

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!isAdmin) {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}><h1 style={adminStyles.title}>Access denied</h1></div>
      </div>
    );
  }

  const selectedIds = () => Array.from(selected);

  const handleBoost = async () => {
    const ids = selectedIds();
    if (ids.length === 0) { setLikeMsg({ ok: false, text: "Выберите цели" }); return; }
    setLikeBusy(true); setLikeMsg(null);
    try {
      const res = await admin.setBoostLikes(targetType, ids, parseInt(likeBoost, 10) || 0);
      setLikeMsg({ ok: true, text: `Надбавка ${res.boostLikes} установлена для ${res.count} целей` });
    } catch {
      setLikeMsg({ ok: false, text: "Не удалось применить" });
    } finally {
      setLikeBusy(false);
    }
  };

  const handleComments = async () => {
    const ids = selectedIds();
    if (ids.length === 0) { setCmtMsg({ ok: false, text: "Выберите цели" }); return; }
    setCmtBusy(true); setCmtMsg(null);
    try {
      const res = await admin.generateComments(targetType, ids, parseInt(cmtCount, 10) || 0);
      setCmtMsg({ ok: true, text: `Создано ${res.created} из ${res.requested} комментариев (${res.targets} целей)` });
    } catch {
      setCmtMsg({ ok: false, text: "Не удалось сгенерировать" });
    } finally {
      setCmtBusy(false);
    }
  };

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="engagement" />
      <div style={adminStyles.card}>
        <h1 style={{ ...adminStyles.title, marginBottom: 20 }}>Вовлечённость</h1>

        {/* Выбор целей */}
        <h2 style={s.sectionTitle}>Выбор целей</h2>
        <p style={s.hint}>Отметьте персонажей или видео — операции ниже применяются к выбранным.</p>
        <div style={s.pickerBox}>
          <div style={s.pickerToolbar}>
            <select style={s.select} value={targetType} onChange={(e) => setTargetType(e.target.value as TargetType)}>
              <option value="character">Персонажи</option>
              <option value="short">Видео (шорты)</option>
            </select>
            <input style={s.input} placeholder="Поиск по названию / ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button style={s.btnGhost} onClick={selectAllFiltered}>Выбрать всё{search ? " (найденные)" : ""}</button>
            <button style={s.btnGhost} onClick={clearSelection}>Снять всё</button>
            <span style={{ ...s.label, marginLeft: "auto" }}>Выбрано: {selected.size}</span>
          </div>
          {listLoading ? (
            <p style={{ ...s.hint, padding: 16 }}>Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p style={{ ...s.hint, padding: 16 }}>Ничего не найдено</p>
          ) : (
            <div style={s.grid}>
              {filtered.map((it) => {
                const active = selected.has(it.id);
                return (
                  <div
                    key={it.id}
                    style={{ ...s.cell, ...(active ? s.cellActive : {}) }}
                    onClick={() => toggle(it.id)}
                  >
                    <input type="checkbox" checked={active} readOnly />
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb} alt="" style={s.thumb} />
                    ) : (
                      <div style={s.thumbPh}>{targetType === "character" ? "👤" : "🎬"}</div>
                    )}
                    <span style={s.cellLabel}>{it.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Накрутка лайков */}
        <h2 style={{ ...s.sectionTitle, marginTop: 24 }}>Накрутка лайков</h2>
        <p style={s.hint}>Итоговый счётчик = реальные лайки + надбавка. Значение задаётся для всех выбранных целей.</p>
        <div style={s.card}>
          <div style={s.row}>
            <input style={s.numInput} type="number" min={0} placeholder="Надбавка" value={likeBoost} onChange={(e) => setLikeBoost(e.target.value)} />
            <button style={s.btn} onClick={handleBoost} disabled={likeBusy}>{likeBusy ? "..." : `Применить (${selected.size})`}</button>
          </div>
          {likeMsg && <span style={likeMsg.ok ? s.result : s.error}>{likeMsg.text}</span>}
        </div>

        {/* Автокомментарии */}
        <h2 style={{ ...s.sectionTitle, marginTop: 24 }}>Автогенерация комментариев</h2>
        <p style={s.hint}>Генерирует комментарии через AI от лица пула бот-пользователей. До 50 на каждую выбранную цель.</p>
        <div style={s.card}>
          <div style={s.row}>
            <input style={s.numInput} type="number" min={1} max={50} placeholder="Кол-во" value={cmtCount} onChange={(e) => setCmtCount(e.target.value)} />
            <button style={s.btn} onClick={handleComments} disabled={cmtBusy}>{cmtBusy ? "Генерация..." : `Сгенерировать (${selected.size})`}</button>
          </div>
          {cmtMsg && <span style={cmtMsg.ok ? s.result : s.error}>{cmtMsg.text}</span>}
        </div>
      </div>
    </div>
  );
}
