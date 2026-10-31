/**
 * @file internal-auth.guard.ts
 * @description Защита /internal/* общим секретом INTERNAL_API_TOKEN.
 *
 * Без настроенного токена запросы пропускаются только при ENV=development и
 * ENV=test. В остальных средах guard закрыт: отсутствие секрета не должно
 * открывать настройки и ключи из app_settings.
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { INTERNAL_TOKEN_HEADER, loadEnv } from "@repo/config";

const OPEN_WITHOUT_TOKEN = new Set(["development", "test"]);

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly env = loadEnv();

  canActivate(context: ExecutionContext): boolean {
    const expected = this.env.INTERNAL_API_TOKEN;
    if (!expected) {
      if (OPEN_WITHOUT_TOKEN.has(this.env.ENV)) return true;
      throw new UnauthorizedException();
    }

    const provided = context.switchToHttp().getRequest().headers[INTERNAL_TOKEN_HEADER];
    // Сравниваем хеши: timingSafeEqual требует буферы одинаковой длины.
    if (typeof provided !== "string" || !timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
