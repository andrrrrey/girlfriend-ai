"use client";

import React, { useState } from "react";
import { clearOptionCache } from "../../lib/options-cache";

/**
 * Код варианта из пака картинок и переключатель «показывать на сайте».
 * Скрытые варианты (active = false) не отдаются публичным API опций,
 * но остаются в БД и в админке.
 */
export function OptionActiveToggle({
  active,
  code,
  onToggle,
}: {
  active?: boolean;
  code?: string | null;
  onToggle: (next: boolean) => Promise<unknown>;
}) {
  const [value, setValue] = useState(active !== false);
  const [busy, setBusy] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await onToggle(!value);
      setValue(!value);
      clearOptionCache();
    } catch {
      // оставляем прежнее значение
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {code && (
        <span style={{ background: "#2a2a2a", color: "#9ad", fontSize: 11, padding: "2px 8px", borderRadius: 4, fontFamily: "monospace" }}>
          {code}
        </span>
      )}
      <button
        onClick={toggle}
        disabled={busy}
        title={value ? "Показывается на сайте — нажмите, чтобы скрыть" : "Скрыт на сайте — нажмите, чтобы показать"}
        style={{
          background: value ? "#1f3a2a" : "#3a1f1f",
          color: value ? "#6fdc8c" : "#e36466",
          border: "none",
          borderRadius: 4,
          fontSize: 11,
          padding: "4px 8px",
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {value ? "Активен" : "Скрыт"}
      </button>
    </>
  );
}
