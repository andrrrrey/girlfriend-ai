/**
 * @file apps/web/lib/api.ts
 * @description Клиентская библиотека для взаимодействия с REST API бэкенда.
 *
 * Архитектура:
 * - Все запросы идут через apiFetch — универсальную обёртку с автоматической инъекцией JWT
 * - Токены хранятся в localStorage (accessToken + refreshToken)
 * - Реализован прозрачный Refresh Token Rotation: при 401 автоматически обновляет токен и повторяет запрос
 * - SSE-потоки (streamMessage, streamEditMessage, streamRegenerate, streamVoiceMessage) возвращают AbortController
 *   для отмены запроса (например, при закрытии чата)
 *
 * Экспортируемые группы:
 * - `auth` — регистрация, вход, выход, проверка авторизации
 * - `users` — профиль, пароль, социальные ссылки
 * - `admin` — управление настройками, персонажами, пользователями
 * - `chats` — CRUD чатов и сообщений
 * - `characters` — список публичных персонажей
 * - Функции SSE: streamMessage, streamEditMessage, streamRegenerate, streamVoiceMessage, fetchTTS
 *
 * Конфигурация:
 * - API_BASE: NEXT_PUBLIC_API_URL из env (по умолчанию http://localhost:8080)
 */

const API_BASE = "/api-proxy";

/** Опции ресайза картинки на лету (см. GET /media/stream на бэкенде). */
export interface ImageResizeOpts {
  /** Целевая ширина. Допустимы: 96, 256, 400, 768, 1080. Иное игнорируется. */
  w?: number;
  /** Качество webp 40..90 (по умолчанию 80 на сервере). */
  q?: number;
}

/**
 * Превращает S3-ключ в URL медиа-стрима (с долгим immutable-кешем).
 * Используется на админских страницах, где сервер возвращает ключи, но не URL.
 * Если переданы opts.w/opts.q — сервер вернёт сжатый webp нужной ширины.
 */
export function streamUrlForKey(
  key: string | null | undefined,
  opts?: ImageResizeOpts,
): string | null {
  if (!key) return null;
  const params = new URLSearchParams({ key });
  if (opts?.w) params.set("w", String(opts.w));
  if (opts?.q) params.set("q", String(opts.q));
  return `${API_BASE}/media/stream?${params.toString()}`;
}

/**
 * Дописывает параметры ресайза к уже готовому URL медиа-стрима
 * (например, к avatarUrl, который сервер отдаёт как /media/stream?key=...).
 * Параметры добавляются только для наших стрим-URL; чужие URL не трогаем.
 */
export function resizedMediaUrl(
  url: string | null | undefined,
  opts: ImageResizeOpts,
): string | null {
  if (!url) return null;
  if (!url.includes("/media/stream")) return url;
  if (!opts.w && !opts.q) return url;
  const sep = url.includes("?") ? "&" : "?";
  const extra: string[] = [];
  if (opts.w && !/[?&]w=/.test(url)) extra.push(`w=${opts.w}`);
  if (opts.q && !/[?&]q=/.test(url)) extra.push(`q=${opts.q}`);
  return extra.length ? `${url}${sep}${extra.join("&")}` : url;
}

/**
 * Пара JWT-токенов, возвращаемая при входе/регистрации/обновлении.
 * accessToken — короткоживущий JWT (7 дней).
 * refreshToken — долгоживущий UUID (30 дней), хранится в БД.
 */
interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Читает токены из localStorage.
 * Возвращает null на сервере (SSR) или если токены не найдены.
 *
 * @returns {TokenPair | null} Токены или null
 */
