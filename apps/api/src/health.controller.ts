import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@repo/types";

@Controller()
export class HealthController {
  @Get("/health")
  health(): HealthResponse {
    return { ok: true, service: "api" };
  }
}
