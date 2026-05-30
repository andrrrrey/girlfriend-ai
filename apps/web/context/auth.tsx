"use client";

/**
 * @file apps/web/context/auth.tsx
 * @description React-контекст аутентификации для Next.js приложения.
 *
 * Предоставляет глобальное состояние авторизации через Context API:
 * - Текущий профиль пользователя (или null если не авторизован)
 * - Флаг загрузки (loading: true пока не проверена авторизация)
 * - Методы login, register, logout, refreshProfile
 *
 * Жизненный цикл:
 * 1. AuthProvider монтируется в корне приложения
 * 2. useEffect проверяет наличие токенов через auth.isAuthenticated()
 * 3. Если токены есть — загружает профиль через GET /users/me
 * 4. loading: false устанавливается после первой проверки (успех или нет)
 *
 * Использование:
 * - Оборачиваете приложение в <AuthProvider>
 * - В компонентах вызываете хук useAuth()
 * - useAuth() бросает ошибку если вызван вне AuthProvider
 *
 * Токены:
 * - Хранятся в localStorage (через lib/api.ts saveTokens/clearTokens)
 * - Refresh Token Rotation происходит прозрачно в apiFetch при 401
 *
 * @example
 * // В _app.tsx или layout.tsx:
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 *
 * // В компоненте:
 * const { user, loading, login, logout } = useAuth();
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { auth as authApi, users, type UserProfile } from "../lib/api";
import { usePrefetchAllOptions } from "../lib/use-prefetch-all-options";

/**
 * Значение контекста аутентификации.
 * Передаётся всем потомкам через AuthProvider.
 */
interface AuthContextValue {
  /** Профиль текущего пользователя. null если не авторизован. */
  user: UserProfile | null;
  /** true пока идёт начальная проверка авторизации (первый mount). */
  loading: boolean;
  /**
   * Выполняет вход: вызывает POST /auth/login, сохраняет токены,
   * затем загружает профиль через GET /users/me.
   */
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  /**
   * Регистрирует нового пользователя: POST /auth/register,
   * сохраняет токены, загружает профиль.
   */
  register: (email: string, password: string, turnstileToken?: string) => Promise<{ message: string }>;
  /**
   * Выполняет выход: инвалидирует refresh token на сервере,
   * очищает localStorage, устанавливает user = null.
   */
  logout: () => Promise<void>;
  /**
   * Перезагружает профиль пользователя из API.
   * Вызывается после обновления профиля (смена ника, аватара и т.д.).
   */
  refreshProfile: () => Promise<void>;
}

/** React Context с начальным значением null (проверяется в useAuth). */
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Провайдер аутентификации.
 *
 * Оборачивает приложение и делает AuthContext доступным для всех потомков.
 * При монтировании проверяет localStorage и загружает профиль если есть токены.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /** Профиль пользователя или null */
  const [user, setUser] = useState<UserProfile | null>(null);
  /** Флаг начальной загрузки (true до первой проверки авторизации) */
  const [loading, setLoading] = useState(true);

  /**
   * Загружает/обновляет профиль из API.
   * При ошибке (истёкший токен, 401) устанавливает user = null.
   * useCallback для стабильной ссылки (используется в useEffect deps).
   */
  const refreshProfile = useCallback(async () => {
    try {
      const profile = await users.getProfile();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  /**
   * Эффект инициализации: проверяет авторизацию при монтировании.
   * - Если accessToken в localStorage есть → загружает профиль
   * - Если нет → сразу снимает loading
   * finally(() => setLoading(false)) гарантирует снятие loading в любом случае.
   */
  useEffect(() => {
    if (authApi.isAuthenticated()) {
      refreshProfile().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshProfile]);

  /**
   * Вход в систему.
   * Сохраняет токены в localStorage (через authApi.login),
   * затем загружает профиль (чтобы получить роль, подписку и т.д.).
   */
  const login = async (email: string, password: string, turnstileToken?: string) => {
    await authApi.login(email, password, turnstileToken);
    await refreshProfile();
  };

  /**
   * Регистрация нового пользователя.
   * Аналогична login — сохраняет токены и загружает профиль.
   */
  const register = async (email: string, password: string, turnstileToken?: string): Promise<{ message: string }> => {
    return authApi.register(email, password, turnstileToken);
  };

  /**
   * Выход из системы.
   * Инвалидирует refresh token на сервере, очищает localStorage,
   * сбрасывает user в null (UI сразу показывает экран входа).
   */
  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  // После успешной авторизации запускаем фоновую подгрузку картинок
  // для попапов генерации и шагов создания персонажа.
  usePrefetchAllOptions(!!user);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Хук для доступа к контексту аутентификации.
 *
 * @returns {AuthContextValue} Состояние и методы аутентификации
 * @throws {Error} Если вызван вне компонента, обёрнутого в AuthProvider
 *
 * @example
 * const { user, loading, login, logout } = useAuth();
 * if (loading) return <Spinner />;
 * if (!user) return <LoginPage />;
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
