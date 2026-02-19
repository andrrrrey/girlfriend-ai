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

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch("me")
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    await this.usersService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get("me/social-links")
  async getSocialLinks(@Req() req: any) {
    return this.usersService.getSocialLinks(req.user.id);
  }

  @Put("me/social-links")
  async upsertSocialLink(@Req() req: any, @Body() dto: UpsertSocialLinkDto) {
    return this.usersService.upsertSocialLink(req.user.id, dto.provider, dto.url);
  }

  @Delete("me/social-links/:provider")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSocialLink(@Req() req: any, @Param("provider") provider: string) {
    await this.usersService.deleteSocialLink(req.user.id, provider);
  }
}
