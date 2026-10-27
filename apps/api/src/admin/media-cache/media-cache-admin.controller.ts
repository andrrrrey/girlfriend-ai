/**
 * @file media-cache-admin.controller.ts
 * @description Общий кэш медиа в админке (роль admin).
 *
 *   GET   /admin/media-cache/stats?days=30   — выдачи generated/cache/coalesced, hit rate
 *   GET   /admin/media-cache/assets          — варианты пула (новые сверху)
 *   PATCH /admin/media-cache/assets/:id      — { moderation: "ok" | "blocked" }
 */

import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../../auth/guards/roles.guard";
import { MediaCacheService } from "../../generation/media-cache.service";

@ApiTags("admin-media-cache")
@ApiBearerAuth()
@Controller("admin/media-cache")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class MediaCacheAdminController {
  constructor(private readonly cache: MediaCacheService) {}

  @ApiOperation({ summary: "Media cache stats" })
  @Get("stats")
  async stats(@Query("days") days?: string) {
    const n = parseInt(days ?? "", 10);
    return this.cache.stats(Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 30);
  }

  @ApiOperation({ summary: "Cached media variants" })
  @Get("assets")
  async assets(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("moderation") moderation?: string,
    @Query("kind") kind?: string,
  ) {
    return this.cache.listAssets({
      page: parseInt(page ?? "", 10) || 1,
      limit: parseInt(limit ?? "", 10) || 40,
      moderation: moderation === "ok" || moderation === "blocked" ? moderation : undefined,
      kind: kind === "image" || kind === "video" ? kind : undefined,
    });
  }

  @ApiOperation({ summary: "Block or unblock a cached variant" })
  @Patch("assets/:id")
  async moderate(@Param("id", ParseUUIDPipe) id: string, @Body() body: { moderation?: string }) {
    if (body?.moderation !== "ok" && body?.moderation !== "blocked") {
      throw new BadRequestException("moderation must be ok or blocked");
    }
    return this.cache.setModeration(id, body.moderation);
  }
}
