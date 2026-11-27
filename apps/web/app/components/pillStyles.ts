import type React from "react";

/**
 * Общий вид «пилюль» выбора в модалках генерации (Character/Scene/Camera/
 * Appearance/PromptDetails). Активное состояние — розовая рамка и текст,
 * как у активного фильтра (FilterDropdown) и тегов (ScrollableTagsRow).
 */
export const pill: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a",
  color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
};

export const pillActive: React.CSSProperties = {
  border: "1px solid #f95bad", background: "rgba(249,91,173,0.12)", color: "#f95bad",
};
