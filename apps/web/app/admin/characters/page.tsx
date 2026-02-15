"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../context/auth";
import { admin, type Character } from "../../../lib/api";

export default function AdminCharactersPage() {
  const { user, loading } = useAuth();
  const [chars, setChars] = useState<Character[]>([]);
  const [editing, setEditing] = useState<Partial<Character> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadChars = () => {
    admin.getCharacters().then(setChars).catch(() => {});
  };

  useEffect(() => {
    if (!loading && user?.role === "admin") loadChars();
  }, [loading, user]);

  if (loading) return <div style={styles.page}><p style={{ color: "#aaa" }}>Loading...</p></div>;
  if (!user || user.role !== "admin") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Access Denied</h1>
          <p style={{ color: "#aaa" }}>Admin access required.</p>
          <a href="/" style={styles.link}>Back to Home</a>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editing?.name || !editing?.systemPrompt) return;
    setSaving(true);
    setError("");
    try {
      if (editing.id) {
        await admin.updateCharacter(editing.id, editing);
      } else {
        await admin.createCharacter(editing);
      }
      setEditing(null);
      loadChars();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this character?")) return;
    try {
      await admin.deleteCharacter(id);
      loadChars();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.nav}>
          <a href="/" style={styles.link}>Home</a>
          <span style={styles.navSep}>/</span>
          <span style={{ color: "#fff" }}>Admin</span>
        </div>

        <div style={styles.tabs}>
          <a href="/admin" style={styles.tab}>Settings</a>
          <a href="/admin/characters" style={{ ...styles.tab, ...styles.tabActive }}>Characters</a>
        </div>

        {editing ? (
          <div style={styles.card}>
            <h2 style={styles.title}>{editing.id ? "Edit Character" : "New Character"}</h2>
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.field}>
              <label style={styles.label}>Name</label>
              <input
                value={editing.name || ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                style={styles.input}
                placeholder="Character name"
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>System Prompt</label>
              <textarea
                value={editing.systemPrompt || ""}
                onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                style={{ ...styles.input, height: 150, resize: "vertical" as const }}
                placeholder="You are..."
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Tags (comma-separated)</label>
              <input
                value={(editing.tags || []).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                  })
                }
                style={styles.input}
                placeholder="romantic, caring"
              />
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Avatar URL</label>
                <input
                  value={editing.avatarUrl || ""}
                  onChange={(e) => setEditing({ ...editing, avatarUrl: e.target.value })}
                  style={styles.input}
                  placeholder="https://..."
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>Voice ID</label>
                <input
                  value={editing.voiceId || ""}
                  onChange={(e) => setEditing({ ...editing, voiceId: e.target.value })}
                  style={styles.input}
                  placeholder="nova"
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>
                <input
                  type="checkbox"
                  checked={editing.isPublic !== false}
                  onChange={(e) => setEditing({ ...editing, isPublic: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                Public (visible to all users)
              </label>
            </div>

            <div style={styles.btnRow}>
              <button onClick={handleSave} disabled={saving} style={styles.button}>
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditing(null)} style={styles.btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.card}>
            <div style={styles.headerRow}>
              <h2 style={styles.title}>Characters</h2>
              <button
                onClick={() => setEditing({ name: "", systemPrompt: "", tags: [], isPublic: true })}
                style={styles.button}
              >
                + New Character
              </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            {chars.length === 0 ? (
              <p style={{ color: "#888" }}>No characters yet. Create one to get started.</p>
            ) : (
              <div>
                {chars.map((c) => (
                  <div key={c.id} style={styles.charItem}>
                    <div style={styles.charInfo}>
                      <div style={styles.charName}>{c.name}</div>
                      <div style={styles.charTags}>
                        {c.tags.map((t) => (
                          <span key={t} style={styles.tag}>{t}</span>
                        ))}
                      </div>
                      <div style={styles.charPrompt}>
                        {c.systemPrompt.slice(0, 120)}
                        {c.systemPrompt.length > 120 ? "..." : ""}
                      </div>
                    </div>
                    <div style={styles.charActions}>
                      <button onClick={() => setEditing(c)} style={styles.btnSmall}>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{ ...styles.btnSmall, color: "#ff7675" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
  container: { maxWidth: 800, margin: "0 auto" },
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
  title: { color: "#fff", fontSize: 22, margin: "0 0 15px" },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  field: { marginBottom: 18 },
  row: { display: "flex", gap: 16, marginBottom: 18 },
  label: { display: "block", color: "#a0a0a0", fontSize: 12, marginBottom: 6 },
  input: {
    width: "100%",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid #3d2b55",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#fff",
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  button: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: "bold" as const,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "10px 20px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
  },
  btnRow: { display: "flex", gap: 12, marginTop: 10 },
  btnSmall: {
    background: "transparent",
    border: "1px solid #3d2b55",
    color: "#aaa",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  charItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "16px 0",
    borderBottom: "1px solid #1e1430",
  },
  charInfo: { flex: 1 },
  charName: { color: "#fff", fontSize: 16, fontWeight: "bold" as const, marginBottom: 6 },
  charTags: { display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 6 },
  tag: {
    background: "rgba(108,92,231,0.2)",
    color: "#a29bfe",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 11,
  },
  charPrompt: { color: "#888", fontSize: 12, lineHeight: 1.4 },
  charActions: { display: "flex", gap: 8, marginLeft: 16 },
  error: {
    background: "rgba(255,118,117,0.15)",
    border: "1px solid #ff7675",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#ff7675",
    fontSize: 13,
    marginBottom: 15,
  },
};
