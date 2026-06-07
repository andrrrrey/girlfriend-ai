"use client";

/**
 * @file apps/web/context/language.tsx
 * @description Lightweight i18n context for the web app (English / Russian).
 *
 * Provides `{ lang, setLang, t }` via React Context:
 * - `lang` — current UI language ("en" | "ru"), defaults to "en" for guests.
 * - `setLang` — change language: updates state, persists to localStorage,
 *   updates <html lang>, and (if logged in) syncs to the backend via
 *   PATCH /users/me { lang }.
 * - `t(key, vars?)` — translate a key from the current dictionary, falling back
 *   to English then to the raw key. Supports simple {name} interpolation.
 *
 * The initial localStorage read is deferred to a mount effect to avoid SSR /
 * client hydration mismatch (the server has no localStorage). When the auth
 * profile loads, the user's saved `lang` is adopted.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./auth";
import { users } from "../lib/api";
import { dictionaries, type Lang, type TKey } from "../lib/i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const LS_KEY = "lang";

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ru";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = useState<Lang>("en");

  // Defer localStorage read until after hydration.
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (isLang(stored)) {
      setLangState(stored);
      document.documentElement.lang = stored;
    }
  }, []);

  // Adopt the language saved on the user's profile once it loads.
  useEffect(() => {
    if (isLang(user?.lang)) {
      setLangState(user.lang);
      try { localStorage.setItem(LS_KEY, user.lang); } catch {}
      document.documentElement.lang = user.lang;
    }
  }, [user?.lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(LS_KEY, next); } catch {}
    if (typeof document !== "undefined") document.documentElement.lang = next;
    // Persist to backend if logged in (fire-and-forget).
    try {
      if (localStorage.getItem("accessToken")) {
        users.updateProfile({ lang: next }).catch(() => {});
      }
    } catch {}
  }, []);

  const t = useCallback(
    (key: TKey, vars?: Record<string, string | number>) => {
      const dict = dictionaries[lang] as Record<string, string>;
      const fallback = dictionaries.en as Record<string, string>;
      let str = dict[key] ?? fallback[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useT must be used within a LanguageProvider");
  }
  return ctx;
}
