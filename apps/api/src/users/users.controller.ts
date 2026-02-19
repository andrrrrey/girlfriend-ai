/**
 * @file users.controller.ts
 * @description HTTP-контроллер для управления профилем текущего пользователя.
 *
 * Все эндпоинты работают с "me" — текущим авторизованным пользователем.
 * ID пользователя берётся из req.user.id (установлен JwtStrategy.validate()).
 * Защищены JwtAuthGuard на уровне контроллера.
 *
 * Маршруты:
 * - GET    /users/me                      — получить профиль
 * - PATCH  /users/me                      — обновить профиль (nickname, avatarUrl, lang)
 * - PATCH  /users/me/password             — сменить пароль (204 No Content)
 * - GET    /users/me/social-links         — список социальных ссылок
 * - PUT    /users/me/social-links         — добавить/обновить соц. ссылку
 * - DELETE /users/me/social-links/:provider — удалить соц. ссылку (204 No Content)
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
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpsertSocialLinkDto } from "./dto/upsert-social-link.dto";

/**
 * Контроллер профиля пользователя.
 * Все операции — только над профилем текущего аутентифицированного пользователя.
 */
@ApiTags("users")
@ApiBearerAuth() // Swagger: добавляет кнопку для ввода JWT-токена
@Controller("users")
@UseGuards(JwtAuthGuard) // Защищает весь контроллер
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Возвращает полный профиль включая социальные ссылки.
   */
  @ApiOperation({ summary: "Get current user profile" })
  @Get("me")
  async getProfile(@Req() req: any) {
    // req.user.id устанавливается JwtStrategy.validate() из JWT sub claim
    return this.usersService.getProfile(req.user.id);
  }

  /**
   * PATCH /users/me
   * Частичное обновление профиля. Можно передать только изменившиеся поля.
   */
  @ApiOperation({ summary: "Update user profile" })
  @Patch("me")
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  /**
   * PATCH /users/me/password
   * Смена пароля с подтверждением текущего. Возвращает 204 No Content.
   */
  @ApiOperation({ summary: "Change password" })
  @Patch("me/password")
  @HttpCode(HttpStatus.NO_CONTENT) // Успешная смена пароля — пустой ответ
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * GET /users/me/social-links
   * Список социальных ссылок пользователя.
   */
  @ApiOperation({ summary: "Get social links" })
  @Get("me/social-links")
  async getSocialLinks(@Req() req: any) {
    return this.usersService.getSocialLinks(req.user.id);
  }

  /**
   * PUT /users/me/social-links
   * Upsert: создаёт или обновляет ссылку на соц. сеть.
   * Провайдер (vk, instagram, x) уникален для каждого пользователя.
   */
  @ApiOperation({ summary: "Create or update a social link" })
  @Put("me/social-links")
  async upsertSocialLink(@Req() req: any, @Body() dto: UpsertSocialLinkDto) {
    return this.usersService.upsertSocialLink(req.user.id, dto.provider, dto.url);
  }

  /**
   * DELETE /users/me/social-links/:provider
   * Удаляет ссылку на указанную соц. сеть. Возвращает 204 No Content.
   *
   * @param provider — "vk" | "instagram" | "x"
   */
  @ApiOperation({ summary: "Delete a social link" })
  @Delete("me/social-links/:provider")
  @HttpCode(HttpStatus.NO_CONTENT) // Успешное удаление — пустой ответ
  async deleteSocialLink(@Req() req: any, @Param("provider") provider: string) {
    await this.usersService.deleteSocialLink(req.user.id, provider);
  }
}
