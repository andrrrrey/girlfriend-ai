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
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
// Подтягивает type-augmentation для Express.Multer.File:
import "multer";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";
import { randomUUID } from "crypto";
import sharp from "sharp";
import type { Readable } from "stream";
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

// Заголовок «навсегда»: и оригиналы, и деривативы immutable (ключ/параметры
// однозначно определяют содержимое), поэтому браузер и Service Worker могут
// держать их в кеше сколько угодно.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

// Разрешённые ширины ресайза. Любой иной `w` игнорируется и отдаётся оригинал —
// это и защита от абуза (бесконечные размеры → засорение S3), и фиксированный
// набор деривативов с хорошим cache-hit.
const ALLOWED_WIDTHS = new Set([96, 256, 400, 768, 1080]);
const DEFAULT_QUALITY = 80;

/** Собирает Readable-поток S3-объекта в Buffer (нужно для sharp). */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Парсит и валидирует параметр ширины. Возвращает null, если ресайз не нужен. */
function parseWidth(raw?: string): number | null {
  if (!raw) return null;
  const w = Number.parseInt(raw, 10);
  return ALLOWED_WIDTHS.has(w) ? w : null;
}

/** Парсит и ограничивает качество webp в диапазоне 40..90. */
function parseQuality(raw?: string): number {
  const q = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(q)) return DEFAULT_QUALITY;
  return Math.min(90, Math.max(40, q));
}

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
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly s3: S3Service) {}

  @ApiOperation({
    summary:
      "Stream a media object directly (no auth). ?w=<width>&q=<quality> отдаёт сжатый webp нужной ширины",
  })
  @Get("stream")
  async streamMedia(
    @Query("key") key: string,
    @Res() res: Response,
    @Query("w") widthRaw?: string,
    @Query("q") qualityRaw?: string,
  ) {
    if (!key || key.includes("..")) {
      throw new BadRequestException("Invalid key");
    }
    if (!this.s3.isConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }

    const width = parseWidth(widthRaw);

    // Без валидного ?w — поведение как раньше: стримим оригинал как есть.
    if (width === null) {
      try {
        const { body, contentType } = await this.s3.getObject(key);
        res.setHeader("Content-Type", contentType || "application/octet-stream");
        res.setHeader("Cache-Control", IMMUTABLE_CACHE);
        body.pipe(res);
      } catch (err) {
        throw this.mediaNotFound(key, err);
      }
      return;
    }

    const quality = parseQuality(qualityRaw);
    const derivedKey = `derivatives/w${width}q${quality}/${key}.webp`;

    // 1) Готовый дериватив уже лежит в S3 — стримим его, ничего не пересчитывая.
    try {
      const cached = await this.s3.getObject(derivedKey);
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", IMMUTABLE_CACHE);
      cached.body.pipe(res);
      return;
    } catch {
      /* деривата нет — генерируем ниже */
    }

    // 2) Деривата нет: берём оригинал.
    let original: { body: Readable; contentType?: string };
    try {
      original = await this.s3.getObject(key);
    } catch (err) {
      throw this.mediaNotFound(key, err);
    }

    // Ресайзим только изображения. Видео/прочее — отдаём оригинал как есть.
    const isImage = (original.contentType ?? "").startsWith("image/");
    if (!isImage) {
      res.setHeader(
        "Content-Type",
        original.contentType || "application/octet-stream",
      );
      res.setHeader("Cache-Control", IMMUTABLE_CACHE);
      original.body.pipe(res);
      return;
    }

    try {
      const source = await streamToBuffer(original.body);
      const resized = await sharp(source)
        .rotate()
        .resize(width, null, { fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      // Кешируем дериватив в S3, чтобы следующие запросы шли по быстрому пути (1).
      // Не блокируем ответ ошибкой записи — пользователю важнее получить картинку.
      this.s3.putObject(derivedKey, resized, "image/webp").catch(() => {});
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", IMMUTABLE_CACHE);
      res.send(resized);
    } catch {
      // sharp не смог обработать (битый/неподдерживаемый формат) — отдаём оригинал.
      try {
        const { body, contentType } = await this.s3.getObject(key);
        res.setHeader("Content-Type", contentType || "application/octet-stream");
        res.setHeader("Cache-Control", IMMUTABLE_CACHE);
        body.pipe(res);
      } catch (err) {
        throw this.mediaNotFound(key, err);
      }
    }
  }

  /**
   * Логирует пропавший S3-ключ (с причиной) и возвращает 404. Раньше 404 летел
   * молча, из-за чего «Failed to load resource: 404» в консоли было невозможно
   * связать с конкретным объектом. Теперь в логах видно, какой ключ отсутствует
   * — это протухший результат генерации, не залитый в S3, либо превью опции,
   * ссылающееся на несуществующий ключ.
   */
  private mediaNotFound(key: string, err: unknown): NotFoundException {
    this.logger.warn(
      `media_key_not_found key="${key}" reason="${(err as Error)?.message ?? "unknown"}"`,
    );
    return new NotFoundException("Media not found");
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
        // Обычно это протухший временный URL Civitai/провайдера. Логируем и
        // отдаём 404 с кэш-заголовком, чтобы браузер не долбил ту же ссылку.
        this.logger.warn(
          `upstream_media_not_found status=${upstream.status} url="${url}"`,
        );
        res.setHeader("Cache-Control", "public, max-age=3600");
        throw new NotFoundException("Upstream media not found");
      }
      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.logger.warn(`upstream_media_fetch_failed url="${url}" reason="${(err as Error)?.message}"`);
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
