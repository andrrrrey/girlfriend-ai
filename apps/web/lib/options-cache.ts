import {
  getCharacterOptions,
  getAppearanceOptions,
  getPoseOptions,
  getSceneOptions,
  getCameraOptions,
} from "./api";
import type {
  CharacterOption,
  AppearanceOptionsResponse,
  PoseOptionsResponse,
  SceneOptionsResponse,
  CameraOptionsResponse,
} from "./api";

// Опции редко меняются (правит только админ), поэтому кеш живёт дольше.
// localStorage переживает закрытие вкладки и перезагрузку.
const CACHE_TTL = 60 * 60 * 1000;

function getCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Превышен лимит localStorage — очищаем старые ключи кеша опций.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("gen:")) localStorage.removeItem(k);
      }
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
  }
}

export async function getCachedCharacterOptions(): Promise<CharacterOption[]> {
  const cached = getCached<CharacterOption[]>("gen:characterOptions");
  if (cached) return cached;
  const data = await getCharacterOptions();
  setCache("gen:characterOptions", data);
  return data;
}

export async function getCachedAppearanceOptions(): Promise<AppearanceOptionsResponse> {
  const cached = getCached<AppearanceOptionsResponse>("gen:appearanceOptions");
  if (cached) return cached;
  const data = await getAppearanceOptions();
  setCache("gen:appearanceOptions", data);
  return data;
}

export async function getCachedPoseOptions(): Promise<PoseOptionsResponse> {
  const cached = getCached<PoseOptionsResponse>("gen:poseOptions");
  if (cached) return cached;
  const data = await getPoseOptions();
  setCache("gen:poseOptions", data);
  return data;
}

export async function getCachedSceneOptions(): Promise<SceneOptionsResponse> {
  const cached = getCached<SceneOptionsResponse>("gen:sceneOptions");
  if (cached) return cached;
  const data = await getSceneOptions();
  setCache("gen:sceneOptions", data);
  return data;
}

export async function getCachedCameraOptions(): Promise<CameraOptionsResponse> {
  const cached = getCached<CameraOptionsResponse>("gen:cameraOptions");
  if (cached) return cached;
  const data = await getCameraOptions();
  setCache("gen:cameraOptions", data);
  return data;
}

// ─── Фоновый prefetch картинок ────────────────────────────────

type OptionLike = {
  imageThumbUrl?: string | null;
  imageFullUrl?: string | null;
  imageUrl?: string | null;
};

function collectUrls(value: unknown, acc: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) collectUrls(v, acc);
    return;
  }
  if (typeof value === "object") {
    const opt = value as OptionLike & { options?: unknown };
    if (opt.imageThumbUrl) acc.add(opt.imageThumbUrl);
    // base64 data: URI не имеет смысла предзагружать.
    if (opt.imageUrl && !opt.imageUrl.startsWith("data:")) acc.add(opt.imageUrl);
    if (opt.options) collectUrls(opt.options, acc);
    // Обходим прочие вложенные массивы (например, OUTFITS/OUTFIT_DETAILS).
    for (const v of Object.values(opt as Record<string, unknown>)) {
      if (Array.isArray(v)) collectUrls(v, acc);
    }
  }
}

const prefetched = new Set<string>();

function schedule(cb: () => void) {
  if (typeof window === "undefined") return;
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb);
  } else {
    setTimeout(cb, 0);
  }
}

/**
 * Стартует фоновую подгрузку картинок: только thumb-версии,
 * чтобы попап потом открывался мгновенно. Service Worker сам положит в кеш.
 */
export function prefetchOptionImages(data: unknown): void {
  if (typeof window === "undefined") return;
  const urls = new Set<string>();
  collectUrls(data, urls);
  for (const url of urls) {
    if (prefetched.has(url)) continue;
    prefetched.add(url);
    schedule(() => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.src = url;
    });
  }
}
