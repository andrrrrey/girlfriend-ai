import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DemoService } from "../demo/demo.service";
import { GenerationService } from "./generation.service";
import { CreateImageJobDto } from "./dto/create-image-job.dto";
import { CreateVideoJobDto } from "./dto/create-video-job.dto";

@ApiTags("generation")
@Controller("generation")
export class GenerationController {
  constructor(
    private readonly generationService: GenerationService,
    private readonly demoService: DemoService,
  ) {}

  @Post("image")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createImageJob(@Req() req: any, @Body() dto: CreateImageJobDto) {
    await this.demoService.checkImageGeneration(req.user.id, req.user.subscription);
    return this.generationService.createImageJob(req.user.id, {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
      provider: dto.provider,
      generationStyle: dto.generationStyle,
    });
  }

  @Post("video")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createVideoJob(@Req() req: any, @Body() dto: CreateVideoJobDto) {
    await this.demoService.checkVideoGeneration(req.user.id, req.user.subscription);
    return this.generationService.createVideoJob(req.user.id, {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
      provider: dto.provider,
    });
  }

  @SkipThrottle()
  @Get("jobs/:jobId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getJobStatus(@Req() req: any, @Param("jobId") jobId: string) {
    const result = await this.generationService.getJobStatus(jobId, req.user.id);
    if (!result) {
      throw new HttpException("Job not found", HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("image/styles")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getImageStyles() {
    return this.generationService.getImageStyles();
  }

  @Get("character-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCharacterOptions(@Query("category") category?: string) {
    return this.generationService.getCharacterOptions(category);
  }

  @Get("appearance-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getAppearanceOptions() {
    return this.generationService.getAppearanceOptions();
  }

  @Get("pose-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getPoseOptions() {
    return this.generationService.getPoseOptions();
  }

  @Get("scene-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSceneOptions() {
    return this.generationService.getSceneOptions();
  }

  @Get("camera-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCameraOptions() {
    return this.generationService.getCameraOptions();
  }

  @Get("video/styles")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getVideoStyles() {
    return this.generationService.getVideoStyles();
  }

  @Get("gallery")
  async getGallery(
    @Query("type") type?: string,
    @Query("sortBy") sortBy?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("userId") userId?: string,
    @Query("gender") gender?: string,
    @Query("style") style?: string,
  ) {
    return this.generationService.getGallery(
      limit ? parseInt(limit, 10) : 50,
      type,
      sortBy,
      page ? parseInt(page, 10) : 1,
      userId,
      gender,
      style,
    );
  }

  @Get("gallery/tags")
  async getGalleryTags() {
    return this.generationService.getGalleryTags();
  }

  @Get("history")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getHistory(@Req() req: any, @Query("type") type?: string) {
    return this.generationService.getHistory(req.user.id, type);
  }

  @Delete("jobs/:jobId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deleteJob(@Req() req: any, @Param("jobId") jobId: string) {
    const result = await this.generationService.deleteJob(jobId, req.user.id);
    if (!result) {
      throw new HttpException("Job not found", HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
