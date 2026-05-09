import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { LikesService } from "./likes.service";
import { ToggleLikeDto } from "./dto/toggle-like.dto";

@Controller("likes")
export class LikesController {
  constructor(private likesService: LikesService) {}

  @Post("toggle")
  @UseGuards(JwtAuthGuard)
  async toggle(@Req() req: any, @Body() dto: ToggleLikeDto) {
    return this.likesService.toggle(req.user.id, dto.targetType, dto.targetId);
  }

  @Get("status")
  @UseGuards(JwtAuthGuard)
  async getStatus(
    @Req() req: any,
    @Query("targetType") targetType: string,
    @Query("targetId") targetId: string,
  ) {
    return this.likesService.getStatus(req.user.id, targetType, targetId);
  }

  @Get("count")
  async getCount(
    @Query("targetType") targetType: string,
    @Query("targetId") targetId: string,
  ) {
    return this.likesService.getCount(targetType, targetId);
  }

  @Get("batch-status")
  @UseGuards(JwtAuthGuard)
  async batchStatus(
    @Req() req: any,
    @Query("targetType") targetType: string,
    @Query("targetIds") targetIds: string,
  ) {
    const ids = targetIds.split(",").filter(Boolean);
    return this.likesService.batchStatus(req.user.id, targetType, ids);
  }

  @Get("my")
  @UseGuards(JwtAuthGuard)
  async getMyLiked(
    @Req() req: any,
    @Query("targetType") targetType: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.likesService.getMyLiked(
      req.user.id,
      targetType,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
