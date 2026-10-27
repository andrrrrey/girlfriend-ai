"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../context/auth";
import { admin, type MediaCacheAsset, type MediaCacheStats } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const PERIODS = [1, 7, 30, 90];
const VIA_LABELS: { key: keyof MediaCacheStats["deliveries"]; label: string }[] = [
  { key: "generated", label: "Сгенерировано" },
  { key: "cache", label: "Из кэша" },
  { key: "coalesced", label: "Дождались чужой генерации" },
  { key: "total", label: "Всего выдач" },
];

/**
 * Админка общего кэша медиа: сколько фото/видео чата выдано без обращения
 * к провайдеру и пул вариантов с блокировкой (заблокированный вариант
 * больше не выдаётся из кэша).
 */
export default function AdminMediaCachePage() {
  const { user, loading } = useAuth();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<MediaCacheStats | null>(null);
  const [assets, setAssets] = useState<MediaCacheAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"" | "ok" | "blocked">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        admin.getMediaCacheStats(days),
        admin.getMediaCacheAssets({ page, moderation: filter || undefined }),
      ]);
      setStats(s);
      setAssets(a.items);
      setTotal(a.total);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  }, [days, page, filter]);

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
  }, [loading, user, load]);

  const toggle = async (asset: MediaCacheAsset) => {
    const next = asset.moderation === "blocked" ? "ok" : "blocked";
    try {
      await admin.setMediaCacheModeration(asset.id, next);
      setAssets((list) => list.map((a) => (a.id === asset.id ? { ...a, moderation: next } : a)));
    } catch (err: any) {
      setError(err.message);
    }
  };

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

  const pages = Math.max(1, Math.ceil(total / 40));

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.containerWide}>
        <AdminTabs active="media-cache" />

        {error && <div style={{ ...adminStyles.card, ...adminStyles.error, marginBottom: 20 }}>{error}</div>}

        <div style={{ ...adminStyles.card, marginBottom: 20 }}>
          <h2 style={adminStyles.title}>Общий кэш фото и видео</h2>
          <p style={adminStyles.subtitle}>
            Одинаковые запросы фото/видео в чате (сайт и Telegram) получают готовый вариант, который пользователь
            ещё не видел, или ждут уже идущую генерацию. Цена для пользователя — полная.
          </p>
          <div style={{ ...adminStyles.btnRow, marginBottom: 16 }}>
            {PERIODS.map((d) => (
              <button
                key={d}
                style={d === days ? adminStyles.btnSmall : { ...adminStyles.btnSmall, opacity: 0.5 }}
                onClick={() => setDays(d)}
              >
                {d === 1 ? "сутки" : `${d} дн.`}
              </button>
            ))}
          </div>
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
              {VIA_LABELS.map((v) => (
                <Stat key={v.key} label={v.label} value={stats.deliveries[v.key]} />
              ))}
              <Stat label="Доля без генерации" value={`${Math.round(stats.hitRate * 100)}%`} />
              <Stat label="Сэкономлено генераций" value={stats.savedGenerations} />
              <Stat label="Вариантов в пуле" value={stats.assets} />
              <Stat label="Заблокировано" value={stats.blocked} />
              <Stat label="Генерируется сейчас" value={stats.pendingGenerations} />
            </div>
          )}
        </div>

        <div style={adminStyles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={adminStyles.title}>Варианты ({total})</h2>
            <select
              style={{ ...adminStyles.input, width: 180 }}
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as "" | "ok" | "blocked");
                setPage(1);
              }}
            >
              <option value="">Все</option>
              <option value="ok">Выдаются</option>
              <option value="blocked">Заблокированы</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
            {assets.map((a) => (
              <div key={a.id} style={{ border: "1px solid #333", borderRadius: 8, overflow: "hidden", opacity: a.moderation === "blocked" ? 0.5 : 1 }}>
                {a.kind === "video" ? (
                  <video src={a.url} style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", display: "block" }} muted controls />
                ) : (
                  <img src={a.url} alt="" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", display: "block" }} />
                )}
                <div style={{ padding: 8, fontSize: 11, color: "#aaa" }}>
                  <div title={a.prompt ?? ""} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.prompt || "—"}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {a.scope === "PUBLIC" ? "общий" : "владельца"} · выдач: {a.deliveries}
                  </div>
                  <button style={{ ...adminStyles.btnSmall, marginTop: 6, width: "100%" }} onClick={() => toggle(a)}>
                    {a.moderation === "blocked" ? "Разблокировать" : "Заблокировать"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {assets.length === 0 && <p style={{ color: "#888", fontSize: 12 }}>Пока пусто.</p>}
          {pages > 1 && (
            <div style={{ ...adminStyles.btnRow, justifyContent: "center", marginTop: 16 }}>
              <button style={adminStyles.btnSecondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
              <span style={{ color: "#aaa", fontSize: 12, alignSelf: "center" }}>{page} / {pages}</span>
              <button style={adminStyles.btnSecondary} disabled={page >= pages} onClick={() => setPage(page + 1)}>Вперёд</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}>
      <div style={{ color: "#969696", fontSize: 10 }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
