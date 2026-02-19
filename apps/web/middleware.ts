/**
 * @file apps/web/middleware.ts
 * @description Next.js Edge Middleware для маршрутизации и защиты страниц.
 *
 * Назначение:
 * - Запускается на Edge runtime до рендеринга каждой страницы
 * - Пропускает публичные маршруты и статику без проверок
 * - Предназначен для будущей server-side защиты маршрутов
 *
 * Текущее поведение (MVP):
 * - Публичные пути (/login, /register) и статика пропускаются без проверок
 * - Для остальных маршрутов также возвращается NextResponse.next()
 * - Авторизация проверяется на стороне клиента через AuthProvider (context/auth.tsx)
 *
 * Расширение для SSR-защиты:
 * - Токен можно читать из httpOnly cookie (если перенести с localStorage)
 * - Middleware может редиректить неавторизованных на /login
 * - Для admin-роутов можно проверять JWT-payload из cookie
 *
 * Matcher:
 * - Применяется ко всем маршрутам кроме: _next/static, _next/image, favicon.ico
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Пути, доступные без авторизации.
 * Совпадение проверяется через pathname.startsWith().
 */
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Edge Middleware функция — вызывается для каждого входящего запроса.
 *
 * Логика обхода (пропускаем без проверок):
 * - PUBLIC_PATHS (/login, /register)
 * - Next.js internals (/_next/*)
 * - API routes (/api/*)
 * - Статические файлы (любой путь с расширением: .ico, .png, .css, .js)
 *
 * @param {NextRequest} request - Входящий запрос от Next.js
 * @returns {NextResponse} Пропускает запрос дальше (NextResponse.next())
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // Статические файлы (.ico, .png, .js, .css, etc.)
  ) {
    return NextResponse.next();
  }

  // Check for access token in cookie (set by client-side JS)
  // Note: for MVP we rely on client-side auth check in AuthProvider.
  // This middleware provides an extra layer for SSR pages.
  return NextResponse.next();
}

/**
 * Конфигурация матчера для middleware.
 * Исключает статические ассеты Next.js чтобы не замедлять их загрузку.
 * Regex: все пути кроме _next/static, _next/image, favicon.ico.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
