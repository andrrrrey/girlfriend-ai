import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";

@Controller("comments")
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @Query("characterId") characterId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Req() req?: any,
  ) {
    const userId = req?.user?.id ?? null;
    return this.commentsService.list(
      characterId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
      userId,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() dto: CreateCommentDto) {
    return this.commentsService.create(
      req.user.id,
      dto.characterId,
      dto.content,
    );
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: any, @Param("id") id: string) {
    await this.commentsService.remove(req.user.id, id);
  }

  @Get("count")
  async getCount(@Query("characterId") characterId: string) {
    return this.commentsService.getCount(characterId);
  }
}
