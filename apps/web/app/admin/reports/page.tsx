"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type AdminReport } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

/** Русские подписи причин для таблицы и фильтра (ключи совпадают с попапом ReportModal). */
const REASON_LABELS: Record<string, string> = {
  underage_porn: "Детское порно",
  real_people_porn: "Порно с реальными людьми",
  character_plagiarism: "Плагиат персонажа",
  wrong_classification: "Неверная классификация (18+)",
  violence_gore: "Насилие или жестокость",
  hate_speech: "Разжигание ненависти / дискриминация",
  horror_dangerous: "Ужасающий / опасный контент",
  low_quality_spam: "Низкокачественный спам",
};

const reasonLabel = (key: string) => REASON_LABELS[key] ?? key;

const pageStyles: Record<string, React.CSSProperties> = {
  badge: { background: "rgba(249,91,173,0.2)", color: "#f95bad", fontSize: 13, padding: "2px 10px", borderRadius: 12 },
  searchInput: { background: "#1e1e1e", border: "1px solid #313131", borderRadius: 8, padding: "8px 14px", color: "#fff", fontSize: 13, outline: "none", width: 220 },
  select: { background: "#1e1e1e", border: "1px solid #313131", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" },
  tableWrapper: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { color: "#848484", fontWeight: "600" as const, textAlign: "left" as const, padding: "8px 12px", borderBottom: "1px solid #313131", whiteSpace: "nowrap" as const },
  tr: { borderBottom: "1px solid #1e1e1e" },
  td: { padding: "12px 12px", verticalAlign: "top" as const },
  userEmail: { color: "#fff", fontWeight: "500" as const },
  userNick: { color: "#888", fontSize: 12, marginTop: 2 },
  dateText: { color: "#848484", fontSize: 12, whiteSpace: "nowrap" as const },
  charName: { color: "#fff", fontSize: 13 },
  reasonBadges: { display: "flex", flexWrap: "wrap" as const, gap: 6, maxWidth: 280 },
  reasonBadge: { background: "rgba(249,91,173,0.12)", color: "#f95bad", fontSize: 11, padding: "2px 8px", borderRadius: 8 },
  details: { color: "#bbb", fontSize: 12, maxWidth: 260, whiteSpace: "pre-wrap" as const },
  statusOpen: { background: "rgba(253,203,110,0.15)", color: "#fdcb6e", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: "600" as const },
  statusResolved: { background: "rgba(193,240,170,0.15)", color: "#c1f0aa", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: "600" as const },
  actions: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  btn: { border: "none", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: "600" as const, cursor: "pointer", whiteSpace: "nowrap" as const },
  btnSuccess: { background: "rgba(193,240,170,0.15)", color: "#c1f0aa" },
  btnSecondary: { background: "rgba(253,203,110,0.12)", color: "#fdcb6e" },
  btnDanger: { background: "rgba(227,100,102,0.15)", color: "#e36466" },
  pagination: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 24 },
  pageBtn: { background: "transparent", border: "1px solid #313131", color: "#aaa", padding: "7px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  pageInfo: { color: "#888", fontSize: 13 },
  alert: { borderRadius: 8, padding: "10px 16px", fontSize: 13 },
  alertError: { background: "rgba(227,100,102,0.15)", border: "1px solid #e36466", color: "#e36466" },
  alertSuccess: { background: "rgba(193,240,170,0.15)", border: "1px solid #c1f0aa", color: "#c1f0aa" },
};

const LIMIT = 20;

export default function AdminReportsPage() {
  const { user, loading } = useAuth();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [charOptions, setCharOptions] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const res = await admin.getReports({
        search: search || undefined,
        characterId: characterId || undefined,
        reason: reason || undefined,
        limit: LIMIT,
        offset,
      });
      setReports(res.reports);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }, [search, characterId, reason, offset]);

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
  }, [loading, user, load]);

  // Список персонажей для фильтра (один раз собираем из крупной выборки).
  useEffect(() => {
    if (loading || user?.role !== "admin") return;
    admin
      .getReports({ limit: 500, offset: 0 })
      .then((res) => {
        const map = new Map<string, string>();
        res.reports.forEach((r) => {
          if (r.character) map.set(r.character.id, r.character.name);
        });
        setCharOptions(Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, [loading, user]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  };

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(""), 3000);
  };

  const handleToggleStatus = async (r: AdminReport) => {
    const next = r.status === "resolved" ? "open" : "resolved";
    try {
      await admin.updateReportStatus(r.id, next);
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
      flash(`Статус жалобы изменён на «${next}»`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (r: AdminReport) => {
    if (!confirm("Удалить эту жалобу?")) return;
    try {
      await admin.deleteReport(r.id);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      setTotal((prev) => prev - 1);
      flash("Жалоба удалена");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="reports" />

        {error && <div style={{ ...pageStyles.alert, ...pageStyles.alertError, marginBottom: 16 }}>{error}</div>}
        {actionMsg && <div style={{ ...pageStyles.alert, ...pageStyles.alertSuccess, marginBottom: 16 }}>{actionMsg}</div>}

        <div style={adminStyles.card}>
          <div style={{ ...adminStyles.headerRow, flexWrap: "wrap", gap: 12 }}>
            <h2 style={{ ...adminStyles.title, display: "flex", alignItems: "center", gap: 10 }}>
              Жалобы
              <span style={pageStyles.badge}>{total}</span>
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={characterId}
                onChange={(e) => { setOffset(0); setCharacterId(e.target.value); }}
                style={pageStyles.select}
              >
                <option value="">Все персонажи</option>
                {charOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={reason}
                onChange={(e) => { setOffset(0); setReason(e.target.value); }}
                style={pageStyles.select}
              >
                <option value="">Все причины</option>
                {Object.entries(REASON_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Поиск: репортёр / персонаж..."
                  style={pageStyles.searchInput}
                />
                <button type="submit" style={adminStyles.button}>Найти</button>
              </form>
            </div>
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : reports.length === 0 ? (
            <p style={{ color: "#888", padding: "20px 0" }}>Жалобы не найдены.</p>
          ) : (
            <div style={pageStyles.tableWrapper}>
              <table style={pageStyles.table}>
                <thead>
                  <tr>
                    <th style={pageStyles.th}>От кого</th>
                    <th style={pageStyles.th}>Дата</th>
                    <th style={pageStyles.th}>Персонаж</th>
                    <th style={pageStyles.th}>Причины</th>
                    <th style={pageStyles.th}>Детали</th>
                    <th style={pageStyles.th}>Статус</th>
                    <th style={pageStyles.th}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} style={pageStyles.tr}>
                      <td style={pageStyles.td}>
                        <div style={pageStyles.userEmail}>{r.user?.email ?? "—"}</div>
                        {r.user?.nickname && <div style={pageStyles.userNick}>{r.user.nickname}</div>}
                      </td>
                      <td style={pageStyles.td}>
                        <span style={pageStyles.dateText}>{new Date(r.createdAt).toLocaleString("ru-RU")}</span>
                      </td>
                      <td style={pageStyles.td}>
                        <span style={pageStyles.charName}>{r.character?.name ?? "—"}</span>
                      </td>
                      <td style={pageStyles.td}>
                        <div style={pageStyles.reasonBadges}>
                          {r.reasons.length === 0 ? (
                            <span style={{ color: "#555" }}>—</span>
                          ) : (
                            r.reasons.map((key) => (
                              <span key={key} style={pageStyles.reasonBadge}>{reasonLabel(key)}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={pageStyles.td}>
                        <div style={pageStyles.details}>{r.details || "—"}</div>
                      </td>
                      <td style={pageStyles.td}>
                        <span style={r.status === "resolved" ? pageStyles.statusResolved : pageStyles.statusOpen}>
                          {r.status === "resolved" ? "обработано" : "открыто"}
                        </span>
                      </td>
                      <td style={pageStyles.td}>
                        <div style={pageStyles.actions}>
                          <button
                            onClick={() => handleToggleStatus(r)}
                            style={r.status === "resolved" ? { ...pageStyles.btn, ...pageStyles.btnSecondary } : { ...pageStyles.btn, ...pageStyles.btnSuccess }}
                          >
                            {r.status === "resolved" ? "Открыть" : "Обработано"}
                          </button>
                          <button onClick={() => handleDelete(r)} style={{ ...pageStyles.btn, ...pageStyles.btnDanger }}>
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={pageStyles.pagination}>
              <button disabled={currentPage === 1} onClick={() => setOffset(Math.max(0, offset - LIMIT))} style={pageStyles.pageBtn}>← Назад</button>
              <span style={pageStyles.pageInfo}>{currentPage} / {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + LIMIT)} style={pageStyles.pageBtn}>Вперёд →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
