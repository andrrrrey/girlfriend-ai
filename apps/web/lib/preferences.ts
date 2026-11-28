import { useEffect, useRef } from "react";
import { useAuth } from "../context/auth";
import { CHARACTER_STYLES } from "./styles";

/** Предпочтения пользователя из профиля (User.preferences). */
export interface UserPreferences {
  /** Стиль персонажа в нижнем регистре: realistic | semi-real | anime | 2d */
  style?: string;
  ageRange?: AgeRange;
  /** Теги персонажей (как в GET /characters/tags). */
  tags?: string[];
}

export const AGE_RANGES = ["18-25", "26-35", "36-45", "46+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/** Значение стиля для фильтров (как в CHARACTER_STYLES) по сохранённому в предпочтениях. */
export function styleFilterValue(pref?: string): string {
  if (!pref) return "";
  return CHARACTER_STYLES.find((s) => s.value.toLowerCase() === pref.toLowerCase())?.value ?? "";
}

/**
 * Один раз применяет предпочтения профиля как фильтры по умолчанию, когда
 * профиль загрузился. Дальше пользователь меняет фильтры на странице свободно
 * (профиль при этом не меняется).
 */
export function useApplyPreferences(apply: (prefs: UserPreferences) => void) {
  const { user } = useAuth();
  const appliedFor = useRef<string | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!user || appliedFor.current === user.id) return;
    appliedFor.current = user.id;
    const prefs = (user.preferences ?? {}) as UserPreferences;
    if (prefs.style || prefs.ageRange || prefs.tags?.length) applyRef.current(prefs);
  }, [user]);
}
