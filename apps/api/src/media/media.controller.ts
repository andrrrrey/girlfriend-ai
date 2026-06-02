import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
// Подтягивает type-augmentation для Express.Multer.File:
import "multer";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";
import { randomUUID } from "crypto";
import { S3Service } from "../s3/s3.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { Response } from "express";

class SignedUrlsDto {
  @IsArray()
  @IsString({ each: true })
  keys!: string[];
}

const EXPIRES_IN = 900; // 15 минут
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 МБ (видео для continue)

/** MIME → расширение файла для загружаемых медиа. */
const UPLOAD_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(private readonly s3: S3Service) {}

  @ApiOperation({ summary: "Stream a media object directly (no auth required)" })
  @Get("stream")
  async streamMedia(@Query("key") key: string, @Res() res: Response) {
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid key");
    }
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    try {
      const { body, contentType } = await this.s3.getObject(key);
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      body.pipe(res);
    } catch {
      throw new NotFoundException("Media not found");
    }
  }

  @ApiOperation({ summary: "Proxy an external media URL (server-side fetch)" })
  @Get("proxy")
  async proxyMedia(@Query("url") url: string, @Res() res: Response) {
    if (!url) {
      throw new BadRequestException("url is required");
    }
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new BadRequestException("Invalid URL protocol");
      }
    } catch {
      throw new BadRequestException("Invalid URL");
    }
    try {
      const upstream = await fetch(url);
      if (!upstream.ok) {
        throw new NotFoundException("Upstream media not found");
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new ServiceUnavailableException("Failed to fetch upstream media");
    }
  }

  @ApiOperation({ summary: "Upload a user media file (image/video) → returns S3 key" })
  @UseGuards(JwtAuthGuard)
  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadMedia(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("file is required");
    }
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    const ext = UPLOAD_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException("Unsupported file type");
    }
    const prefix = file.mimetype.startsWith("video/") ? "videos" : "images";
    const key = `uploads/${prefix}/${randomUUID()}.${ext}`;
    await this.s3.putObject(key, file.buffer, file.mimetype);
    return { key };
  }

  @ApiOperation({ summary: "Get presigned URL for a media key" })
  @UseGuards(JwtAuthGuard)
  @Get("signed-url")
  async getSignedUrl(@Query("key") key: string) {
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid key");
    }
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    const url = await this.s3.getSignedUrl(key, EXPIRES_IN);
    return { url, expiresIn: EXPIRES_IN };
  }

  @ApiOperation({ summary: "Get presigned URLs for multiple media keys" })
  @UseGuards(JwtAuthGuard)
  @Post("signed-urls")
  async getSignedUrls(@Body() dto: SignedUrlsDto) {
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    if (dto.keys.some((k) => k.includes(".."))) {
      throw new BadRequestException("Invalid key");
    }
    const urls = await Promise.all(
      dto.keys.map(async (key) => ({
        key,
        url: await this.s3.getSignedUrl(key, EXPIRES_IN),
      })),
    );
    return { urls, expiresIn: EXPIRES_IN };
  }
}
