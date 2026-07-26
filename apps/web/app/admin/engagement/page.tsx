"use client";

import React, { useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

type TargetType = "character" | "short";

const s: Record<string, React.CSSProperties> = {
  card: { background: "#1a1a1a", borderRadius: 10, padding: 20, marginTop: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: { flex: 1, minWidth: 200, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  numInput: { width: 120, background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  select: { background: "#0f0f0f", border: "1px solid #313131", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { padding: "8px 20px", borderRadius: 8, border: "none", background: "#f95bad", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  label: { color: "#848484", fontSize: 12, fontWeight: 600 },
  result: { color: "#4ade80", fontSize: 13 },
  error: { color: "#e36466", fontSize: 13 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 4px" },
  hint: { color: "#6f7496", fontSize: 12, margin: 0 },
};

export default function AdminEngagementPage() {
  const { user, loading } = useAuth();

  // Накрутка лайков
  const [likeTarget, setLikeTarget] = useState<TargetType>("character");
  const [likeId, setLikeId] = useState("");
  const [likeBoost, setLikeBoost] = useState("100");
  const [likeMsg, setLikeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);

  // Автокомментарии
  const [cmtTarget, setCmtTarget] = useState<TargetType>("character");
  const [cmtId, setCmtId] = useState("");
  const [cmtCount, setCmtCount] = useState("5");
  const [cmtMsg, setCmtMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cmtBusy, setCmtBusy] = useState(false);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}><h1 style={adminStyles.title}>Access denied</h1></div>
      </div>
    );
  }

  const handleBoost = async () => {
    if (!likeId.trim()) { setLikeMsg({ ok: false, text: "Укажите ID" }); return; }
    setLikeBusy(true); setLikeMsg(null);
    try {
      const res = await admin.setBoostLikes(likeTarget, likeId.trim(), parseInt(likeBoost, 10) || 0);
      setLikeMsg({ ok: true, text: `Надбавка установлена: ${res.boostLikes}` });
    } catch {
      setLikeMsg({ ok: false, text: "Не удалось (проверьте ID и тип)" });
    } finally {
      setLikeBusy(false);
    }
  };

  const handleComments = async () => {
    if (!cmtId.trim()) { setCmtMsg({ ok: false, text: "Укажите ID" }); return; }
    setCmtBusy(true); setCmtMsg(null);
    try {
      const res = await admin.generateComments(cmtTarget, cmtId.trim(), parseInt(cmtCount, 10) || 0);
      setCmtMsg({ ok: true, text: `Создано комментариев: ${res.created} из ${res.requested}` });
    } catch {
      setCmtMsg({ ok: false, text: "Не удалось (проверьте ID и тип)" });
    } finally {
      setCmtBusy(false);
    }
  };

  return (
    <div style={adminStyles.page}>
      <AdminTabs active="engagement" />
      <div style={adminStyles.card}>
        <h1 style={{ ...adminStyles.title, marginBottom: 20 }}>Вовлечённость</h1>

        {/* Накрутка лайков */}
        <h2 style={s.sectionTitle}>Накрутка лайков</h2>
        <p style={s.hint}>Итоговый счётчик = реальные лайки + надбавка. Для персонажа — ID персонажа, для шорта — jobId.</p>
        <div style={s.card}>
          <div style={s.row}>
            <select style={s.select} value={likeTarget} onChange={(e) => setLikeTarget(e.target.value as TargetType)}>
              <option value="character">Персонаж</option>
              <option value="short">Шорт (видео)</option>
            </select>
            <input style={s.input} placeholder="ID цели" value={likeId} onChange={(e) => setLikeId(e.target.value)} />
            <input style={s.numInput} type="number" min={0} placeholder="Надбавка" value={likeBoost} onChange={(e) => setLikeBoost(e.target.value)} />
            <button style={s.btn} onClick={handleBoost} disabled={likeBusy}>{likeBusy ? "..." : "Применить"}</button>
          </div>
          {likeMsg && <span style={likeMsg.ok ? s.result : s.error}>{likeMsg.text}</span>}
        </div>

        {/* Автокомментарии */}
        <h2 style={{ ...s.sectionTitle, marginTop: 24 }}>Автогенерация комментариев</h2>
        <p style={s.hint}>Генерирует комментарии через AI от лица пула бот-пользователей. До 50 за раз.</p>
        <div style={s.card}>
          <div style={s.row}>
            <select style={s.select} value={cmtTarget} onChange={(e) => setCmtTarget(e.target.value as TargetType)}>
              <option value="character">Персонаж</option>
              <option value="short">Шорт (видео)</option>
            </select>
            <input style={s.input} placeholder="ID цели" value={cmtId} onChange={(e) => setCmtId(e.target.value)} />
            <input style={s.numInput} type="number" min={1} max={50} placeholder="Кол-во" value={cmtCount} onChange={(e) => setCmtCount(e.target.value)} />
            <button style={s.btn} onClick={handleComments} disabled={cmtBusy}>{cmtBusy ? "Генерация..." : "Сгенерировать"}</button>
          </div>
          {cmtMsg && <span style={cmtMsg.ok ? s.result : s.error}>{cmtMsg.text}</span>}
        </div>
      </div>
    </div>
  );
}
