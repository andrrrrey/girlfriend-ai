"use client";

/**
 * @file apps/web/context/contentMode.tsx
 * @description Глобальный режим контента (NSFW / SFW) для веб-приложения.
 *
 * Предоставляет `{ mode, setMode, isSfw, canToggle }` через React Context:
 * - `mode` — текущий режим ("nsfw" | "sfw"). Для гостей по умолчанию "nsfw".
 * - `setMode` — переключение: обновляет state, пишет в localStorage и
 *   (если пользователь залогинен) синхронизирует с бэкендом через
 *   PATCH /users/me { contentMode }.
 * - `isSfw` — удобный флаг `mode === "sfw"`.
 * - `canToggle` — false для несовершеннолетних (isAdult === false): режим
 *   форсится в "sfw" и переключатель блокируется.
 *
 * Режим передаётся на сервер:
 * - в запросах фидов (query-параметр `mode`) — фильтрация NSFW-контента;
 * - в запросах генерации — выбор SFW/NSFW-промптов.
 *
 * Начальное чтение localStorage отложено до mount-эффекта (SSR не имеет
 * localStorage). Когда загружается профиль, режим адаптируется под пользователя.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth";
import { users } from "../lib/api";

export type ContentMode = "nsfw" | "sfw";

interface ContentModeContextValue {
  mode: ContentMode;
  setMode: (mode: ContentMode) => void;
  isSfw: boolean;
  /** false для несовершеннолетних — переключатель заблокирован на SFW. */
  canToggle: boolean;
}

const ContentModeContext = createContext<ContentModeContextValue | null>(null);

const LS_KEY = "contentMode";

function isMode(v: unknown): v is ContentMode {
  return v === "nsfw" || v === "sfw";
}

/** Дублируем режим в cookie, чтобы SSR-страницы (каталог /characters) его читали. */
function writeModeCookie(mode: ContentMode) {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `contentMode=${mode}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

export function ContentModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [mode, setModeState] = useState<ContentMode>("nsfw");

  const isAdult = user ? user.isAdult !== false : true;
  const canToggle = isAdult;

  // Отложенное чтение localStorage после гидрации.
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (isMode(stored)) { setModeState(stored); writeModeCookie(stored); }
  }, []);

  // Адаптация под профиль: несовершеннолетним форсим SFW, иначе берём
  // сохранённый в профиле режим.
  useEffect(() => {
    if (!user) return;
    if (user.isAdult === false) {
      setModeState("sfw");
      try { localStorage.setItem(LS_KEY, "sfw"); } catch {}
      writeModeCookie("sfw");
      return;
    }
    if (isMode(user.contentMode)) {
      setModeState(user.contentMode);
      try { localStorage.setItem(LS_KEY, user.contentMode); } catch {}
      writeModeCookie(user.contentMode);
    }
  }, [user]);

  const setMode = useCallback(
    (next: ContentMode) => {
      // Несовершеннолетним нельзя включать NSFW.
      if (next === "nsfw" && !canToggle) return;
      setModeState(next);
      try { localStorage.setItem(LS_KEY, next); } catch {}
      writeModeCookie(next);
      // Синхронизация с бэкендом (fire-and-forget) для залогиненных.
      try {
        if (localStorage.getItem("accessToken")) {
          users.updateProfile({ contentMode: next }).catch(() => {});
        }
      } catch {}
      // Обновляем серверные компоненты (SSR-каталог /characters), чтобы контент
      // на открытой странице сразу соответствовал выбранному режиму.
      try { router.refresh(); } catch {}
    },
    [canToggle, router],
  );

  return (
    <ContentModeContext.Provider value={{ mode, setMode, isSfw: mode === "sfw", canToggle }}>
      {children}
    </ContentModeContext.Provider>
  );
}

export function useContentMode() {
  const ctx = useContext(ContentModeContext);
  if (!ctx) {
    throw new Error("useContentMode must be used within a ContentModeProvider");
  }
  return ctx;
}
