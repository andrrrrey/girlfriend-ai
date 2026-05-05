/**
 * @file admin.controller.ts
 * @description HTTP-контроллер административного раздела API.
 *
 * Все маршруты данного контроллера доступны только аутентифицированным
 * пользователям с ролью `admin`. Защита обеспечивается двумя guard-ами,
 * применёнными на уровне класса:
 * - {@link JwtAuthGuard} — проверяет валидность JWT-токена в заголовке `Authorization`.
 * - {@link RolesGuard} + `@Roles("admin")` — проверяет, что роль из токена равна `"admin"`.
 *
 * Базовый путь всех маршрутов: `/admin`.
 *
 * Маршруты сгруппированы по трём доменам:
 * - `/admin/settings`   — управление глобальными настройками приложения.
 * - `/admin/characters` — CRUD AI-персонажей.
 * - `/admin/users`      — управление учётными записями пользователей.
 *
 * Вся бизнес-логика делегируется {@link AdminService}.
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
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../auth/guards/roles.guard";
import { AdminService } from "./admin.service";
import { UpsertSettingsDto } from "./dto/upsert-settings.dto";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { UpdateCharacterDto } from "./dto/update-character.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateCharacterOptionDto } from "./dto/create-character-option.dto";
import { UpdateCharacterOptionDto } from "./dto/update-character-option.dto";
import { CreateAppearanceCategoryDto } from "./dto/create-appearance-category.dto";
import { UpdateAppearanceCategoryDto } from "./dto/update-appearance-category.dto";
import { CreateAppearanceOptionDto } from "./dto/create-appearance-option.dto";
import { UpdateAppearanceOptionDto } from "./dto/update-appearance-option.dto";
import { CreatePoseCategoryDto } from "./dto/create-pose-category.dto";
import { UpdatePoseCategoryDto } from "./dto/update-pose-category.dto";
import { CreatePoseOptionDto } from "./dto/create-pose-option.dto";
import { UpdatePoseOptionDto } from "./dto/update-pose-option.dto";
import { CreateSceneCategoryDto } from "./dto/create-scene-category.dto";
import { UpdateSceneCategoryDto } from "./dto/update-scene-category.dto";
import { CreateSceneOptionDto } from "./dto/create-scene-option.dto";
import { UpdateSceneOptionDto } from "./dto/update-scene-option.dto";

/**
 * Контроллер административного раздела.
 *
 * Предоставляет REST API для управления тремя ключевыми сущностями:
 * настройками приложения, AI-персонажами и пользователями.
 * Весь контроллер защищён `JwtAuthGuard` и `RolesGuard` с требованием роли `admin`,
 * поэтому обычные пользователи не имеют доступа ни к одному из маршрутов.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  /**
   * @param adminService — сервис, реализующий бизнес-логику администрирования.
   */
  constructor(private readonly adminService: AdminService) {}

  // ─── Settings ──────────────────────────────────────────────

  /**
   * Возвращает все глобальные настройки приложения.
   *
   * `GET /admin/settings`
   *
   * Настройки включают конфигурацию сторонних сервисов (OpenAI, ElevenLabs и др.)
   * и другие рантаймовые параметры.
   *
   * @returns Массив всех записей `AppSetting`, упорядоченных по ключу.
   */
  @Get("settings")
  async getSettings() {
    return this.adminService.getAllSettings();
  }

  /**
   * Массово создаёт или обновляет настройки приложения.
   *
   * `PUT /admin/settings`
   *
   * Принимает объект вида `{ settings: { KEY: "value", ... } }`.
   * Операция является идемпотентной: если ключ уже существует — значение
   * обновляется, если нет — создаётся новая запись. Все изменения применяются
   * атомарно в рамках одной транзакции.
   *
   * @param dto — тело запроса, содержащее карту настроек для обновления.
   * @returns Массив обновлённых/созданных записей `AppSetting`.
   */
  @Put("settings")
  async upsertSettings(@Body() dto: UpsertSettingsDto) {
    return this.adminService.upsertSettings(dto.settings);
  }

  // ─── Characters ────────────────────────────────────────────

  /**
   * Возвращает список всех активных AI-персонажей.
   *
   * `GET /admin/characters`
   *
   * Мягко удалённые персонажи (с заполненным `deletedAt`) не включаются
   * в результат. Список отсортирован от новых к старым.
   *
   * @returns Массив записей `Character`.
   */
  @Get("characters")
  async getCharacters() {
    return this.adminService.getCharacters();
  }

  /**
   * Возвращает одного AI-персонажа по идентификатору.
   *
   * `GET /admin/characters/:id`
   *
   * @param id — UUID персонажа (path-параметр).
   * @returns Запись `Character`.
   * @throws {NotFoundException} Если персонаж не найден (HTTP 404).
   */
  @Get("characters/:id")
  async getCharacter(@Param("id") id: string) {
    return this.adminService.getCharacter(id);
  }

  /**
   * Создаёт нового AI-персонажа.
   *
   * `POST /admin/characters`
   *
   * Обязательные поля: `name` и `systemPrompt`. Остальные поля опциональны.
   * Возвращает созданную запись с присвоенным UUID и временными метками.
   *
   * @param dto — валидированные данные нового персонажа.
   * @returns Созданная запись `Character` (HTTP 201).
   */
  @Post("characters")
  async createCharacter(@Body() dto: CreateCharacterDto) {
    return this.adminService.createCharacter(dto);
  }

  /**
   * Частично обновляет существующего AI-персонажа.
   *
   * `PATCH /admin/characters/:id`
   *
   * Передаются только изменяемые поля — остальные остаются без изменений.
   *
   * @param id  — UUID персонажа (path-параметр).
   * @param dto — частичные данные для обновления.
   * @returns Обновлённая запись `Character`.
   * @throws {NotFoundException} Если персонаж не найден (HTTP 404).
   */
  @Patch("characters/:id")
  async updateCharacter(
    @Param("id") id: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.adminService.updateCharacter(id, dto);
  }

  /**
   * Мягко удаляет AI-персонажа.
   *
   * `DELETE /admin/characters/:id`
   *
   * Физического удаления из БД не происходит: устанавливается `deletedAt`.
   * После удаления персонаж перестаёт быть доступен для обычных пользователей.
   *
   * @param id — UUID персонажа (path-параметр).
   * @returns Пустое тело ответа (HTTP 204 No Content).
   * @throws {NotFoundException} Если персонаж не найден (HTTP 404).
   */
  @Delete("characters/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCharacter(@Param("id") id: string) {
    await this.adminService.deleteCharacter(id);
  }

  // ─── Users ─────────────────────────────────────────────────

  /**
   * Возвращает постраничный список пользователей.
   *
   * `GET /admin/users`
   *
   * Поддерживает поиск по `email` и `nickname`, а также стандартные параметры
   * пагинации `limit` и `offset`. Мягко удалённые пользователи не включаются.
   *
   * @param search — строка для поиска (query-параметр, необязательно).
   * @param limit  — количество записей на странице (query-параметр, по умолчанию 50).
   * @param offset — смещение (query-параметр, по умолчанию 0).
   * @returns Объект `{ users: User[], total: number }`.
   */
  @Get("users")
  async getUsers(
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.adminService.getUsers({
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * Возвращает одного пользователя по идентификатору.
   *
   * `GET /admin/users/:id`
   *
   * Возвращает только безопасные поля (без хэша пароля и т.п.).
   *
   * @param id — UUID пользователя (path-параметр).
   * @returns Объект пользователя.
   * @throws {NotFoundException} Если пользователь не найден (HTTP 404).
   */
  @Get("users/:id")
  async getUser(@Param("id") id: string) {
    return this.adminService.getUser(id);
  }

  /**
   * Обновляет подписку и/или роль пользователя.
   *
   * `PATCH /admin/users/:id`
   *
   * Позволяет изменить тип подписки (`free` / `paid`) или роль (`user` / `admin`).
   * Оба поля являются необязательными — можно передать только одно из них.
   *
   * @param id  — UUID пользователя (path-параметр).
   * @param dto — поля для обновления (subscription, role).
   * @returns Обновлённый объект пользователя.
   * @throws {NotFoundException} Если пользователь не найден (HTTP 404).
   */
  @Patch("users/:id")
  async updateUser(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  /**
   * Сбрасывает демо-лимиты пользователя.
   *
   * `DELETE /admin/users/:id/limits`
   *
   * Удаляет все записи `UsageCounter` для данного пользователя, обнуляя
   * его счётчики использования. Это позволяет демо-пользователю снова
   * воспользоваться бесплатным функционалом приложения.
   *
   * @param id — UUID пользователя (path-параметр).
   * @returns Пустое тело ответа (HTTP 204 No Content).
   * @throws {NotFoundException} Если пользователь не найден (HTTP 404).
   */
  @Delete("users/:id/limits")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetUserLimits(@Param("id") id: string) {
    await this.adminService.resetUserLimits(id);
  }

  // ─── Character Options ─────────────────────────────────────

  @Get("character-options")
  async getCharacterOptions(@Query("category") category?: string) {
    return this.adminService.getCharacterOptions(category);
  }

  @Post("character-options")
  async createCharacterOption(@Body() dto: CreateCharacterOptionDto) {
    return this.adminService.createCharacterOption(dto);
  }

  @Patch("character-options/:id")
  async updateCharacterOption(
    @Param("id") id: string,
    @Body() dto: UpdateCharacterOptionDto,
  ) {
    return this.adminService.updateCharacterOption(id, dto);
  }

  @Delete("character-options/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCharacterOption(@Param("id") id: string) {
    await this.adminService.deleteCharacterOption(id);
  }

  // ─── Appearance Categories ─────────────────────────────────

  @Get("appearance-categories")
  async getAppearanceCategories(@Query("tab") tab?: string) {
    return this.adminService.getAppearanceCategories(tab);
  }

  @Post("appearance-categories")
  async createAppearanceCategory(@Body() dto: CreateAppearanceCategoryDto) {
    return this.adminService.createAppearanceCategory(dto);
  }

  @Patch("appearance-categories/:id")
  async updateAppearanceCategory(
    @Param("id") id: string,
    @Body() dto: UpdateAppearanceCategoryDto,
  ) {
    return this.adminService.updateAppearanceCategory(id, dto);
  }

  @Delete("appearance-categories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAppearanceCategory(@Param("id") id: string) {
    await this.adminService.deleteAppearanceCategory(id);
  }

  // ─── Appearance Options ────────────────────────────────────

  @Get("appearance-options")
  async getAppearanceOptions(@Query("categoryId") categoryId?: string) {
    return this.adminService.getAppearanceOptions(categoryId);
  }

  @Post("appearance-options")
  async createAppearanceOption(@Body() dto: CreateAppearanceOptionDto) {
    return this.adminService.createAppearanceOption(dto);
  }

  @Patch("appearance-options/:id")
  async updateAppearanceOption(
    @Param("id") id: string,
    @Body() dto: UpdateAppearanceOptionDto,
  ) {
    return this.adminService.updateAppearanceOption(id, dto);
  }

  @Delete("appearance-options/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAppearanceOption(@Param("id") id: string) {
    await this.adminService.deleteAppearanceOption(id);
  }

  // ─── Pose Categories ───────────────────────────────────────

  @Get("pose-categories")
  async getPoseCategories(@Query("tab") tab?: string) {
    return this.adminService.getPoseCategories(tab);
  }

  @Post("pose-categories")
  async createPoseCategory(@Body() dto: CreatePoseCategoryDto) {
    return this.adminService.createPoseCategory(dto);
  }

  @Patch("pose-categories/:id")
  async updatePoseCategory(
    @Param("id") id: string,
    @Body() dto: UpdatePoseCategoryDto,
  ) {
    return this.adminService.updatePoseCategory(id, dto);
  }

  @Delete("pose-categories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePoseCategory(@Param("id") id: string) {
    await this.adminService.deletePoseCategory(id);
  }

  // ─── Pose Options ──────────────────────────────────────────

  @Get("pose-options")
  async getPoseOptions(@Query("categoryId") categoryId?: string) {
    return this.adminService.getPoseOptions(categoryId);
  }

  @Post("pose-options")
  async createPoseOption(@Body() dto: CreatePoseOptionDto) {
    return this.adminService.createPoseOption(dto);
  }

  @Patch("pose-options/:id")
  async updatePoseOption(
    @Param("id") id: string,
    @Body() dto: UpdatePoseOptionDto,
  ) {
    return this.adminService.updatePoseOption(id, dto);
  }

  @Delete("pose-options/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePoseOption(@Param("id") id: string) {
    await this.adminService.deletePoseOption(id);
  }

  // ─── Scene Categories ──────────────────────────────────────

  @Get("scene-categories")
  async getSceneCategories(@Query("tab") tab?: string) {
    return this.adminService.getSceneCategories(tab);
  }

  @Post("scene-categories")
  async createSceneCategory(@Body() dto: CreateSceneCategoryDto) {
    return this.adminService.createSceneCategory(dto);
  }

  @Patch("scene-categories/:id")
  async updateSceneCategory(
    @Param("id") id: string,
    @Body() dto: UpdateSceneCategoryDto,
  ) {
    return this.adminService.updateSceneCategory(id, dto);
  }

  @Delete("scene-categories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSceneCategory(@Param("id") id: string) {
    await this.adminService.deleteSceneCategory(id);
  }

  // ─── Scene Options ─────────────────────────────────────────

  @Get("scene-options")
  async getSceneOptions(@Query("categoryId") categoryId?: string) {
    return this.adminService.getSceneOptions(categoryId);
  }

  @Post("scene-options")
  async createSceneOption(@Body() dto: CreateSceneOptionDto) {
    return this.adminService.createSceneOption(dto);
  }

  @Patch("scene-options/:id")
  async updateSceneOption(
    @Param("id") id: string,
    @Body() dto: UpdateSceneOptionDto,
  ) {
    return this.adminService.updateSceneOption(id, dto);
  }

  @Delete("scene-options/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSceneOption(@Param("id") id: string) {
    await this.adminService.deleteSceneOption(id);
  }
}
