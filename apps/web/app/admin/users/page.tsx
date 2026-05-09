"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type AdminUser } from "../../../lib/api";
import { adminStyles } from "../admin-styles";

const pageStyles: Record<string, React.CSSProperties> = {
  badge: {
    background: "rgba(249,91,173,0.2)",
    color: "#f95bad",
    fontSize: 13,
    padding: "2px 10px",
    borderRadius: 12,
    fontWeight: "normal" as const,
  },
  searchInput: {
    background: "#1e1e1e",
    border: "1px solid #313131",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    width: 240,
  },
  tableWrapper: { overflowX: "auto" as const },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    color: "#848484",
    fontWeight: "600" as const,
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: "1px solid #313131",
    whiteSpace: "nowrap" as const,
  },
  tr: { borderBottom: "1px solid #1e1e1e" },
  td: {
    padding: "12px 12px",
    verticalAlign: "middle" as const,
  },
  userEmail: { color: "#fff", fontWeight: "500" as const },
  userNick: { color: "#888", fontSize: 12, marginTop: 2 },
  demoTag: {
    background: "rgba(253,203,110,0.15)",
    color: "#fdcb6e",
    fontSize: 10,
    padding: "1px 7px",
    borderRadius: 8,
    marginTop: 3,
    display: "inline-block",
  },
  badgePaid: {
    background: "rgba(193,240,170,0.15)",
    color: "#c1f0aa",
    padding: "3px 12px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  badgeFree: {
    background: "rgba(249,91,173,0.1)",
    color: "#f95bad",
    padding: "3px 12px",
    borderRadius: 12,
    fontSize: 12,
  },
  badgeAdmin: {
    background: "rgba(249,91,173,0.15)",
    color: "#f95bad",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  badgeUser: {
    background: "rgba(255,255,255,0.06)",
    color: "#969696",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
  },
  limitText: { color: "#fdcb6e", fontSize: 12 },
  dateText: { color: "#848484", fontSize: 12 },
  actions: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  btn: {
    border: "none",
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "600" as const,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  },
  btnSuccess: {
    background: "rgba(193,240,170,0.15)",
    color: "#c1f0aa",
  },
  btnDanger: {
    background: "rgba(227,100,102,0.15)",
    color: "#e36466",
  },
  btnSecondary: {
    background: "rgba(253,203,110,0.12)",
    color: "#fdcb6e",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.05)",
    color: "#848484",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 24,
  },
  pageBtn: {
    background: "transparent",
    border: "1px solid #313131",
    color: "#aaa",
    padding: "7px 18px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
  },
  pageInfo: { color: "#888", fontSize: 13 },
  alert: {
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 13,
  },
  alertError: {
    background: "rgba(227,100,102,0.15)",
    border: "1px solid #e36466",
    color: "#e36466",
  },
  alertSuccess: {
    background: "rgba(193,240,170,0.15)",
    border: "1px solid #c1f0aa",
    color: "#c1f0aa",
  },
};

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const LIMIT = 20;

  const loadUsers = useCallback(
    async (s: string, off: number) => {
      setFetching(true);
      setError("");
      try {
        const res = await admin.getUsers({ search: s || undefined, limit: LIMIT, offset: off });
        setUsers(res.users);
        setTotal(res.total);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!loading && user?.role === "admin") {
      loadUsers(search, offset);
    }
  }, [loading, user, search, offset, loadUsers]);

  if (loading) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={adminStyles.page}>
        <div style={adminStyles.card}>
          <h1 style={adminStyles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <a href="/" style={adminStyles.link}>На главную</a>
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

  const handleToggleSubscription = async (u: AdminUser) => {
    const next = u.subscription === "paid" ? "free" : "paid";
    try {
      const updated = await admin.updateUser(u.id, { subscription: next });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      flash(`Подписка пользователя ${updated.email} изменена на "${next}"`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleRole = async (u: AdminUser) => {
    const next = u.role === "admin" ? "user" : "admin";
    if (!confirm(`Изменить роль ${u.email} на "${next}"?`)) return;
    try {
      const updated = await admin.updateUser(u.id, { role: next });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      flash(`Роль пользователя ${updated.email} изменена на "${next}"`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetLimits = async (u: AdminUser) => {
    if (!confirm(`Сбросить лимиты пользователя ${u.email}?`)) return;
    try {
      await admin.resetUserLimits(u.id);
      await loadUsers(search, offset);
      flash(`Лимиты пользователя ${u.email} сброшены`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (u: AdminUser) => {
    if (!confirm(`Удалить пользователя ${u.email}? Это действие пометит аккаунт как удалённый.`)) return;
    try {
      await admin.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setTotal((prev) => prev - 1);
      flash(`Пользователь ${u.email} удалён`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <div style={adminStyles.tabs}>
          <a href="/admin" style={adminStyles.tab}>Настройки</a>
          <a href="/admin/characters" style={adminStyles.tab}>Персонажи</a>
          <a href="/admin/users" style={{ ...adminStyles.tab, ...adminStyles.tabActive }}>Пользователи</a>
          <a href="/admin/character-options" style={adminStyles.tab}>Опции персонажа</a>
          <a href="/admin/appearance-options" style={adminStyles.tab}>Appearance</a>
          <a href="/admin/pose-options" style={adminStyles.tab}>Pose</a>
          <a href="/admin/scene-options" style={adminStyles.tab}>Scene</a>
          <a href="/admin/camera-options" style={adminStyles.tab}>Camera</a>
        </div>

        {error && (
          <div style={{ ...pageStyles.alert, ...pageStyles.alertError, marginBottom: 16 }}>{error}</div>
        )}
        {actionMsg && (
          <div style={{ ...pageStyles.alert, ...pageStyles.alertSuccess, marginBottom: 16 }}>{actionMsg}</div>
        )}

        <div style={adminStyles.card}>
          <div style={adminStyles.headerRow}>
            <h2 style={{ ...adminStyles.title, display: "flex", alignItems: "center", gap: 10 }}>
              Пользователи
              <span style={pageStyles.badge}>{total}</span>
            </h2>
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по email или имени..."
                style={pageStyles.searchInput}
              />
              <button type="submit" style={adminStyles.button}>Найти</button>
            </form>
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : users.length === 0 ? (
            <p style={{ color: "#888", padding: "20px 0" }}>Пользователи не найдены.</p>
          ) : (
            <div style={pageStyles.tableWrapper}>
              <table style={pageStyles.table}>
                <thead>
                  <tr>
                    <th style={pageStyles.th}>Email / Ник</th>
                    <th style={pageStyles.th}>Подписка</th>
                    <th style={pageStyles.th}>Роль</th>
                    <th style={pageStyles.th}>Лимиты</th>
                    <th style={pageStyles.th}>Дата регистрации</th>
                    <th style={pageStyles.th}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const msgCounter = u.usageCounters?.find((c) => c.action === "chat_message");
                    return (
                      <tr key={u.id} style={pageStyles.tr}>
                        <td style={pageStyles.td}>
                          <div style={pageStyles.userEmail}>{u.email}</div>
                          {u.nickname && (
                            <div style={pageStyles.userNick}>{u.nickname}</div>
                          )}
                          {u.isDemo && <span style={pageStyles.demoTag}>demo</span>}
                        </td>
                        <td style={pageStyles.td}>
                          <span
                            style={
                              u.subscription === "paid"
                                ? pageStyles.badgePaid
                                : pageStyles.badgeFree
                            }
                          >
                            {u.subscription === "paid" ? "Premium" : "Free"}
                          </span>
                        </td>
                        <td style={pageStyles.td}>
                          <span
                            style={
                              u.role === "admin" ? pageStyles.badgeAdmin : pageStyles.badgeUser
                            }
                          >
                            {u.role}
                          </span>
                        </td>
                        <td style={pageStyles.td}>
                          {msgCounter ? (
                            <span style={pageStyles.limitText}>
                              {msgCounter.count} / 20 сообщ.
                            </span>
                          ) : (
                            <span style={{ color: "#555", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={pageStyles.td}>
                          <span style={pageStyles.dateText}>
                            {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                          </span>
                        </td>
                        <td style={pageStyles.td}>
                          <div style={pageStyles.actions}>
                            <button
                              onClick={() => handleToggleSubscription(u)}
                              style={
                                u.subscription === "paid"
                                  ? { ...pageStyles.btn, ...pageStyles.btnDanger }
                                  : { ...pageStyles.btn, ...pageStyles.btnSuccess }
                              }
                              title={
                                u.subscription === "paid"
                                  ? "Убрать премиум"
                                  : "Включить премиум"
                              }
                            >
                              {u.subscription === "paid" ? "Убрать Premium" : "Дать Premium"}
                            </button>
                            <button
                              onClick={() => handleResetLimits(u)}
                              style={{ ...pageStyles.btn, ...pageStyles.btnSecondary }}
                              title="Сбросить лимиты"
                            >
                              Сбросить лимиты
                            </button>
                            <button
                              onClick={() => handleToggleRole(u)}
                              style={{ ...pageStyles.btn, ...pageStyles.btnGhost }}
                              title={u.role === "admin" ? "Снять права администратора" : "Дать права администратора"}
                            >
                              {u.role === "admin" ? "→ user" : "→ admin"}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              style={{ ...pageStyles.btn, ...pageStyles.btnDanger }}
                              title="Удалить пользователя"
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div style={pageStyles.pagination}>
              <button
                disabled={currentPage === 1}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                style={pageStyles.pageBtn}
              >
                ← Назад
              </button>
              <span style={pageStyles.pageInfo}>
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(offset + LIMIT)}
                style={pageStyles.pageBtn}
              >
                Вперёд →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
