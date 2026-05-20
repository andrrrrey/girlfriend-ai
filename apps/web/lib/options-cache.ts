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

const CACHE_TTL = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(key);
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
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
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
