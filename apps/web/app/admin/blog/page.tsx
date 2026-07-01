"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../context/auth";
import { admin, resizedMediaUrl, type BlogPost } from "../../../lib/api";
import { adminStyles } from "../admin-styles";
import { AdminTabs } from "../AdminTabs";

const s: Record<string, React.CSSProperties> = {
  item: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "16px 0",
    borderBottom: "1px solid #313131",
  },
  cover: { width: 64, height: 44, borderRadius: 6, objectFit: "cover" as const, background: "#1e1e1e", flexShrink: 0, marginRight: 14 },
  coverPlaceholder: { width: 64, height: 44, borderRadius: 6, background: "#1e1e1e", flexShrink: 0, marginRight: 14 },
  info: { flex: 1, minWidth: 0 },
  title: { color: "#fff", fontSize: 14, fontWeight: "bold" as const, marginBottom: 6 },
  meta: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 6 },
  tags: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  tag: { background: "rgba(249,91,173,0.2)", color: "#f95bad", padding: "2px 10px", borderRadius: 12, fontSize: 11 },
  badgePub: { background: "rgba(193,240,170,0.15)", color: "#c1f0aa", padding: "2px 10px", borderRadius: 12, fontSize: 11 },
  badgeDraft: { background: "rgba(150,150,150,0.15)", color: "#969696", padding: "2px 10px", borderRadius: 12, fontSize: 11 },
  date: { color: "#848484", fontSize: 11 },
  actions: { display: "flex", gap: 8, marginLeft: 16, flexShrink: 0 },
};

export default function AdminBlogPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    admin.getBlogPosts().then(setPosts).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") load();
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

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить эту запись?")) return;
    try {
      await admin.deleteBlogPost(id);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.container}>
        <AdminTabs active="blog" />

        <div style={adminStyles.card}>
          <div style={adminStyles.headerRow}>
            <h2 style={adminStyles.title}>Записи блога</h2>
            <button onClick={() => router.push("/admin/blog/new")} style={adminStyles.button}>
              + Создать запись
            </button>
          </div>

          {error && <div style={adminStyles.error}>{error}</div>}

          {posts.length === 0 ? (
            <p style={{ color: "#848484" }}>Записей пока нет. Создайте первую.</p>
          ) : (
            <div>
              {posts.map((p) => {
                const cover = resizedMediaUrl(p.coverImageUrl, { w: 200 });
                return (
                  <div key={p.id} style={s.item}>
                    {cover ? (
                      <img src={cover} alt={p.title} style={s.cover} loading="lazy" decoding="async" />
                    ) : (
                      <div style={s.coverPlaceholder} />
                    )}
                    <div style={s.info}>
                      <div style={s.title}>{p.title}</div>
                      <div style={s.meta}>
                        <span style={p.isPublished ? s.badgePub : s.badgeDraft}>
                          {p.isPublished ? "Опубликовано" : "Черновик"}
                        </span>
                        <span style={s.date}>{new Date(p.createdAt).toLocaleDateString()}</span>
                        <span style={s.date}>/{p.slug}</span>
                      </div>
                      <div style={s.tags}>
                        {p.tags.map((t) => (
                          <span key={t} style={s.tag}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <div style={s.actions}>
                      <button onClick={() => router.push(`/admin/blog/${p.id}`)} style={adminStyles.btnSmall}>
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{ ...adminStyles.btnSmall, color: "#e36466" }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
