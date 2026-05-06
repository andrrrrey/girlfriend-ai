import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  BadRequestException,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";
import { S3Service } from "../s3/s3.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

class SignedUrlsDto {
  @IsArray()
  @IsString({ each: true })
  keys!: string[];
}

const EXPIRES_IN = 900; // 15 минут

@ApiTags("media")
@UseGuards(JwtAuthGuard)
@Controller("media")
export class MediaController {
  constructor(private readonly s3: S3Service) {}

  @ApiOperation({ summary: "Get presigned URL for a media key" })
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
