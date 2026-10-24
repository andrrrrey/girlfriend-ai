/**
 * @file crypto.service.ts
 * @description Шифрование секретов в БД (AES-256-GCM): токены Telegram-ботов и т.п.
 *
 * Ключ — переменная окружения SECRETS_ENC_KEY: 32 байта в base64 или hex.
 * Сгенерировать: `openssl rand -base64 32`.
 *
 * Формат шифротекста: "v1:<iv b64>:<authTag b64>:<ciphertext b64>".
 * Префикс версии позволит позже сменить алгоритм/ключ без миграции данных.
 */

import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { loadEnv } from "@repo/config";

const VERSION = "v1";
const IV_BYTES = 12;

/** Разбирает ключ из base64 или hex; бросает ошибку, если длина не 32 байта. */
export function parseEncryptionKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SECRETS_ENC_KEY must be 32 bytes (base64 or hex)");
  return key;
}

@Injectable()
export class CryptoService {
  private key: Buffer | null = null;

  /** Ключ читается лениво: без SECRETS_ENC_KEY приложение стартует, падает только использование. */
  private getKey(): Buffer {
    if (!this.key) {
      const raw = loadEnv().SECRETS_ENC_KEY;
      if (!raw) throw new Error("SECRETS_ENC_KEY is not configured");
      this.key = parseEncryptionKey(raw);
    }
    return this.key;
  }

  /** Шифрует строку. */
  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
  }

  /** Расшифровывает строку; бросает ошибку при подмене данных или чужом ключе. */
  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(":");
    if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
      throw new Error("Unsupported ciphertext format");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  }
}
