const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function getTokens(): TokenPair | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem("accessToken");
  const refreshToken = localStorage.getItem("refreshToken");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function saveTokens(tokens: TokenPair) {
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
}

function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

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

  // If 401, try refreshing the token once
  if (res.status === 401 && tokens?.refreshToken) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      headers["Authorization"] = `Bearer ${newAccessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const auth = {
  async register(email: string, password: string): Promise<TokenPair> {
    const data = await apiFetch<TokenPair>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveTokens(data);
    return data;
  },

  async login(email: string, password: string): Promise<TokenPair> {
    const data = await apiFetch<TokenPair>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveTokens(data);
    return data;
  },

  async logout(): Promise<void> {
    const tokens = getTokens();
    if (tokens?.refreshToken) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => {});
    }
    clearTokens();
  },

  isAuthenticated(): boolean {
    return !!getTokens()?.accessToken;
  },
};

export interface UserProfile {
  id: string;
  email: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  subscription: string;
  lang: string;
  createdAt: string;
  socialLinks: { provider: string; url: string }[];
}

export const users = {
  async getProfile(): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me");
  },

  async updateProfile(
    data: Partial<Pick<UserProfile, "nickname" | "avatarUrl" | "lang">>,
  ): Promise<UserProfile> {
    return apiFetch<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    return apiFetch("/users/me/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async upsertSocialLink(
    provider: string,
    url: string,
  ): Promise<{ provider: string; url: string }> {
    return apiFetch("/users/me/social-links", {
      method: "PUT",
      body: JSON.stringify({ provider, url }),
    });
  },

  async deleteSocialLink(provider: string): Promise<void> {
    return apiFetch(`/users/me/social-links/${provider}`, {
      method: "DELETE",
    });
  },
};

// ─── Admin API ───────────────────────────────────────────────

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  name: string;
  systemPrompt: string;
  personality: Record<string, unknown>;
  avatarUrl: string | null;
  voiceId: string | null;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
}

export const admin = {
  async getSettings(): Promise<AppSetting[]> {
    return apiFetch<AppSetting[]>("/admin/settings");
  },

  async upsertSettings(settings: Record<string, string>): Promise<AppSetting[]> {
    return apiFetch<AppSetting[]>("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    });
  },

  async getCharacters(): Promise<Character[]> {
    return apiFetch<Character[]>("/admin/characters");
  },

  async getCharacter(id: string): Promise<Character> {
    return apiFetch<Character>(`/admin/characters/${id}`);
  },

  async createCharacter(data: Partial<Character>): Promise<Character> {
    return apiFetch<Character>("/admin/characters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateCharacter(id: string, data: Partial<Character>): Promise<Character> {
    return apiFetch<Character>(`/admin/characters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async deleteCharacter(id: string): Promise<void> {
    return apiFetch(`/admin/characters/${id}`, { method: "DELETE" });
  },
};

// ─── Chat API ────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  title: string | null;
  character: { id: string; name: string; avatarUrl: string | null };
  lastMessage: { content: string; role: string; createdAt: string } | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const chats = {
  async create(characterId: string, title?: string): Promise<ChatSession> {
    return apiFetch<ChatSession>("/chats", {
      method: "POST",
      body: JSON.stringify({ characterId, title }),
    });
  },

  async list(cursor?: string): Promise<{ items: ChatSession[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : "";
    return apiFetch(`/chats${params}`);
  },

  async get(id: string) {
    return apiFetch(`/chats/${id}`);
  },

  async update(id: string, title: string) {
    return apiFetch(`/chats/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },

  async remove(id: string): Promise<void> {
    return apiFetch(`/chats/${id}`, { method: "DELETE" });
  },

  async getMessages(
    chatId: string,
    cursor?: string,
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    const params = cursor ? `?cursor=${cursor}` : "";
    return apiFetch(`/chats/${chatId}/messages${params}`);
  },

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return apiFetch(`/chats/${chatId}/messages/${messageId}`, {
      method: "DELETE",
    });
  },
};

export const characters = {
  async listPublic(): Promise<Character[]> {
    return apiFetch<Character[]>("/characters");
  },
};

// ─── SSE streaming helper ────────────────────────────────────

export function streamMessage(
  chatId: string,
  content: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
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
        onError(err.error || res.statusText);
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
              // ignore
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

export function streamRegenerate(
  chatId: string,
  messageId: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
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
        onError(err.error || res.statusText);
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
              // ignore
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

export function streamVoiceMessage(
  chatId: string,
  audioBlob: Blob,
  onTranscription: (text: string) => void,
  onDelta: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();
  const tokens = getTokens();

  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  fetch(`${API_BASE}/chats/${chatId}/voice`, {
    method: "POST",
    headers: {
      ...(tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: formData,
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Voice request failed" }));
        onError(err.error || res.statusText);
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
              // ignore
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
