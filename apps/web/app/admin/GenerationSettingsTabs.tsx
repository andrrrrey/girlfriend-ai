"use client";

import React from "react";

export type GenSettingsTab = "character" | "appearance" | "pose" | "scene" | "camera";

const TABS: { id: GenSettingsTab; label: string; href: string }[] = [
  { id: "character", label: "Опции персонажа", href: "/admin/character-options" },
  { id: "appearance", label: "Appearance", href: "/admin/appearance-options" },
  { id: "pose", label: "Pose", href: "/admin/pose-options" },
  { id: "scene", label: "Scene", href: "/admin/scene-options" },
  { id: "camera", label: "Camera", href: "/admin/camera-options" },
];

const styles: Record<string, React.CSSProperties> = {
  bar: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24 },
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
  return (
    <div style={styles.bar}>
      {TABS.map((t) => (
        <a key={t.id} href={t.href} style={t.id === active ? { ...styles.tab, ...styles.tabActive } : styles.tab}>
          {t.label}
        </a>
      ))}
    </div>
  );
}
