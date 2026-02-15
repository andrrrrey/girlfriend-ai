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
