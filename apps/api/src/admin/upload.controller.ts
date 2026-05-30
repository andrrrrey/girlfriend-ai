import {
  BadRequestException,
  Controller,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
// Подтягивает type-augmentation для Express.Multer.File:
import "multer";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { S3Service } from "../s3/s3.service";
import { optimizeAndUploadOptionImage } from "./option-image.util";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags("admin")
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminUploadController {
  constructor(private readonly s3: S3Service) {}

  @Post("upload-option-image")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadOptionImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("file is required");
    }
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    return optimizeAndUploadOptionImage(this.s3, file.buffer);
  }
}
