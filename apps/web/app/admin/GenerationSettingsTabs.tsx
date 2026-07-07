"use client";

import React, { useState } from "react";
import { admin } from "../../lib/api";

export type GenSettingsTab = "character" | "appearance" | "pose" | "scene" | "camera";

const TABS: { id: GenSettingsTab; label: string; href: string }[] = [
  { id: "character", label: "Опции персонажа", href: "/admin/character-options" },
  { id: "appearance", label: "Appearance", href: "/admin/appearance-options" },
  { id: "pose", label: "Pose", href: "/admin/pose-options" },
  { id: "scene", label: "Scene", href: "/admin/scene-options" },
  { id: "camera", label: "Camera", href: "/admin/camera-options" },
];

const styles: Record<string, React.CSSProperties> = {
  bar: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24, alignItems: "center" },
  exportBtn: {
    marginLeft: "auto",
    padding: "6px 16px",
    borderRadius: 6,
    border: "1px solid #313131",
    background: "#1e1e1e",
    color: "#fff",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Syne', sans-serif",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  tab: {
    padding: "6px 16px",
    borderRadius: 6,
    border: "1px solid #313131",
    background: "transparent",
    color: "#848484",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "none",
    fontFamily: "'Syne', sans-serif",
  },
  tabActive: {
    background: "#f95bad",
    border: "1px solid #f95bad",
    color: "#fff",
  },
};

/**
 * Под-навигатор раздела «Настройки генераций».
 * Переключает пять страниц опций генерации.
 */
export function GenerationSettingsTabs({ active }: { active: GenSettingsTab }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await admin.exportGenerationOptions();
    } catch (err) {
      alert("Не удалось выгрузить CSV: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={styles.bar}>
      {TABS.map((t) => (
        <a key={t.id} href={t.href} style={t.id === active ? { ...styles.tab, ...styles.tabActive } : styles.tab}>
          {t.label}
        </a>
      ))}
      <button type="button" onClick={handleExport} disabled={exporting} style={styles.exportBtn}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? "Экспорт..." : "Экспорт CSV"}
      </button>
    </div>
  );
}
