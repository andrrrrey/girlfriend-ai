import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { GenerationService } from "./generation.service";
import { CreateImageJobDto } from "./dto/create-image-job.dto";

@ApiTags("generation")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post("image")
  async createImageJob(@Req() req: any, @Body() dto: CreateImageJobDto) {
    return this.generationService.createImageJob(req.user.id, {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt,
      model: dto.model,
      aspectRatio: dto.aspectRatio,
    });
  }

  @Get("jobs/:jobId")
  async getJobStatus(@Req() req: any, @Param("jobId") jobId: string) {
    const result = await this.generationService.getJobStatus(jobId, req.user.id);
    if (!result) {
      throw new HttpException("Job not found", HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get("image/styles")
  getImageStyles() {
    return this.generationService.getImageStyles();
  }

  @Get("history")
  async getHistory(@Req() req: any) {
    return this.generationService.getHistory(req.user.id);
  }
}
