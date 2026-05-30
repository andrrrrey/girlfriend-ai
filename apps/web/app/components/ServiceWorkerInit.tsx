"use client";

import { useEffect } from "react";

export default function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Регистрируем SW и в dev, и в prod — нам важно ускорить
    // повторные открытия попапов выбора в обоих режимах.
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Тихо игнорируем — отсутствие SW не должно ломать приложение.
    });
  }, []);
  return null;
}
