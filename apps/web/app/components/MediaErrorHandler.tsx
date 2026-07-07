"use client";

import { useEffect } from "react";

/**
 * Глобальный обработчик битых медиа-картинок.
 *
 * В консоли ловились «Failed to load resource: 404» от наших /media/*-ссылок
 * (протухший результат генерации, пропавший ключ S3, устаревший внешний URL).
 * Вместо визуального мусора (сломанная иконка картинки) помечаем такой <img>
 * классом .media-broken — CSS показывает нейтральный плейсхолдер-фон.
 *
 * Слушатель вешается один раз в capture-фазе на document, поэтому покрывает
 * все <img> приложения без правок в каждом компоненте.
 */
export default function MediaErrorHandler() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLImageElement)) return;
      const src = target.currentSrc || target.src;
      if (!src || !src.includes("/media/")) return;
      // Защита от циклов: помечаем один раз.
      if (target.dataset.mediaFallback === "1") return;
      target.dataset.mediaFallback = "1";
      target.classList.add("media-broken");
    };
    // capture=true — событие error не всплывает, ловим на фазе перехвата.
    document.addEventListener("error", handler, true);
    return () => document.removeEventListener("error", handler, true);
  }, []);
  return null;
}
