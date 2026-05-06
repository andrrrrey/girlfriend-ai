export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
  });
}
