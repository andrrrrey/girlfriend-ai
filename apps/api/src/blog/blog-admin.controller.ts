/**
 * @file blog-admin.controller.ts
 * @description Административные маршруты блога (`/admin/blog-posts`). Полный CRUD
 * над записями, доступен только пользователям с ролью `admin`
 * (JwtAuthGuard + RolesGuard), как и остальной админ-раздел.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../auth/guards/roles.guard";
import { BlogService } from "./blog.service";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";

@Controller("admin/blog-posts")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  /** `GET /admin/blog-posts` — все записи, включая черновики (кроме удалённых). */
  @Get()
  async list() {
    return this.blog.listAll();
  }

  /** `GET /admin/blog-posts/:id` */
  @Get(":id")
  async get(@Param("id") id: string) {
    return this.blog.getById(id);
  }

  /** `POST /admin/blog-posts` — создать запись (slug + excerpt автогенерятся). */
  @Post()
  async create(@Body() dto: CreateBlogPostDto) {
    return this.blog.create(dto);
  }

  /** `PATCH /admin/blog-posts/:id` — частичное обновление. */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blog.update(id, dto);
  }

  /** `DELETE /admin/blog-posts/:id` — мягкое удаление. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.blog.remove(id);
  }
}
