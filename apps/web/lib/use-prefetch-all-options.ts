"use client";

import { useEffect } from "react";
import {
  getCachedAppearanceOptions,
  getCachedCameraOptions,
  getCachedCharacterOptions,
  getCachedPoseOptions,
  getCachedSceneOptions,
  prefetchOptionImages,
} from "./options-cache";

function schedule(cb: () => void, timeout = 2000) {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout });
  } else {
    setTimeout(cb, 200);
  }
}

let started = false;

/**
 * Стартует фоновую подгрузку всех опций и их картинок после логина.
 * Идемпотентно — запускается один раз за жизнь приложения.
 */
export function usePrefetchAllOptions(enabled: boolean) {
  useEffect(() => {
    if (!enabled || started) return;
    started = true;
    schedule(() => {
      void (async () => {
        const tasks: Array<Promise<unknown>> = [
          getCachedCharacterOptions().then(prefetchOptionImages),
          getCachedAppearanceOptions().then(prefetchOptionImages),
          getCachedPoseOptions().then(prefetchOptionImages),
          getCachedSceneOptions().then(prefetchOptionImages),
          getCachedCameraOptions().then(prefetchOptionImages),
        ];
        await Promise.allSettled(tasks);
      })();
    });
  }, [enabled]);
}
