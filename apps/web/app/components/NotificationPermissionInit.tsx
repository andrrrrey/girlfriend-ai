"use client";

/**
 * @file NotificationPermissionInit.tsx
 * @description Однократно запрашивает разрешение на браузерные уведомления после
 * первого взаимодействия пользователя (клик/нажатие). Многие браузеры требуют
 * пользовательский жест для показа промпта, поэтому не запрашиваем на голом
 * монтировании. Если разрешение уже выдано или отклонено — ничего не делаем.
 */

import { useEffect } from "react";
import { useAuth } from "../../context/auth";
import { isNotificationSupported, requestNotificationPermission } from "../../lib/browserNotify";

export default function NotificationPermissionInit() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return; // Запрашиваем только у залогиненных.
    if (!isNotificationSupported() || Notification.permission !== "default") return;

    const ask = () => {
      requestNotificationPermission().finally(cleanup);
    };
    const cleanup = () => {
      window.removeEventListener("click", ask);
      window.removeEventListener("keydown", ask);
    };
    window.addEventListener("click", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
    return cleanup;
  }, [user]);

  return null;
}
