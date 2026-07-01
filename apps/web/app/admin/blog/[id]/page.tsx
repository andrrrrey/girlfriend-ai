"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../context/auth";
import { admin, resizedMediaUrl, streamUrlForKey, type BlogPost } from "../../../../lib/api";
import { adminStyles } from "../../admin-styles";
import { AdminTabs } from "../../AdminTabs";
import BlogEditor from "../BlogEditor";

type Draft = Partial<BlogPost>;

export default function AdminBlogEditorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const isNew = id === "new";

  const [draft, setDraft] = useState<Draft | null>(isNew ? { title: "", content: "", tags: [], isPublished: false } : null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || user?.role !== "admin" || isNew || !id) return;
    admin.getBlogPost(id).then(setDraft).catch(() => setError("Запись не найдена"));
  }, [loading, user, id, isNew]);

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

  if (!draft) return <div style={adminStyles.page}><p style={{ color: "#aaa" }}>Загрузка записи...</p></div>;

  const handleCover = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const { fullKey } = await admin.uploadOptionImage(file);
      const url = streamUrlForKey(fullKey);
      setDraft((d) => ({ ...d, coverImageUrl: url }));
    } catch {
      setError("Не удалось загрузить обложку");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!draft.title?.trim() || !draft.content?.trim()) {
      setError("Заполните заголовок и текст записи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Partial<BlogPost> = {
        title: draft.title,
        content: draft.content,
        excerpt: draft.excerpt ?? "",
        coverImageUrl: draft.coverImageUrl ?? null,
        tags: draft.tags ?? [],
        isPublished: draft.isPublished ?? false,
      };
      if (isNew) {
        await admin.createBlogPost(payload);
      } else if (id) {
        await admin.updateBlogPost(id, payload);
      }
      router.push("/admin/blog");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const coverPreview = resizedMediaUrl(draft.coverImageUrl ?? null, { w: 480 });

  return (
    <div style={adminStyles.page}>
      <div style={adminStyles.container}>
        <AdminTabs active="blog" />

        <div style={adminStyles.card}>
          <h2 style={adminStyles.title}>{isNew ? "Новая запись" : "Редактирование записи"}</h2>
          {error && <div style={adminStyles.error}>{error}</div>}

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>Заголовок</label>
            <input
              value={draft.title || ""}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={adminStyles.input}
              placeholder="Заголовок записи"
            />
          </div>

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>Обложка</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {coverPreview ? (
                <img src={coverPreview} alt="cover" style={{ width: 160, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid #313131" }} />
              ) : (
                <div style={{ width: 160, height: 100, borderRadius: 8, background: "#1e1e1e", border: "1px solid #313131" }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="blog-cover" style={{ ...adminStyles.btnSecondary, cursor: "pointer" }}>
                  {uploading ? "Загрузка..." : coverPreview ? "Заменить обложку" : "Загрузить обложку"}
                </label>
                {coverPreview && (
                  <button type="button" onClick={() => setDraft({ ...draft, coverImageUrl: null })} style={{ ...adminStyles.btnSmall, color: "#e36466" }}>
                    Убрать
                  </button>
                )}
              </div>
              <input
                id="blog-cover"
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCover(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>Текст записи</label>
            <BlogEditor value={draft.content || ""} onChange={(html) => setDraft((d) => ({ ...d, content: html }))} />
          </div>

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>Теги (через запятую)</label>
            <input
              value={(draft.tags || []).join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                })
              }
              style={adminStyles.input}
              placeholder="новости, гайды"
            />
          </div>

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>Описание для SEO (excerpt)</label>
            <textarea
              value={draft.excerpt || ""}
              onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
              style={{ ...adminStyles.input, height: 70, resize: "vertical" as const }}
              placeholder="Короткое описание для поисковой выдачи. Если пусто — сгенерируется из текста."
            />
          </div>

          <div style={adminStyles.field}>
            <label style={adminStyles.label}>
              <input
                type="checkbox"
                checked={draft.isPublished === true}
                onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Опубликовано (видно в блоге и попадает в поисковую выдачу)
            </label>
          </div>

          <div style={adminStyles.btnRow}>
            <button onClick={handleSave} disabled={saving} style={adminStyles.button}>
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button onClick={() => router.push("/admin/blog")} style={adminStyles.btnSecondary}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
