/**
 * @file apps/web/lib/browserNotify.ts
 * @description Тонкая обёртка над Web Notifications API для уведомлений о
 * готовых генерациях и новых сообщениях в чате.
 *
 * - Работает только на клиенте и только при поддержке Notification API.
 * - Ничего не показывает без выданного разрешения (permission === "granted").
 * - Клик по уведомлению фокусирует вкладку и (опционально) открывает URL.
 */

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Текущее состояние разрешения (или "denied", если API не поддерживается). */
export function notificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/**
 * Запрашивает разрешение, если оно ещё не выдано и не отклонено.
 * Возвращает итоговое состояние.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }
  return Notification.permission;
}

/**
 * Показывает браузерное уведомление, если разрешение выдано. `tag` схлопывает
 * повторные уведомления одной сущности. `url` открывается по клику.
 */
export function showBrowserNotification(
  title: string,
  opts?: { body?: string; tag?: string; url?: string },
): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: opts?.body,
      tag: opts?.tag,
    });
    if (opts?.url) {
      n.onclick = () => {
        try { window.focus(); } catch {}
        window.location.href = opts.url!;
        n.close();
      };
    }
  } catch {
    /* Notification может бросить в некоторых окружениях — не критично */
  }
}
