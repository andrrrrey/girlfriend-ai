import { randomUUID } from "crypto";
import sharp from "sharp";
import { S3Service } from "../s3/s3.service";

export interface OptimizedOptionImage {
  thumbKey: string;
  fullKey: string;
}

const THUMB_SIZE = 256;
const FULL_SIZE = 768;
const THUMB_QUALITY = 80;
const FULL_QUALITY = 82;
const S3_PREFIX = "option-images";

/**
 * Прогоняет исходный буфер картинки через sharp (thumb + full в WebP)
 * и загружает оба варианта в S3. Возвращает S3-ключи.
 */
export async function optimizeAndUploadOptionImage(
  s3: S3Service,
  source: Buffer,
): Promise<OptimizedOptionImage> {
  const id = randomUUID();
  const thumbKey = `${S3_PREFIX}/${id}-thumb.webp`;
  const fullKey = `${S3_PREFIX}/${id}-full.webp`;

  const [thumbBuffer, fullBuffer] = await Promise.all([
    sharp(source)
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer(),
    sharp(source)
      .rotate()
      .resize(FULL_SIZE, FULL_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: FULL_QUALITY })
      .toBuffer(),
  ]);

  await Promise.all([
    s3.putObject(thumbKey, thumbBuffer, "image/webp"),
    s3.putObject(fullKey, fullBuffer, "image/webp"),
  ]);

  return { thumbKey, fullKey };
}

/**
 * Декодирует data: URI base64-картинки в Buffer.
 * Возвращает null, если строка не data URI.
 */
export function base64DataUriToBuffer(value: string): Buffer | null {
  const match = value.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}
