"use client";

import React from "react";
import { adminStyles } from "./admin-styles";

export type AdminTab =
  | "settings"
  | "characters"
  | "users"
  | "reports"
  | "gen-settings"
  | "generations"
  | "costs"
  | "blog"
  | "voices"
  | "autogen";

const TABS: { id: AdminTab; label: string; href: string }[] = [
  { id: "settings", label: "Настройки", href: "/admin" },
  { id: "characters", label: "Персонажи", href: "/admin/characters" },
  { id: "autogen", label: "Автогенерация", href: "/admin/autogen" },
  { id: "users", label: "Пользователи", href: "/admin/users" },
  { id: "reports", label: "Жалобы", href: "/admin/reports" },
  { id: "gen-settings", label: "Настройки генераций", href: "/admin/character-options" },
  { id: "generations", label: "Генерации", href: "/admin/generations" },
  { id: "costs", label: "Расходы", href: "/admin/costs" },
  { id: "blog", label: "Записи блога", href: "/admin/blog" },
  { id: "voices", label: "Голоса", href: "/admin/voices" },
];

/**
 * Общий верхний навигатор админ-панели.
 * `active` подсвечивает текущий раздел. Для пяти страниц опций генерации
 * (character/appearance/pose/scene/camera) используется active="gen-settings".
 */
export function AdminTabs({ active }: { active: AdminTab }) {
  return (
    <div style={adminStyles.tabs}>
      {TABS.map((t) => (
        <a
          key={t.id}
          href={t.href}
          style={t.id === active ? { ...adminStyles.tab, ...adminStyles.tabActive } : adminStyles.tab}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
