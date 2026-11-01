/**
 * @file provider-config.service.ts
 * @description Настройки провайдеров из админки. Секреты зашифрованы и наружу
 * отдаются только как признак «задан» и последние символы.
 * Кэша нет: новый ключ применяется сразу на всех инстансах.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CryptoService } from "../common/crypto.service";
import type { PaymentProviderId } from "./payment-provider";

export type ProviderMode = "sandbox" | "live";

export interface ProviderConfig {
  enabled: boolean;
  mode: ProviderMode;
  secrets: Record<string, string>;
  settings: Record<string, unknown>;
  /** Секреты есть, но не расшифровались (сменился SECRETS_ENC_KEY) */
  secretsUnreadable: boolean;
}

export interface ProviderConfigUpdate {
  enabled?: boolean;
  mode?: ProviderMode;
  /** Пустое значение не затирает сохранённый секрет */
  secrets?: Record<string, string>;
  settings?: Record<string, unknown>;
  updatedBy?: string;
}

/** Показывает концовку только у достаточно длинного секрета. */
export function maskSecret(secret: string): string {
  return secret.length >= 12 ? `…${secret.slice(-4)}` : "…";
}

@Injectable()
export class ProviderConfigService {
  private readonly logger = new Logger(ProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async load(provider: PaymentProviderId): Promise<ProviderConfig> {
    const row = await this.prisma.paymentProviderConfig.findUnique({ where: { provider } });
    let secrets: Record<string, string> = {};
    let secretsUnreadable = false;
    if (row?.secretsEnc) {
      try {
        secrets = JSON.parse(this.crypto.decrypt(row.secretsEnc));
      } catch (err: any) {
        secretsUnreadable = true;
        this.logger.error(`payment provider ${provider}: secrets cannot be decrypted: ${err?.message}`);
      }
    }
    return {
      enabled: row?.enabled ?? false,
      mode: row?.mode === "live" ? "live" : "sandbox",
      secrets,
      settings: (row?.settings as Record<string, unknown> | null) ?? {},
      secretsUnreadable,
    };
  }

  /** Сохраняет настройки; новые секреты дополняют уже сохранённые. */
  async save(provider: PaymentProviderId, update: ProviderConfigUpdate): Promise<void> {
    const entered = Object.entries(update.secrets ?? {}).filter(([, value]) => value.trim() !== "");
    let secretsEnc: string | undefined;
    if (entered.length > 0) {
      const current = await this.load(provider);
      // Нечитаемые секреты (сменился SECRETS_ENC_KEY) заменяются введённым набором;
      // если он неполный, реестр оставит провайдера выключенным.
      const merged = { ...current.secrets, ...Object.fromEntries(entered.map(([k, v]) => [k, v.trim()])) };
      secretsEnc = this.crypto.encrypt(JSON.stringify(merged));
    }
    const data = {
      ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
      ...(update.mode ? { mode: update.mode } : {}),
      ...(update.settings ? { settings: update.settings as Prisma.InputJsonValue } : {}),
      ...(secretsEnc ? { secretsEnc } : {}),
      updatedBy: update.updatedBy,
    };
    await this.prisma.paymentProviderConfig.upsert({
      where: { provider },
      create: { provider, ...data },
      update: data,
    });
  }

  /** Безопасное представление для админки: значения секретов не покидают сервис. */
  async describe(provider: PaymentProviderId) {
    const config = await this.load(provider);
    return {
      provider,
      enabled: config.enabled,
      mode: config.mode,
      settings: config.settings,
      secretsUnreadable: config.secretsUnreadable,
      secrets: Object.fromEntries(
        Object.entries(config.secrets).map(([name, value]) => [name, { configured: true, hint: maskSecret(value) }]),
      ),
    };
  }
}
