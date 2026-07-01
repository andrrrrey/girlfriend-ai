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

  /** `GET /blog?page=&limit=&category=&sort=` — опубликованные записи для каталога. */
  @Get()
  async list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("category") category?: string,
    @Query("sort") sort?: string,
  ) {
    return this.blog.listPublic({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      sort,
    });
  }

  /** `GET /blog/:slug` — одна опубликованная запись по slug (404, если нет). */
  @Get(":slug")
  async getBySlug(@Param("slug") slug: string) {
    return this.blog.getPublicBySlug(slug);
  }
}
