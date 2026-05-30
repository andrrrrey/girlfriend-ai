import { Injectable, Logger } from "@nestjs/common";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";
import { loadEnv } from "@repo/config";

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;

  constructor() {
    const env = loadEnv();
    this.bucket = env.S3_BUCKET ?? "media";

    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      this.s3 = null;
      return;
    }

    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "auto",
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }

  isConfigured(): boolean {
    return this.s3 !== null;
  }

  /** Генерирует presigned URL для чтения объекта. Действителен expiresIn секунд (по умолчанию 15 минут). */
  async getSignedUrl(key: string, expiresIn = 900): Promise<string> {
    if (!this.s3) {
      throw new Error("S3 is not configured");
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getSignedUrl(this.s3 as any, command as any, { expiresIn });
  }

  /** Возвращает тело объекта из S3 для проксирования. */
  async getObject(key: string): Promise<{ body: Readable; contentType?: string }> {
    if (!this.s3) throw new Error("S3 is not configured");
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.s3.send(command);
    return { body: response.Body as Readable, contentType: response.ContentType };
  }

  /** Загружает буфер в S3 по указанному ключу. */
  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
    cacheControl = "public, max-age=31536000, immutable",
  ): Promise<void> {
    if (!this.s3) throw new Error("S3 is not configured");
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    });
    await this.s3.send(command);
  }

  /** Извлекает S3-ключ из полного публичного URL */
  static extractKeyFromUrl(url: string, publicBase: string, bucket: string): string | null {
    const prefix = `${publicBase.replace(/\/$/, "")}/${bucket}/`;
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length);
    }
    // Fallback: try to extract key from any URL containing /{bucket}/ pattern
    const bucketPattern = `/${bucket}/`;
    const bucketIdx = url.indexOf(bucketPattern);
    if (bucketIdx !== -1) {
      return url.slice(bucketIdx + bucketPattern.length);
    }
    return null;
  }
}