function getTokens(): TokenPair | null {
  if (typeof window === "undefined") return null; // SSR guard
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/**
 * Сохраняет оба токена в localStorage.
 * Вызывается после login, register и successful token refresh.
 *
 * @param {TokenPair} tokens - Новая пара токенов
 */
function saveTokens(tokens: TokenPair) {
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
}

/**
 * Удаляет оба токена из localStorage.
 * Вызывается при logout и при неудачном обновлении токена.
 */
function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

/**
 * Пытается обновить accessToken через POST /auth/refresh.
 *
 * Реализует Refresh Token Rotation — сервер возвращает новую пару токенов.
 * При любой ошибке (сеть, 401, истёкший refresh) — очищает токены.
 *
 * @returns {Promise<string | null>} Новый accessToken или null при неудаче
 */
async function refreshAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data: TokenPair = await res.json();
    saveTokens(data);
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Универсальная обёртка для HTTP-запросов к API.
 *
 * Особенности:
 * - Автоматически добавляет заголовок Authorization: Bearer <accessToken>
 * - При HTTP 401 автоматически пробует обновить токен и повторяет запрос (один раз)
 * - HTTP 204 (No Content) возвращает undefined без попытки парсить JSON
 * - При ошибках бросает ApiError с HTTP-статусом и сообщением
 *
 * @template T - Тип возвращаемого значения
 * @param {string} path - Путь запроса (например, "/users/me")
 * @param {RequestInit} [options] - Стандартные fetch options (method, body, headers)
 * @returns {Promise<T>} Распарсенный JSON-ответ
 * @throws {ApiError} При любом non-ok HTTP статусе
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // If 429, do NOT attempt refresh — just throw immediately
  if (res.status === 429) {
    throw new ApiError(429, "Too Many Requests — please wait a moment and try again");
  }

  // If 401, try refreshing the token once — transparent token rotation
  if (res.status === 401 && tokens?.refreshToken) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      headers["Authorization"] = `Bearer ${newAccessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || res.statusText, body);
  }

  if (res.status === 204) return undefined as T; // No Content — нет тела ответа
  return res.json();
}

/**
 * Ошибка API-запроса с HTTP-статусом.
 * Используется в catch-блоках для определения типа ошибки (403, 429, etc.).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Auth API ─────────────────────────────────────────────────

/**
 * Методы авторизации.
 * Все методы, возвращающие токены, автоматически сохраняют их в localStorage.
 */
export const auth = {
  /**
   * Регистрирует нового пользователя и сохраняет токены.
   * @param {string} email - Email нового пользователя
   * @param {string} password - Пароль (минимум 6 символов)
   * @returns {Promise<TokenPair>} Пара токенов доступа
   */
  async register(email: string, password: string, turnstileToken?: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, turnstileToken }),
    });
  },

  /**
   * Выполняет вход и сохраняет токены.
   * @param {string} email - Email пользователя
   * @param {string} password - Пароль
   * @returns {Promise<TokenPair>} Пара токенов доступа
   */
  async login(email: string, password: string, turnstileToken?: string): Promise<TokenPair> {
    const data = await apiFetch<TokenPair>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, turnstileToken }),
    });
    saveTokens(data);
    return data;
  },

  /**
   * Выполняет выход: инвалидирует refresh token на сервере и очищает localStorage.
   * Ошибки сети при logout игнорируются — токены всё равно очищаются локально.
   */
  async logout(): Promise<void> {
    const tokens = getTokens();
    if (tokens?.refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => {}); // Игнорируем ошибки при logout
    }
    clearTokens();
  },

  /**
   * Проверяет наличие accessToken в localStorage (клиентская проверка).
   * Не проверяет валидность токена на сервере — используется для быстрого UI-решения.
   * @returns {boolean} true, если accessToken присутствует
   */
  isAuthenticated(): boolean {
    return !!getTokens()?.accessToken;
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    });
  },

  async resendVerification(email: string): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
};

// ─── Users API ────────────────────────────────────────────────

/**
 * Профиль пользователя (возвращается GET /users/me).
 */
export interface UserProfile {
  id: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
  aboutMe: string | null;
  role: string;           // "user" | "admin"
  subscription: string;  // "free" | "premium" | ...
  lang: string;          // "en" | "ru"
  createdAt: string;     // ISO 8601
  socialLinks: { provider: string; url: string }[];
}

export interface PublicUserProfile {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  aboutMe: string | null;
  socialLinks: { provider: string; url: string }[];
  followerCount: number;
  likeCount: number;
  characterCount: number;
  isFollowing: boolean;
  createdAt: string;
}

/**
 * Методы управления профилем пользователя.
 */
export const users = {
  /** Возвращает профиль текущего пользователя (GET /users/me). */
  async getProfile(): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me");
  },

  /**
   * Обновляет профиль (PATCH /users/me). Все поля опциональны.
   * @param data - Поля для обновления: nickname, avatarUrl, lang, aboutMe
   */
  async updateProfile(
    data: Partial<Pick<UserProfile, "nickname" | "avatarUrl" | "lang" | "aboutMe">>,
  ): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** Checks if a nickname is available (GET /users/check-nickname). */
  async checkNickname(nickname: string): Promise<{ available: boolean }> {
    return apiFetch<{ available: boolean }>(`/users/check-nickname?nickname=${encodeURIComponent(nickname)}`);
  },

  /** Returns a public user profile by nickname (GET /users/:nickname). */
  async getPublicProfile(nickname: string): Promise<PublicUserProfile> {
    return apiFetch<PublicUserProfile>(`/users/${encodeURIComponent(nickname)}`);
  },

  /** Follows a user (POST /users/:nickname/follow). */
  async follow(nickname: string): Promise<{ following: boolean }> {
    return apiFetch<{ following: boolean }>(`/users/${encodeURIComponent(nickname)}/follow`, { method: "POST" });
  },

  /** Unfollows a user (DELETE /users/:nickname/follow). */
  async unfollow(nickname: string): Promise<{ following: boolean }> {
    return apiFetch<{ following: boolean }>(`/users/${encodeURIComponent(nickname)}/follow`, { method: "DELETE" });
  },

  /** Returns whether the current user follows the given user. */
  async getFollowStatus(nickname: string): Promise<{ following: boolean }> {
    return apiFetch<{ following: boolean }>(`/users/${encodeURIComponent(nickname)}/follow-status`);
  },

  /**
   * Изменяет пароль (PATCH /users/me/password).
   * Требует текущий пароль для подтверждения — защита от CSRF.
   */
  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    return apiFetch("/users/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /**
   * Создаёт или обновляет социальную ссылку (PUT /users/me/social-links).
   * Уникальность по паре (userId, provider).
   * @param {string} provider - Провайдер: "vk" | "instagram" | "x"
   * @param {string} url - URL профиля
   */
  async upsertSocialLink(
    provider: string,
    url: string,
  ): Promise<{ provider: string; url: string }> {
    return apiFetch("/users/me/social-links", {
      method: "PUT",
      body: JSON.stringify({ provider, url }),
    });
  },

  /**
   * Удаляет социальную ссылку (DELETE /users/me/social-links/:provider).
   * Идемпотентна — не ошибается если ссылки нет.
   * @param {string} provider - Провайдер соцсети
   */
  async deleteSocialLink(provider: string): Promise<void> {
    return apiFetch(`/users/me/social-links/${provider}`, {
      method: "DELETE",
    });
  },
};

// ─── Character Options ───────────────────────────────────────

export interface CharacterOption {
  id: string;
  category: string;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  imageThumbKey?: string | null;
  imageFullKey?: string | null;
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  order: number;
  generationStyle?: string | null;
  createdAt: string;
}

export async function getCharacterOptions(): Promise<CharacterOption[]> {
  return apiFetch<CharacterOption[]>("/generation/character-options");
}

// ─── Appearance Options ──────────────────────────────────────

export interface AppearanceOption {
  id: string;
  categoryId: string;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  imageThumbKey?: string | null;
  imageFullKey?: string | null;
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  order: number;
  createdAt: string;
}

export interface AppearanceCategory {
  id: string;
  tab: string;
  name: string;
  order: number;
  createdAt: string;
  options: AppearanceOption[];
}

export interface AppearanceOptionsResponse {
  OUTFITS: AppearanceCategory[];
  OUTFIT_DETAILS: AppearanceCategory[];
}

export async function getAppearanceOptions(): Promise<AppearanceOptionsResponse> {
  return apiFetch<AppearanceOptionsResponse>("/generation/appearance-options");
}

// ─── Pose Options ────────────────────────────────────────────

export interface PoseOption {
  id: string;
  categoryId: string;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  imageThumbKey?: string | null;
  imageFullKey?: string | null;
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  order: number;
  createdAt: string;
}

export interface PoseCategory {
  id: string;
  tab: string;
  name: string;
  order: number;
  createdAt: string;
  options: PoseOption[];
}

export interface PoseOptionsResponse {
  FACIAL_EXPRESSION: PoseCategory[];
  POSE: PoseCategory[];
}

export async function getPoseOptions(): Promise<PoseOptionsResponse> {
  return apiFetch<PoseOptionsResponse>("/generation/pose-options");
}

// ─── Scene Options ────────────────────────────────────────────

export interface SceneOption {
  id: string;
  categoryId: string;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  imageThumbKey?: string | null;
  imageFullKey?: string | null;
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  order: number;
  createdAt: string;
}

export interface SceneCategory {
  id: string;
  tab: string;
  name: string;
  order: number;
  createdAt: string;
  options: SceneOption[];
}

export interface SceneOptionsResponse {
  LOCATION: SceneCategory[];
}

export async function getSceneOptions(): Promise<SceneOptionsResponse> {
  return apiFetch<SceneOptionsResponse>("/generation/scene-options");
}

// ─── Camera Options ───────────────────────────────────────────

export interface CameraOption {
  id: string;
  section: string;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  imageThumbKey?: string | null;
  imageFullKey?: string | null;
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  order: number;
  createdAt: string;
}

export interface CameraOptionsResponse {
  FRAMING: CameraOption[];
  CAMERA_ANGLE: CameraOption[];
}

export async function getCameraOptions(): Promise<CameraOptionsResponse> {
  return apiFetch<CameraOptionsResponse>("/generation/camera-options");
}

// ─── Admin API ───────────────────────────────────────────────

/** Одна созданная генерация в отчёте расходов. */
export interface GenerationCostItem {
  jobId: string;
  type: string;      // "image" | "video"
  model: string;
  prompt: string;
  createdAt: string; // ISO 8601
}

/** Агрегат количества генераций по (тип, модель) для подсчёта итогов. */
export interface GenerationCostBreakdown {
  type: string;
  model: string;
  count: number;
}

/** Данные раздела «Расходы» (GET /admin/generation-costs). */
export interface GenerationCosts {
  currency: string;
  rows: GenerationCostItem[];
  total: number;                              // всего генераций под фильтр (для пагинации)
  pricing: Record<string, number>;            // сохранённые цены за генерацию по моделям
  availableModels: { type: string; model: string }[];
  breakdown: GenerationCostBreakdown[];       // количества по моделям под фильтр
}

/** Настройка приложения (ключ-значение, хранится в БД). */
export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string; // ISO 8601
}

/** Пользователь в admin-панели (расширенный профиль с usage-статистикой). */
export interface AdminUserStats {
  imageCount: number;
  videoCount: number;
  chatCount: number;
  characterCount: number;
}

export interface AdminUserDetailedStats extends AdminUserStats {
  modelsUsed: { model: string; count: number }[];
}

export interface AdminUser {
  id: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  subscription: string;
  isDemo: boolean;
  lang: string;
  createdAt: string;
  usageCounters?: { action: string; count: number; resetAt: string }[];
  stats?: AdminUserStats;
}

/** Персонаж AI (используется и в admin-панели и в публичном каталоге). */
export interface Character {
  id: string;
  name: string;
  systemPrompt: string;                    // Системный промпт для LLM
  personality: Record<string, unknown>;    // JSON: age, traits, hobbies
  avatarUrl: string | null;
  voiceId: string | null;                  // ElevenLabs voice ID
  tags: string[];
  isPublic: boolean;                       // Виден ли в публичном каталоге
  createdAt: string;
  createdBy: string | null;
  creator?: {
    id: string;
    nickname: string | null;
    avatarUrl: string | null;
    followerCount?: number;
    likeCount?: number;
  } | null;
}

export interface StoryCharacter {
  id: string;
  name: string;
  avatarUrl: string | null;
  hasActiveStory: boolean;
  storyCount: number;
  latestStoryAt: string | null;
}

/** Запись блога (админ-панель). Тело `content` — HTML из редактора. */
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  category: string;
  coverImageUrl: string | null;
  tags: string[];
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Жалоба на персонажа (admin-панель). */
export interface AdminReport {
  id: string;
  reasons: string[];
  details: string | null;
  status: string;
  createdAt: string;
  user: { id: string; email: string; nickname: string | null } | null;
  character: { id: string; name: string } | null;
}

export interface StoryImage {
  id: string;
  url: string;
  label: string;
  createdAt: string;
}

/**
 * Методы admin-панели.
 * Все запросы требуют роль "admin" (JWT + RolesGuard).
 */
export const admin = {
  /** Получает все AppSettings (GET /admin/settings). */
  async getSettings(): Promise<AppSetting[]> {
    return apiFetch<AppSetting[]>("/admin/settings");
  },

  /**
   * Обновляет/создаёт настройки пачкой (PUT /admin/settings).
   * @param {Record<string, string>} settings - Словарь key→value
   */
  async upsertSettings(settings: Record<string, string>): Promise<AppSetting[]> {
    return apiFetch<AppSetting[]>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
  },

  /** Список всех персонажей (GET /admin/characters). */
  async getCharacters(): Promise<Character[]> {
    return apiFetch<Character[]>("/admin/characters");
  },

  /**
   * Запускает фоновую генерацию SEO-описаний/slug для всех персонажей
   * (POST /admin/characters/backfill-seo).
   */
  async backfillCharacterSeo(): Promise<{ started: boolean; total: number }> {
    return apiFetch<{ started: boolean; total: number }>("/admin/characters/backfill-seo", {
      method: "POST",
    });
  },

  /** Один персонаж по ID (GET /admin/characters/:id). */
  async getCharacter(id: string): Promise<Character> {
    return apiFetch<Character>(`/admin/characters/${id}`);
  },

  /** Создаёт персонажа (POST /admin/characters). */
  async createCharacter(data: Partial<Character>): Promise<Character> {
    return apiFetch<Character>("/admin/characters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /** Обновляет персонажа (PATCH /admin/characters/:id). */
  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    return apiFetch<Character>(`/admin/characters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** Мягко удаляет персонажа (DELETE /admin/characters/:id). */
  async deleteCharacter(id: string): Promise<void> {
    return apiFetch(`/admin/characters/${id}`, { method: "DELETE" });
  },

  // ─── Блог ───────────────────────────────────────────────────

  /** Список всех записей блога, включая черновики (GET /admin/blog-posts). */
  async getBlogPosts(): Promise<BlogPost[]> {
    return apiFetch<BlogPost[]>("/admin/blog-posts");
  },

  /** Одна запись блога по ID (GET /admin/blog-posts/:id). */
  async getBlogPost(id: string): Promise<BlogPost> {
    return apiFetch<BlogPost>(`/admin/blog-posts/${id}`);
  },

  /** Создаёт запись блога (POST /admin/blog-posts). */
  async createBlogPost(data: Partial<BlogPost>): Promise<BlogPost> {
    return apiFetch<BlogPost>("/admin/blog-posts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /** Обновляет запись блога (PATCH /admin/blog-posts/:id). */
  async updateBlogPost(id: string, data: Partial<BlogPost>): Promise<BlogPost> {
    return apiFetch<BlogPost>(`/admin/blog-posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** Мягко удаляет запись блога (DELETE /admin/blog-posts/:id). */
  async deleteBlogPost(id: string): Promise<void> {
    return apiFetch(`/admin/blog-posts/${id}`, { method: "DELETE" });
  },

  /**
   * Список пользователей с фильтрацией и пагинацией (GET /admin/users).
   * @param params.search - Поиск по email/nickname
   * @param params.limit - Количество записей
   * @param params.offset - Смещение (для offset-pagination)
   */
  async getUsers(params?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUser[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch(`/admin/users${qs ? `?${qs}` : ""}`);
  },

  /**
   * Обновляет роль или подписку пользователя (PATCH /admin/users/:id).
   * @param {string} id - UUID пользователя
   * @param data.subscription - Новый тарифный план
   * @param data.role - Новая роль ("user" | "admin")
   */
  async updateUser(
    id: string,
    data: { subscription?: string; role?: string },
  ): Promise<AdminUser> {
    return apiFetch(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /**
   * Сбрасывает суточные лимиты пользователя (DELETE /admin/users/:id/limits).
   * Удаляет все UsageCounter записи для данного пользователя.
   */
  async resetUserLimits(id: string): Promise<void> {
    return apiFetch(`/admin/users/${id}/limits`, { method: "DELETE" });
  },

  async deleteUser(id: string): Promise<void> {
    return apiFetch(`/admin/users/${id}`, { method: "DELETE" });
  },

  async getUserStats(id: string): Promise<AdminUserDetailedStats> {
    return apiFetch<AdminUserDetailedStats>(`/admin/users/${id}/stats`);
  },

  /**
   * Список жалоб с фильтрами и пагинацией (GET /admin/reports).
   */
  async getReports(params?: {
    search?: string;
    characterId?: string;
    reason?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: AdminReport[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.characterId) query.set("characterId", params.characterId);
    if (params?.reason) query.set("reason", params.reason);
    if (params?.status) query.set("status", params.status);
    if (params?.limit != null) query.set("limit", String(params.limit));
    if (params?.offset != null) query.set("offset", String(params.offset));
    const qs = query.toString();
    return apiFetch(`/admin/reports${qs ? `?${qs}` : ""}`);
  },

  /** Меняет статус жалобы (PATCH /admin/reports/:id). */
  async updateReportStatus(id: string, status: string): Promise<{ id: string; status: string }> {
    return apiFetch(`/admin/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  /** Удаляет жалобу (DELETE /admin/reports/:id). */
  async deleteReport(id: string): Promise<void> {
    return apiFetch(`/admin/reports/${id}`, { method: "DELETE" });
  },

  async getCharacterOptions(category?: string): Promise<CharacterOption[]> {
    const q = category ? `?category=${category}` : "";
    return apiFetch<CharacterOption[]>(`/admin/character-options${q}`);
  },

  async createCharacterOption(data: { category: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number; generationStyle?: string }): Promise<CharacterOption> {
    return apiFetch<CharacterOption>("/admin/character-options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCharacterOption(id: string, data: { category?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number; generationStyle?: string }): Promise<CharacterOption> {
    return apiFetch<CharacterOption>(`/admin/character-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteCharacterOption(id: string): Promise<void> {
    return apiFetch(`/admin/character-options/${id}`, { method: "DELETE" });
  },

  async getAppearanceCategories(tab?: string): Promise<AppearanceCategory[]> {
    const q = tab ? `?tab=${tab}` : "";
    return apiFetch<AppearanceCategory[]>(`/admin/appearance-categories${q}`);
  },

  async createAppearanceCategory(data: { tab: string; name: string; order?: number }): Promise<AppearanceCategory> {
    return apiFetch<AppearanceCategory>("/admin/appearance-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateAppearanceCategory(id: string, data: { tab?: string; name?: string; order?: number }): Promise<AppearanceCategory> {
    return apiFetch<AppearanceCategory>(`/admin/appearance-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteAppearanceCategory(id: string): Promise<void> {
    return apiFetch(`/admin/appearance-categories/${id}`, { method: "DELETE" });
  },

  async getAppearanceOptions(categoryId?: string): Promise<AppearanceOption[]> {
    const q = categoryId ? `?categoryId=${categoryId}` : "";
    return apiFetch<AppearanceOption[]>(`/admin/appearance-options${q}`);
  },

  async createAppearanceOption(data: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<AppearanceOption> {
    return apiFetch<AppearanceOption>("/admin/appearance-options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateAppearanceOption(id: string, data: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<AppearanceOption> {
    return apiFetch<AppearanceOption>(`/admin/appearance-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteAppearanceOption(id: string): Promise<void> {
    return apiFetch(`/admin/appearance-options/${id}`, { method: "DELETE" });
  },

  async getPoseCategories(tab?: string): Promise<PoseCategory[]> {
    const q = tab ? `?tab=${tab}` : "";
    return apiFetch<PoseCategory[]>(`/admin/pose-categories${q}`);
  },

  async createPoseCategory(data: { tab: string; name: string; order?: number }): Promise<PoseCategory> {
    return apiFetch<PoseCategory>("/admin/pose-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updatePoseCategory(id: string, data: { tab?: string; name?: string; order?: number }): Promise<PoseCategory> {
    return apiFetch<PoseCategory>(`/admin/pose-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deletePoseCategory(id: string): Promise<void> {
    return apiFetch(`/admin/pose-categories/${id}`, { method: "DELETE" });
  },

  async getPoseOptions(categoryId?: string): Promise<PoseOption[]> {
    const q = categoryId ? `?categoryId=${categoryId}` : "";
    return apiFetch<PoseOption[]>(`/admin/pose-options${q}`);
  },

  async createPoseOption(data: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<PoseOption> {
    return apiFetch<PoseOption>("/admin/pose-options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updatePoseOption(id: string, data: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<PoseOption> {
    return apiFetch<PoseOption>(`/admin/pose-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deletePoseOption(id: string): Promise<void> {
    return apiFetch(`/admin/pose-options/${id}`, { method: "DELETE" });
  },

  async getSceneCategories(tab?: string): Promise<SceneCategory[]> {
    const q = tab ? `?tab=${tab}` : "";
    return apiFetch<SceneCategory[]>(`/admin/scene-categories${q}`);
  },

  async createSceneCategory(data: { tab: string; name: string; order?: number }): Promise<SceneCategory> {
    return apiFetch<SceneCategory>("/admin/scene-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSceneCategory(id: string, data: { tab?: string; name?: string; order?: number }): Promise<SceneCategory> {
    return apiFetch<SceneCategory>(`/admin/scene-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteSceneCategory(id: string): Promise<void> {
    return apiFetch(`/admin/scene-categories/${id}`, { method: "DELETE" });
  },

  async getSceneOptions(categoryId?: string): Promise<SceneOption[]> {
    const q = categoryId ? `?categoryId=${categoryId}` : "";
    return apiFetch<SceneOption[]>(`/admin/scene-options${q}`);
  },

  async createSceneOption(data: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<SceneOption> {
    return apiFetch<SceneOption>("/admin/scene-options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateSceneOption(id: string, data: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<SceneOption> {
    return apiFetch<SceneOption>(`/admin/scene-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteSceneOption(id: string): Promise<void> {
    return apiFetch(`/admin/scene-options/${id}`, { method: "DELETE" });
  },

  async getCameraOptions(section?: string): Promise<CameraOption[]> {
    const q = section ? `?section=${section}` : "";
    return apiFetch<CameraOption[]>(`/admin/camera-options${q}`);
  },

  async createCameraOption(data: { section: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<CameraOption> {
    return apiFetch<CameraOption>("/admin/camera-options", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCameraOption(id: string, data: { section?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }): Promise<CameraOption> {
    return apiFetch<CameraOption>(`/admin/camera-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteCameraOption(id: string): Promise<void> {
    return apiFetch(`/admin/camera-options/${id}`, { method: "DELETE" });
  },

  /**
   * Загружает оригинал картинки опции — API ресайзит в WebP (thumb+full)
   * и складывает в S3. Возвращает ключи S3 для сохранения в опции.
   */
  async uploadOptionImage(file: File): Promise<{ thumbKey: string; fullKey: string }> {
    const tokens = (typeof window !== "undefined")
      ? { accessToken: localStorage.getItem("accessToken") }
      : null;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/admin/upload-option-image`, {
      method: "POST",
      headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.message || res.statusText, body);
    }
    return res.json();
  },

  async getGenerations(params?: { type?: string; limit?: number; offset?: number; search?: string }): Promise<{ items: any[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    return apiFetch(`/admin/generations?${qs}`);
  },

  /** Список генераций + разбивка по моделям для расходов (GET /admin/generation-costs). */
  async getGenerationCosts(params?: {
    type?: string;
    model?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<GenerationCosts> {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.model) qs.set("model", params.model);
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return apiFetch<GenerationCosts>(`/admin/generation-costs${q ? `?${q}` : ""}`);
  },
};

// ─── Chat API ────────────────────────────────────────────────

/**
 * Чат-сессия (список чатов пользователя).
 * Включает последнее сообщение для превью в сайдбаре.
 */
export interface ChatSession {
  id: string;
  title: string | null;
  character: { id: string; name: string; avatarUrl: string | null };
  lastMessage: { content: string; role: string; createdAt: string } | null;
  lastMessageAt: string | null;
  createdAt: string;
  /** ID выбранного чат-профиля (персоны), который персонаж учитывает в диалоге. */
  chatProfileId?: string | null;
  /** Всего сообщений ассистента в чате (для бейджа непрочитанных на клиенте). */
  assistantCount?: number;
}

/** Чат-профиль (персона) пользователя. */
export interface ChatProfile {
  id: string;
  userId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/** CRUD-методы для чат-профилей пользователя (/chat-profiles). */
export const chatProfiles = {
  /** Список профилей текущего пользователя (GET /chat-profiles). */
  async list(): Promise<ChatProfile[]> {
    return apiFetch<ChatProfile[]>("/chat-profiles");
  },

  /** Создаёт новый профиль (POST /chat-profiles). */
  async create(data: { name: string; description: string }): Promise<ChatProfile> {
    return apiFetch<ChatProfile>("/chat-profiles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /** Обновляет профиль (PATCH /chat-profiles/:id). */
  async update(id: string, data: { name?: string; description?: string }): Promise<ChatProfile> {
    return apiFetch<ChatProfile>(`/chat-profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** Удаляет профиль (DELETE /chat-profiles/:id). */
  async remove(id: string): Promise<void> {
    return apiFetch(`/chat-profiles/${id}`, { method: "DELETE" });
  },
};

/**
 * Сообщение в чате.
 * role: "user" | "assistant" | "system"
 * type: "text" | "voice" (для голосовых сообщений)
 * mediaUrl: URL аудиофайла TTS (S3/MinIO) если есть
 */
export interface Message {
  id: string;
  role: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * CRUD-методы для чатов и сообщений.
 * Списки используют cursor-based pagination (nextCursor для подгрузки старых сообщений).
 */
export const chats = {
  /**
   * Создаёт новый чат с персонажем (POST /chats).
   * @param {string} characterId - UUID персонажа
   * @param {string} [title] - Название чата (опционально)
   */
  async create(characterId: string, title?: string): Promise<ChatSession> {
    return apiFetch<ChatSession>("/chats", {
      method: "POST",
      body: JSON.stringify({ characterId, title }),
    });
  },

  /**
   * Список чатов пользователя с cursor pagination (GET /chats).
   * @param {string} [cursor] - ID последнего полученного чата (для следующей страницы)
   * @returns items — чаты, nextCursor — курсор для следующей страницы (null если конец)
   */
  async list(cursor?: string): Promise<{ items: ChatSession[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : "";
    return apiFetch(`/chats${params}`);
  },

  /** Данные одного чата (GET /chats/:id). Проверяет владельца (IDOR protection). */
  async get(id: string) {
    return apiFetch(`/chats/${id}`);
  },

  /**
   * Обновляет чат (PATCH /chats/:id): название и/или выбранный чат-профиль.
   * Передайте chatProfileId: null, чтобы сбросить профиль ("без профиля").
   */
  async update(id: string, data: { title?: string; chatProfileId?: string | null }) {
    return apiFetch(`/chats/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /** Мягко удаляет чат (DELETE /chats/:id). */
  async remove(id: string): Promise<void> {
    return apiFetch(`/chats/${id}`, { method: "DELETE" });
  },

  /**
   * Список сообщений с cursor pagination (GET /chats/:id/messages).
   * Возвращает в хронологическом порядке (старые сначала).
   * @param {string} chatId - ID чата
   * @param {string} [cursor] - Курсор для подгрузки более старых сообщений
   */
  async getMessages(
    chatId: string,
    cursor?: string,
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : "";
    return apiFetch(`/chats/${chatId}/messages${params}`);
  },

  /** Мягко удаляет сообщение (DELETE /chats/:chatId/messages/:messageId). */
  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return apiFetch(`/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
  },
};

// ─── SSE: edit message (updates content + streams new AI response) ───

/**
 * Редактирует пользовательское сообщение и стримит новый AI-ответ (PATCH /chats/:chatId/messages/:messageId).
 *
 * SSE-формат ответа (построчно):
 * - `data: {"content":"текст"}` — дельта AI-ответа
 * - `data: {"error":"..."}` — ошибка
 * - `data: {"done":true}` — завершение (альтернатива [DONE])
 * - `data: [DONE]` — конец потока
 *
 * @param {string} chatId - ID чата
 * @param {string} messageId - ID редактируемого сообщения
 * @param {string} content - Новый текст сообщения
 * @param {(text: string) => void} onDelta - Коллбэк для каждого чанка AI-ответа
 * @param {() => void} onDone - Коллбэк при завершении стрима
 * @param {(err: string, code?: number) => void} onError - Коллбэк при ошибке
 * @returns {AbortController} Контроллер для отмены запроса (controller.abort())
 */
export function streamEditMessage(
  chatId: string,
  messageId: string,
  content: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string, code?: number, body?: any) => void,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onError(err.error || err.message || res.statusText, res.status, err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line === "data: [DONE]") {
            onDone();
            return;
          }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) onDelta(parsed.content);
              if (parsed.error) onError(parsed.error);
              if (parsed.done) onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

export interface CreateCharacterFormData {
  name: string;
  surname?: string;
  age: number;
  gender: string;
  orientation: string;
  style: string;
  nationality?: string;
  language?: string;
  ethnicity?: string;
  voice?: string;
  eyeColor?: string;
  hairStyle?: string;
  hairColor?: string;
  bodyType?: string;
  breastSize?: string;
  buttSize?: string;
  personality?: string;
  relationshipType?: string;
  familyStatus?: string;
  lifestyle?: string;
  work?: string[];
  hobbies?: string[];
  kinks?: string[];
  childhoodMemory?: string;
  lifeStory?: string;
  phobias?: string;
  avatarUrl?: string;
}

export const characters = {
  async listPublic(params?: {
    search?: string;
    gender?: string;
    style?: string;
    createdBy?: string;
    createdByUserId?: string;
    sortBy?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }): Promise<{ items: Character[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.gender) query.set("gender", params.gender);
    if (params?.style) query.set("style", params.style);
    if (params?.createdBy) query.set("createdBy", params.createdBy);
    if (params?.createdByUserId) query.set("createdByUserId", params.createdByUserId);
    if (params?.sortBy) query.set("sortBy", params.sortBy);
    if (params?.tags?.length) query.set("tags", params.tags.join(","));
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    return apiFetch<{ items: Character[]; total: number }>(`/characters${qs ? `?${qs}` : ""}`);
  },

  async getTags(): Promise<{ tag: string; count: number }[]> {
    return apiFetch<{ tag: string; count: number }[]>("/characters/tags");
  },

  async listMy(): Promise<Character[]> {
    return apiFetch<Character[]>("/characters/my");
  },

  async getOne(id: string): Promise<Character> {
    return apiFetch<Character>(`/characters/${id}`);
  },

  async getStories(): Promise<{ items: StoryCharacter[] }> {
    return apiFetch<{ items: StoryCharacter[] }>("/characters/stories");
  },

  async getStory(id: string): Promise<{
    character: { id: string; name: string; avatarUrl: string | null } | null;
    items: StoryImage[];
  }> {
    return apiFetch(`/characters/${id}/story`);
  },

  /** Последние 5 изображений из чатов всех пользователей + общий счётчик. */
  async getImages(id: string): Promise<{ count: number; items: StoryImage[] }> {
    return apiFetch(`/characters/${id}/images`);
  },

  async create(data: CreateCharacterFormData): Promise<Character> {
    return apiFetch<Character>("/characters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ─── Likes API ──────────────────────────────────────────────

export const likes = {
  async toggle(targetType: string, targetId: string): Promise<{ liked: boolean; count: number }> {
    return apiFetch<{ liked: boolean; count: number }>("/likes/toggle", {
      method: "POST",
      body: JSON.stringify({ targetType, targetId }),
    });
  },

  async getStatus(targetType: string, targetId: string): Promise<{ liked: boolean; count: number }> {
    return apiFetch<{ liked: boolean; count: number }>(
      `/likes/status?targetType=${targetType}&targetId=${targetId}`,
    );
  },

  async getCount(targetType: string, targetId: string): Promise<{ count: number }> {
    return apiFetch<{ count: number }>(
      `/likes/count?targetType=${targetType}&targetId=${targetId}`,
    );
  },

  async batchStatus(
    targetType: string,
    targetIds: string[],
  ): Promise<Record<string, { liked: boolean; count: number }>> {
    return apiFetch<Record<string, { liked: boolean; count: number }>>(
      `/likes/batch-status?targetType=${targetType}&targetIds=${targetIds.join(",")}`,
    );
  },

  async getMyLiked(
    targetType: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: any[]; total: number }> {
    return apiFetch<{ items: any[]; total: number }>(
      `/likes/my?targetType=${targetType}&page=${page}&limit=${limit}`,
    );
  },
};

// ─── Comments API ───────────────────────────────────────────

export interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; nickname: string | null; avatarUrl: string | null };
  likeCount: number;
  liked: boolean;
}

export const comments = {
  async list(
    characterId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: CommentItem[]; nextCursor: string | null }> {
    const query = new URLSearchParams({ characterId, limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return apiFetch<{ items: CommentItem[]; nextCursor: string | null }>(
      `/comments?${query.toString()}`,
    );
  },

  async create(characterId: string, content: string): Promise<CommentItem> {
    return apiFetch<CommentItem>("/comments", {
      method: "POST",
      body: JSON.stringify({ characterId, content }),
    });
  },

  async remove(commentId: string): Promise<void> {
    return apiFetch(`/comments/${commentId}`, { method: "DELETE" });
  },

  async getCount(characterId: string): Promise<{ count: number }> {
    return apiFetch<{ count: number }>(`/comments/count?characterId=${characterId}`);
  },
};

// ─── Reports (жалобы на персонажей) ──────────────────────────

export const reports = {
  /** Отправляет жалобу на персонажа (POST /reports). Требует авторизации. */
  async create(data: {
    characterId: string;
    reasons: string[];
    details?: string;
  }): Promise<{ id: string }> {
    return apiFetch<{ id: string }>("/reports", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

// ─── SSE streaming helper ────────────────────────────────────

/**
 * Отправляет текстовое сообщение и стримит AI-ответ (POST /chats/:chatId/messages).
 *
 * Поток содержит дельты AI-ответа в формате SSE.
 * AbortController позволяет прервать стрим (например, при закрытии страницы).
 *
 * @param {string} chatId - ID чата
 * @param {string} content - Текст сообщения пользователя
 * @param {(text: string) => void} onDelta - Коллбэк для каждого чанка AI-ответа
 * @param {() => void} onDone - Коллбэк при завершении стрима
 * @param {(err: string, code?: number) => void} onError - Коллбэк при ошибке
 * @returns {AbortController} Контроллер для отмены (controller.abort())
 */
export function streamMessage(
  chatId: string,
  content: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string, code?: number, body?: any) => void,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onError(err.error || err.message || res.statusText, res.status, err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line === "data: [DONE]") {
            onDone();
            return;
          }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) onDelta(parsed.content);
              if (parsed.error) onError(parsed.error);
              if (parsed.done) onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

/**
 * Запрашивает первое приветствие персонажа для пустого чата (POST /chats/:chatId/greeting).
 *
 * Персонаж пишет первым — стримит приветствие «в образе». Сохраняется только
 * ответ ассистента (на бэке). `lang` задаёт язык приветствия.
 *
 * @param {string} chatId - ID чата
 * @param {"en" | "ru"} lang - язык приветствия
 * @returns {AbortController} Контроллер для отмены
 */
export function streamGreeting(
  chatId: string,
  lang: "en" | "ru",
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string, code?: number, body?: any) => void,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  fetch(`${API_BASE}/chats/${chatId}/greeting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: JSON.stringify({ lang }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onError(err.error || err.message || res.statusText, res.status, err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line === "data: [DONE]") {
            onDone();
            return;
          }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) onDelta(parsed.content);
              if (parsed.error) onError(parsed.error);
              if (parsed.done) onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

/**
 * Перегенерирует AI-ответ для существующего сообщения (POST /chats/:chatId/messages/:messageId/regenerate).
 *
 * Удаляет старые сообщения начиная с messageId и стримит новый AI-ответ.
 * Используется кнопкой "Regenerate" в интерфейсе чата.
 *
 * @param {string} chatId - ID чата
 * @param {string} messageId - ID AI-сообщения для перегенерации
 * @param {(text: string) => void} onDelta - Коллбэк для каждого чанка
 * @param {() => void} onDone - Коллбэк при завершении
 * @param {(err: string, code?: number) => void} onError - Коллбэк при ошибке
 * @returns {AbortController} Контроллер для отмены
 */
export function streamRegenerate(
  chatId: string,
  messageId: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string, code?: number, body?: any) => void,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/regenerate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onError(err.error || err.message || res.statusText, res.status, err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line === "data: [DONE]") {
            onDone();
            return;
          }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) onDelta(parsed.content);
              if (parsed.error) onError(parsed.error);
              if (parsed.done) onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

// ─── Voice message helpers ──────────────────────────────────

/**
 * Отправляет голосовое сообщение и стримит AI-ответ (POST /chats/:chatId/voice).
 *
 * SSE-поток содержит два типа событий:
 * - `{"transcription":"..."}` — транскрипция голоса (STT-результат, приходит первым)
 * - `{"content":"..."}` — дельты AI-ответа (после транскрипции)
 *
 * Аудио отправляется как multipart/form-data (поле "audio", filename "recording.webm").
 *
 * @param {string} chatId - ID чата
 * @param {Blob} audioBlob - Аудиофайл (WebM формат)
 * @param {(text: string) => void} onTranscription - Коллбэк с текстом транскрипции
 * @param {(text: string) => void} onDelta - Коллбэк для каждого чанка AI-ответа
 * @param {() => void} onDone - Коллбэк при завершении
 * @param {(err: string, code?: number) => void} onError - Коллбэк при ошибке
 * @returns {AbortController} Контроллер для отмены
 */
export function streamVoiceMessage(
  chatId: string,
  audioBlob: Blob,
  onTranscription: (text: string) => void,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string, code?: number, body?: any) => void,
  language?: string,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  if (language) formData.append("language", language);

  fetch(`${API_BASE}/chats/${chatId}/voice`, {
    method: "POST",
    headers: {
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      // Content-Type не устанавливаем — браузер сам добавит boundary для multipart
    },
    body: formData,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Voice request failed" }));
        onError(err.error || err.message || res.statusText, res.status, err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line === "data: [DONE]") {
            onDone();
            return;
          }
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.transcription) onTranscription(parsed.transcription);
              if (parsed.content) onDelta(parsed.content);
              if (parsed.error) onError(parsed.error);
              if (parsed.done) onDone();
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}

/**
 * Запрашивает TTS для существующего сообщения (POST /chats/:chatId/messages/:messageId/tts).
 *
 * Возвращает ArrayBuffer с аудиоданными.
 * Если TTS уже был сгенерирован (Message.mediaUrl exists) — API возвращает его сразу.
 * Иначе — ставит задание в BullMQ и возвращает аудио после синтеза.
 *
 * @param {string} chatId - ID чата
 * @param {string} messageId - ID сообщения
 * @returns {Promise<ArrayBuffer>} Аудиоданные (MP3)
 * @throws {Error} При ошибке TTS
 */
export async function fetchTTS(
  chatId: string,
  messageId: string,
): Promise<ArrayBuffer> {
  const tokens = getTokens();
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/tts`, {
    method: "POST",
    headers: {
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "TTS failed" }));
    throw new Error(err.error || "TTS failed");
  }

  return res.arrayBuffer();
}

// ─── Generation API ─────────────────────────────────────────────────────────

export async function createImageJob(data: {
  prompt: string;
  model?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  provider?: string;
  generationStyle?: string;
  count?: number;
  initImageUrl?: string;
}) {
  return apiFetch<{ jobId: string; jobIds: string[]; status: string }>("/generation/image", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Загружает пользовательское медиа (image/video) в S3, возвращает ключ. */
export async function uploadMedia(file: File): Promise<{ key: string }> {
  const accessToken = (typeof window !== "undefined") ? localStorage.getItem("accessToken") : null;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/media/upload`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || res.statusText, body);
  }
  return res.json();
}

export async function getJobStatus(jobId: string) {
  return apiFetch<{
    jobId: string;
    status: string;
    output: { url?: string } | null;
    input: { prompt?: string; originalPrompt?: string; model?: string } | null;
    error: string | null;
    createdAt: string;
  }>(`/generation/jobs/${jobId}`);
}

export async function saveImageMessage(
  chatId: string,
  mediaUrl: string,
  poseName: string,
): Promise<Message> {
  return apiFetch<Message>(`/chats/${chatId}/image-message`, {
    method: "POST",
    body: JSON.stringify({
      content: `Generated image: ${poseName}`,
      mediaUrl,
      metadata: { poseName, type: "generated-image" },
    }),
  });
}

export async function getImageStyles() {
  return apiFetch<{ id: string; name: string; description: string; provider?: string }[]>(
    "/generation/image/styles",
  );
}

export async function createVideoJob(data: {
  prompt: string;
  model?: string;
  negativePrompt?: string;
  aspectRatio?: string;
  provider?: string;
  mode?: string;
  initImageKey?: string;
  initVideoKey?: string;
  count?: number;
}) {
  return apiFetch<{ jobId: string; jobIds: string[]; status: string }>("/generation/video", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getVideoStyles() {
  return apiFetch<{ id: string; name: string; description: string; provider?: string }[]>(
    "/generation/video/styles",
  );
}

export async function getGenerationHistory(type?: string) {
  const query = type ? `?type=${type}` : "";
  return apiFetch<
    {
      jobId: string;
      type: string;
      output: { url?: string } | null;
      input: { prompt?: string; originalPrompt?: string; model?: string } | null;
      createdAt: string;
    }[]
  >(`/generation/history${query}`);
}

export async function deleteGenerationJob(jobId: string) {
  return apiFetch<{ deleted: boolean }>(`/generation/jobs/${jobId}`, {
    method: "DELETE",
  });
}

export interface GalleryItem {
  jobId: string;
  type: string;
  output: { url?: string } | null;
  input: { prompt?: string; model?: string } | null;
  createdAt: string;
  user: { id: string; nickname: string | null; avatarUrl: string | null } | null;
}

export async function getPublicGallery(params?: {
  type?: string;
  sortBy?: string;
  page?: number;
  limit?: number;
  userId?: string;
  gender?: string;
  style?: string;
}): Promise<{ items: GalleryItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.type) query.set("type", params.type);
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.userId) query.set("userId", params.userId);
  if (params?.gender) query.set("gender", params.gender);
  if (params?.style) query.set("style", params.style);
  const qs = query.toString();
  return apiFetch<{ items: GalleryItem[]; total: number }>(`/generation/gallery${qs ? `?${qs}` : ""}`);
}

export async function getPublicShorts(params?: {
  sortBy?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: GalleryItem[]; total: number }> {
  const query = new URLSearchParams({ type: "video" });
  if (params?.sortBy) query.set("sortBy", params.sortBy);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  return apiFetch<{ items: GalleryItem[]; total: number }>(`/generation/gallery?${query.toString()}`);
}

export async function getGalleryTags(): Promise<{ tag: string; count: number }[]> {
  return apiFetch<{ tag: string; count: number }[]>("/generation/gallery/tags");
}

export async function getPublicGalleryItem(jobId: string): Promise<GalleryItem> {
  return apiFetch<GalleryItem>(`/generation/public/${jobId}`);
}

export interface UserLimitsResponse {
  subscription: string;
  limits: {
    characters: { used: number; limit: number | null };
    chatSessions: { used: number; limit: number | null };
    imageGenerations: { used: number; limit: number | null };
    videoGenerations: { used: number; limit: number | null };
  };
}

export async function getUserLimits(): Promise<UserLimitsResponse> {
  return apiFetch<UserLimitsResponse>("/users/me/limits");
}
