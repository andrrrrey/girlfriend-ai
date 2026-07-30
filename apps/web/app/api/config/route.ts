export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
    // PostHog отдаётся клиенту в рантайме (как turnstileSiteKey), а не инлайнится в бандл.
    // Читаем POSTHOG_KEY без префикса NEXT_PUBLIC_ намеренно: обычные env-переменные
    // всегда читаются в рантайме сервера (в отличие от NEXT_PUBLIC_*, которые Next.js
    // может запечь на этапе next build). Это тот же ключ, что использует api (posthog-node),
    // поэтому в стеке достаточно одной переменной POSTHOG_KEY на все сервисы.
    posthogKey: process.env.POSTHOG_KEY ?? null,
    posthogHost: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
  });
}
