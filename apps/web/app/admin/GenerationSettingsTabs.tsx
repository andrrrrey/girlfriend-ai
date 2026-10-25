"use client";

import React, { useCallback, useEffect, useState } from "react";
import { admin, type OptionSynonymsStatus } from "../../lib/api";

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
 * Автогенерация синонимов опций (как пользователь может назвать опцию в чате):
 * запуск в фоне на сервере и прогресс с опросом раз в 3 секунды.
 */
function SynonymsGenerator() {
  const [status, setStatus] = useState<OptionSynonymsStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    admin.getOptionSynonymsStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (status?.state !== "running") return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [status?.state, load]);

  const start = async (overwrite: boolean) => {
    if (overwrite && !confirm("Перегенерировать синонимы для ВСЕХ опций? Ручные правки будут заменены.")) return;
    setError("");
    try {
      setStatus(await admin.generateOptionSynonyms(overwrite));
    } catch (err: any) {
      setError(err?.body?.message || err.message);
    }
  };

  const running = status?.state === "running";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: -12, marginBottom: 20 }}>
      <button type="button" style={styles.exportBtn} disabled={running} onClick={() => start(false)}>
        {running ? "Генерация синонимов..." : "Сгенерировать синонимы"}
      </button>
      <button type="button" style={styles.tab} disabled={running} onClick={() => start(true)}>
        Перегенерировать все
      </button>
      {status && status.state !== "idle" && (
        <span style={{ color: status.state === "failed" ? "#e36466" : "#848484", fontSize: 12 }}>
          {status.state === "running" && `Обработано ${status.processed} из ${status.total}, обновлено ${status.updated}`}
          {status.state === "done" &&
            `Готово: обновлено ${status.updated} из ${status.total}${status.failedBatches ? `, ошибок пачек: ${status.failedBatches}` : ""}`}
          {status.state === "failed" && `Ошибка: ${status.error}`}
        </span>
      )}
      {error && <span style={{ color: "#e36466", fontSize: 12 }}>{error}</span>}
    </div>
  );
}

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
    <>
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
    <SynonymsGenerator />
    </>
  );
}
