/**
 * @file blog.controller.ts
 * @description Публичные (без аутентификации) маршруты блога, используемые
 * серверными SEO-страницами `/blog` и `/blog/[slug]` во фронтенде.
 */

import { Controller, Get, Param, Query } from "@nestjs/common";
import { BlogService } from "./blog.service";

@Controller("blog")
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  /** `GET /blog?limit=60` — опубликованные записи для каталога. */
  @Get()
  async list(@Query("limit") limit?: string) {
    return this.blog.listPublic(limit ? parseInt(limit, 10) : 60);
  }

  /** `GET /blog/:slug` — одна опубликованная запись по slug (404, если нет). */
  @Get(":slug")
  async getBySlug(@Param("slug") slug: string) {
    return this.blog.getPublicBySlug(slug);
  }
}
