"use client";

/**
 * @file apps/web/context/posthog.tsx
 * @description Клиентский провайдер PostHog для продуктовой аналитики (Next.js App Router).
 *
 * Ключевое отличие от «стандартной» интеграции: ключ НЕ берётся из process.env на этапе
 * next build (NEXT_PUBLIC_* инлайнятся в бандл и потребовали бы Docker build-arg в CI).
 * Вместо этого конфиг запрашивается в рантайме с /api/config — ровно тем же способом,
 * что и turnstileSiteKey (см. app/api/config/route.ts и app/login|register). Благодаря
 * этому переменные доставляются в web-контейнер так же, как NEXT_PUBLIC_TURNSTILE_SITE_KEY,
 * и не нужно менять CI-шаблон сборки.
 *
 * Что делает:
 * - Один раз тянет { posthogKey, posthogHost } с /api/config и инициализирует posthog-js
 *   (только в браузере и только если ключ задан; иначе аналитика полностью выключена).
 * - Вручную шлёт $pageview при смене маршрута (в App Router автотрекинг не срабатывает
 *   на клиентской навигации).
 * - identify()/reset() по состоянию useAuth(): при появлении пользователя привязывает
 *   distinct_id = User.id (склейка с серверными событиями posthog-node), при логауте сбрасывает.
 *   Провайдер монтируется ВНУТРИ AuthProvider (см. app/layout.tsx), поэтому useAuth() доступен.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useAuth } from "./auth";

/** Отправляет $pageview при каждой смене пути/query. Активен только после init posthog. */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!posthog.__loaded) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Реагирует на состояние аутентификации: identify при появлении пользователя, reset при выходе.
 * Race-free: срабатывает и когда posthog инициализировался позже, чем загрузился профиль.
 */
function IdentitySync({ ready }: { ready: boolean }) {
  const { user } = useAuth();
  const wasIdentified = useRef(false);

  useEffect(() => {
    if (!ready || !posthog.__loaded) return;
    if (user) {
      posthog.identify(user.id, {
        role: user.role,
        subscription: user.subscription,
        lang: user.lang,
        content_mode: user.contentMode,
        is_adult: user.isAdult,
      });
      wasIdentified.current = true;
    } else if (wasIdentified.current) {
      // Сбрасываем distinct_id только после реального логаута (а не на первом рендере гостя).
      posthog.reset();
      wasIdentified.current = false;
    }
  }, [ready, user]);

  return null;
}

/**
 * Провайдер PostHog. Тянет конфиг с /api/config, инициализирует posthog-js в рантайме.
 * Если ключ не задан — рендерит детей без аналитики (полный no-op).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: { posthogKey: string | null; posthogHost?: string }) => {
        if (cancelled || !cfg.posthogKey) return;
        if (!posthog.__loaded) {
          posthog.init(cfg.posthogKey, {
            api_host: cfg.posthogHost || "https://eu.i.posthog.com",
            capture_pageview: false, // pageview шлём вручную (PageviewTracker)
            person_profiles: "identified_only",
          });
        }
        setReady(true);
      })
      .catch(() => {
        /* конфиг недоступен — аналитика просто не включится, приложение не ломаем */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PHProvider client={posthog}>
      {/* Suspense обязателен: useSearchParams иначе де-оптимизирует статические
          страницы в client-side рендеринг и ломает next build. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentitySync ready={ready} />
      {children}
    </PHProvider>
  );
}
