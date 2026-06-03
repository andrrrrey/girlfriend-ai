/**
 * @file chat-profiles.controller.ts
 * @description HTTP-эндпоинты для CRUD чат-профилей текущего пользователя.
 *
 * Все маршруты защищены JwtAuthGuard; владелец берётся из req.user.id.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ChatProfilesService } from "./chat-profiles.service";
import { CreateChatProfileDto } from "./dto/create-chat-profile.dto";
import { UpdateChatProfileDto } from "./dto/update-chat-profile.dto";

@ApiTags("chat-profiles")
@ApiBearerAuth()
@Controller("chat-profiles")
@UseGuards(JwtAuthGuard)
export class ChatProfilesController {
  constructor(private readonly chatProfilesService: ChatProfilesService) {}

  @ApiOperation({ summary: "List current user's chat profiles" })
  @Get()
  async list(@Req() req: any) {
    return this.chatProfilesService.listByUser(req.user.id);
  }

  @ApiOperation({ summary: "Create a new chat profile" })
  @Post()
  async create(@Req() req: any, @Body() dto: CreateChatProfileDto) {
    return this.chatProfilesService.create(req.user.id, dto);
  }

  @ApiOperation({ summary: "Update a chat profile" })
  @Patch(":id")
  async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateChatProfileDto) {
    return this.chatProfilesService.update(req.user.id, id, dto);
  }

  @ApiOperation({ summary: "Delete a chat profile" })
  @Delete(":id")
  async delete(@Req() req: any, @Param("id") id: string) {
    await this.chatProfilesService.delete(req.user.id, id);
  }
}
