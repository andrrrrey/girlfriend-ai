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
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../auth/guards/roles.guard";
import { AdminService } from "./admin.service";
import { UpsertSettingsDto } from "./dto/upsert-settings.dto";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { UpdateCharacterDto } from "./dto/update-character.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Settings ──────────────────────────────────────────────

  @Get("settings")
  async getSettings() {
    return this.adminService.getAllSettings();
  }

  @Put("settings")
  async upsertSettings(@Body() dto: UpsertSettingsDto) {
    return this.adminService.upsertSettings(dto.settings);
  }

  // ─── Characters ────────────────────────────────────────────

  @Get("characters")
  async getCharacters() {
    return this.adminService.getCharacters();
  }

  @Get("characters/:id")
  async getCharacter(@Param("id") id: string) {
    return this.adminService.getCharacter(id);
  }

  @Post("characters")
  async createCharacter(@Body() dto: CreateCharacterDto) {
    return this.adminService.createCharacter(dto);
  }

  @Patch("characters/:id")
  async updateCharacter(
    @Param("id") id: string,
    @Body() dto: UpdateCharacterDto,
  ) {
    return this.adminService.updateCharacter(id, dto);
  }

  @Delete("characters/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCharacter(@Param("id") id: string) {
    await this.adminService.deleteCharacter(id);
  }
}
