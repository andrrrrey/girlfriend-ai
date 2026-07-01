/**
 * @file blog.service.ts
 * @description Бизнес-логика блога: публичное чтение (каталог + запись по slug)
 * и админский CRUD. Slug генерится автоматически из заголовка, HTML-тело
 * санитизируется, excerpt при отсутствии — автозаполняется из тела.
 * Удаление мягкое (soft-delete через `deletedAt`), как у персонажей.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import { excerptFromHtml, sanitizeBlogHtml, uniqueBlogSlug } from "./blog-seo";

/** Допустимые категории записи. "All" — это фильтр «без категории», не значение. */
export const BLOG_CATEGORIES = ["News", "Updates", "AI", "Relationship"] as const;
const DEFAULT_CATEGORY = "News";

/** Приводит присланную категорию к допустимой; иначе — дефолт. */
function normalizeCategory(value?: string): string {
  if (!value) return DEFAULT_CATEGORY;
  const match = BLOG_CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  return match ?? DEFAULT_CATEGORY;
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public ────────────────────────────────────────────────

  /**
   * Публичный каталог опубликованных записей: фильтр по категории, сортировка
   * (new = новые первыми, old = старые первыми) и постраничная выдача.
   */
  async listPublic(opts?: {
    page?: number;
    limit?: number;
    category?: string;
    sort?: string;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const pageSize = Math.min(Math.max(opts?.limit ?? 8, 1), 48);
    const page = Math.max(1, opts?.page ?? 1);
    const category =
      opts?.category && BLOG_CATEGORIES.some((c) => c.toLowerCase() === opts.category!.toLowerCase())
        ? BLOG_CATEGORIES.find((c) => c.toLowerCase() === opts.category!.toLowerCase())
        : undefined;
    const dir: Prisma.SortOrder = opts?.sort === "old" ? "asc" : "desc";

    const where: Prisma.BlogPostWhereInput = {
      deletedAt: null,
      isPublished: true,
      ...(category ? { category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: [{ publishedAt: dir }, { createdAt: dir }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Одна опубликованная запись по slug. 404, если не найдена. */
  async getPublicBySlug(slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, deletedAt: null, isPublished: true },
    });
    if (!post) throw new NotFoundException("Blog post not found");
    return post;
  }

  // ─── Admin ─────────────────────────────────────────────────

  /** Все записи (включая черновики), кроме удалённых — для админ-списка. */
  async listAll() {
    return this.prisma.blogPost.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
    });
    if (!post) throw new NotFoundException("Blog post not found");
    return post;
  }

  async create(dto: CreateBlogPostDto) {
    const slug = await uniqueBlogSlug(this.prisma, dto.title);
    const content = sanitizeBlogHtml(dto.content);
    const excerpt = (dto.excerpt && dto.excerpt.trim()) || excerptFromHtml(content);
    const isPublished = dto.isPublished ?? false;
    return this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        content,
        excerpt,
        category: normalizeCategory(dto.category),
        coverImageUrl: dto.coverImageUrl,
        tags: dto.tags ?? [],
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });
  }

  async update(id: string, dto: UpdateBlogPostDto) {
    const existing = await this.getById(id);

    const data: Prisma.BlogPostUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = sanitizeBlogHtml(dto.content);
    if (dto.category !== undefined) data.category = normalizeCategory(dto.category);
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.tags !== undefined) data.tags = dto.tags;

    // excerpt: если задан вручную — используем его; если пришло новое тело, а
    // excerpt пуст — перегенерируем из свежего контента.
    if (dto.excerpt !== undefined && dto.excerpt.trim()) {
      data.excerpt = dto.excerpt.trim();
    } else if (dto.content !== undefined && (dto.excerpt === undefined || !dto.excerpt.trim())) {
      data.excerpt = excerptFromHtml(sanitizeBlogHtml(dto.content));
    }

    // Публикация: при переходе в published впервые — фиксируем publishedAt.
    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
      if (dto.isPublished && !existing.publishedAt) {
        data.publishedAt = new Date();
      }
    }

    return this.prisma.blogPost.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.getById(id);
    return this.prisma.blogPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
