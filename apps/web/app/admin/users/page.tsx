"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type AdminUser } from "../../../lib/api";

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

  if (loading) return <div style={styles.page}><p style={{ color: "#aaa" }}>Загрузка...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Доступ запрещён</h1>
          <p style={{ color: "#aaa" }}>Требуются права администратора.</p>
          <a href="/" style={styles.link}>На главную</a>
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
      // Reload to show updated counters
      await loadUsers(search, offset);
      flash(`Лимиты пользователя ${u.email} сброшены`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.nav}>
          <a href="/" style={styles.link}>Главная</a>
          <span style={styles.navSep}>/</span>
          <span style={{ color: "#fff" }}>Админ</span>
        </div>

        <div style={styles.tabs}>
          <a href="/admin" style={styles.tab}>Настройки</a>
          <a href="/admin/characters" style={styles.tab}>Персонажи</a>
          <a href="/admin/users" style={{ ...styles.tab, ...styles.tabActive }}>Пользователи</a>
        </div>

        {error && (
          <div style={{ ...styles.alert, ...styles.alertError, marginBottom: 16 }}>{error}</div>
        )}
        {actionMsg && (
          <div style={{ ...styles.alert, ...styles.alertSuccess, marginBottom: 16 }}>{actionMsg}</div>
        )}

        <div style={styles.card}>
          <div style={styles.headerRow}>
            <h2 style={styles.title}>
              Пользователи
              <span style={styles.badge}>{total}</span>
            </h2>
            <form onSubmit={handleSearch} style={styles.searchForm}>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск по email или имени..."
                style={styles.searchInput}
              />
              <button type="submit" style={styles.btnSearch}>Найти</button>
            </form>
          </div>

          {fetching ? (
            <p style={{ color: "#aaa", padding: "20px 0" }}>Загрузка...</p>
          ) : users.length === 0 ? (
            <p style={{ color: "#888", padding: "20px 0" }}>Пользователи не найдены.</p>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Email / Ник</th>
                    <th style={styles.th}>Подписка</th>
                    <th style={styles.th}>Роль</th>
                    <th style={styles.th}>Лимиты</th>
                    <th style={styles.th}>Дата регистрации</th>
                    <th style={styles.th}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const msgCounter = u.usageCounters?.find((c) => c.action === "chat_message");
                    return (
                      <tr key={u.id} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={styles.userEmail}>{u.email}</div>
                          {u.nickname && (
                            <div style={styles.userNick}>{u.nickname}</div>
                          )}
                          {u.isDemo && <span style={styles.demoTag}>demo</span>}
                        </td>
                        <td style={styles.td}>
                          <span
                            style={
                              u.subscription === "paid"
                                ? styles.badgePaid
                                : styles.badgeFree
                            }
                          >
                            {u.subscription === "paid" ? "Premium" : "Free"}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span
                            style={
                              u.role === "admin" ? styles.badgeAdmin : styles.badgeUser
                            }
                          >
                            {u.role}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {msgCounter ? (
                            <span style={styles.limitText}>
                              {msgCounter.count} / 20 сообщ.
                            </span>
                          ) : (
                            <span style={{ color: "#555", fontSize: 12 }}>—</span>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.dateText}>
                            {new Date(u.createdAt).toLocaleDateString("ru-RU")}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.actions}>
                            <button
                              onClick={() => handleToggleSubscription(u)}
                              style={
                                u.subscription === "paid"
                                  ? { ...styles.btn, ...styles.btnDanger }
                                  : { ...styles.btn, ...styles.btnSuccess }
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
                              style={{ ...styles.btn, ...styles.btnSecondary }}
                              title="Сбросить лимиты"
                            >
                              Сбросить лимиты
                            </button>
                            <button
                              onClick={() => handleToggleRole(u)}
                              style={{ ...styles.btn, ...styles.btnGhost }}
                              title={u.role === "admin" ? "Снять права администратора" : "Дать права администратора"}
                            >
                              {u.role === "admin" ? "→ user" : "→ admin"}
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
            <div style={styles.pagination}>
              <button
                disabled={currentPage === 1}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                style={styles.pageBtn}
              >
                ← Назад
              </button>
              <span style={styles.pageInfo}>
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(offset + LIMIT)}
                style={styles.pageBtn}
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0512",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: 20,
  },
  container: { maxWidth: 1100, margin: "0 auto" },
  nav: { marginBottom: 20, display: "flex", alignItems: "center", gap: 8 },
  navSep: { color: "#555" },
  link: { color: "#6c5ce7", textDecoration: "none", fontSize: 14 },
  tabs: { display: "flex", gap: 0, marginBottom: 20 },
  tab: {
    padding: "10px 24px",
    color: "#aaa",
    textDecoration: "none",
    fontSize: 14,
    borderBottom: "2px solid transparent",
  },
  tabActive: { color: "#fff", borderBottom: "2px solid #6c5ce7" },
  card: {
    background: "#120a1d",
    border: "1px solid #3d2b55",
    borderRadius: 16,
    padding: "30px 30px",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap" as const,
    gap: 12,
  },
  title: { color: "#fff", fontSize: 22, margin: 0, display: "flex", alignItems: "center", gap: 10 },
  badge: {
    background: "rgba(108,92,231,0.25)",
    color: "#a29bfe",
    fontSize: 13,
    padding: "2px 10px",
    borderRadius: 12,
    fontWeight: "normal" as const,
  },
  searchForm: { display: "flex", gap: 8 },
  searchInput: {
    background: "rgba(0,0,0,0.3)",
    border: "1px solid #3d2b55",
    borderRadius: 8,
    padding: "8px 14px",
    color: "#fff",
    fontSize: 13,
    outline: "none",
    width: 240,
  },
  btnSearch: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "8px 18px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
  },
  tableWrapper: { overflowX: "auto" as const },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  },
  th: {
    color: "#888",
    fontWeight: "600" as const,
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: "1px solid #1e1430",
    whiteSpace: "nowrap" as const,
  },
  tr: { borderBottom: "1px solid #160e26" },
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
    background: "rgba(0,184,148,0.15)",
    color: "#00b894",
    padding: "3px 12px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  badgeFree: {
    background: "rgba(108,92,231,0.12)",
    color: "#a29bfe",
    padding: "3px 12px",
    borderRadius: 12,
    fontSize: 12,
  },
  badgeAdmin: {
    background: "rgba(253,121,168,0.15)",
    color: "#fd79a8",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  badgeUser: {
    background: "rgba(255,255,255,0.06)",
    color: "#aaa",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 12,
  },
  limitText: { color: "#fdcb6e", fontSize: 12 },
  dateText: { color: "#666", fontSize: 12 },
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
    background: "rgba(0,184,148,0.2)",
    color: "#00b894",
  },
  btnDanger: {
    background: "rgba(255,118,117,0.15)",
    color: "#ff7675",
  },
  btnSecondary: {
    background: "rgba(253,203,110,0.12)",
    color: "#fdcb6e",
  },
  btnGhost: {
    background: "rgba(255,255,255,0.05)",
    color: "#888",
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
    border: "1px solid #3d2b55",
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
    background: "rgba(255,118,117,0.15)",
    border: "1px solid #ff7675",
    color: "#ff7675",
  },
  alertSuccess: {
    background: "rgba(0,206,201,0.15)",
    border: "1px solid #00cec9",
    color: "#00cec9",
  },
};
