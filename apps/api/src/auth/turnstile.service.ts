import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "@repo/config";

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secretKey: string | undefined;

  constructor() {
    this.secretKey = loadEnv().TURNSTILE_SECRET_KEY;
  }

  /** Верифицирует Turnstile токен. Возвращает true если капча пройдена или не настроена. */
  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    if (!this.secretKey) {
      return true; // graceful degradation если Turnstile не настроен
    }

    if (!token) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        secret: this.secretKey,
        response: token,
      });
      if (ip) params.set("remoteip", ip);

      const res = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        },
      );

      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch (err) {
      this.logger.error({ err }, "turnstile_verify_error");
      return false;
    }
  }
}
