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
import { AnalyticsService } from "../analytics/analytics.service";
import { CreateImageJobDto } from "./dto/create-image-job.dto";
import { CreateVideoJobDto } from "./dto/create-video-job.dto";

@ApiTags("generation")
@Controller("generation")
export class GenerationController {
  constructor(
    private readonly generationService: GenerationService,
    private readonly demoService: DemoService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post("image")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createImageJob(@Req() req: any, @Body() dto: CreateImageJobDto) {
    await this.demoService.checkImageGeneration(req.user.id, req.user.subscription, dto.count ?? 1);
    const contentMode = req.user.isAdult === false ? "sfw" : dto.contentMode;
    const job = await this.generationService.createImageJob(req.user.id, {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
      provider: dto.provider,
      generationStyle: dto.generationStyle,
      count: dto.count,
      initImageUrl: dto.initImageUrl,
      characterId: dto.characterId,
      seed: dto.seed,
      // Несовершеннолетним принудительно SFW, иначе — выбор пользователя.
      contentMode,
    });
    this.analytics.capture(req.user.id, "image_generation_started", {
      count: dto.count ?? 1,
      model: dto.model,
      provider: dto.provider,
      content_mode: contentMode,
      character_id: dto.characterId,
      job_id: job.jobId,
    });
    return job;
  }

  @Post("video")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createVideoJob(@Req() req: any, @Body() dto: CreateVideoJobDto) {
    // Режим "continue" (видео-из-видео) временно отключён: формат запроса
    // video-continuation у провайдера не подтверждён, задачи падают и жгут ресурсы.
    if (dto.mode === "continue") {
      throw new HttpException(
        "Continue Existing Video is not available yet",
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    await this.demoService.checkVideoGeneration(req.user.id, req.user.subscription, dto.count ?? 1);
    return this.generationService.createVideoJob(req.user.id, {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
      provider: dto.provider,
      mode: dto.mode,
      initImageKey: dto.initImageKey,
      initVideoKey: dto.initVideoKey,
      count: dto.count,
      seed: dto.seed,
      // Несовершеннолетним принудительно SFW, иначе — выбор пользователя.
      contentMode: req.user.isAdult === false ? "sfw" : dto.contentMode,
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

  @Get("genders")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getGenders() {
    return this.generationService.getEnabledGenders();
  }

  @Get("character-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCharacterOptions(@Req() req: any, @Query("category") category?: string, @Query("mode") mode?: string) {
    return this.generationService.getCharacterOptions(category, this.effectiveMode(req, mode));
  }

  @Get("appearance-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getAppearanceOptions(@Req() req: any, @Query("mode") mode?: string) {
    return this.generationService.getAppearanceOptions(this.effectiveMode(req, mode));
  }

  @Get("pose-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getPoseOptions(@Req() req: any, @Query("mode") mode?: string) {
    return this.generationService.getPoseOptions(this.effectiveMode(req, mode));
  }

  @Get("scene-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getSceneOptions(@Req() req: any, @Query("mode") mode?: string) {
    return this.generationService.getSceneOptions(this.effectiveMode(req, mode));
  }

  @Get("camera-options")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getCameraOptions(@Req() req: any, @Query("mode") mode?: string) {
    return this.generationService.getCameraOptions(this.effectiveMode(req, mode));
  }

  /**
   * Эффективный режим контента для пикеров: несовершеннолетним всегда "sfw",
   * иначе — значение из query (?mode=sfw), иначе профильный режим пользователя.
   */
  private effectiveMode(req: any, mode?: string): string | undefined {
    if (req?.user?.isAdult === false) return "sfw";
    if (mode === "sfw" || mode === "nsfw") return mode;
    return req?.user?.contentMode;
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
    @Query("mode") mode?: string,
  ) {
    return this.generationService.getGallery(
      limit ? parseInt(limit, 10) : 50,
      type,
      sortBy,
      page ? parseInt(page, 10) : 1,
      userId,
      gender,
      style,
      mode,
    );
  }

  @Get("gallery/tags")
  async getGalleryTags() {
    return this.generationService.getGalleryTags();
  }

  @Get("public/:jobId")
  async getPublicJob(@Param("jobId") jobId: string) {
    const result = await this.generationService.getPublicJob(jobId);
    if (!result) {
      throw new HttpException("Not found", HttpStatus.NOT_FOUND);
    }
    return result;
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
