/**
 * @file admin-payments.dto.ts
 * @description Тела запросов админки платежей.
 */

import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from "class-validator";

/** Каталог принимает только валюты с двумя знаками: так считает money.ts. */
export const PRODUCT_CURRENCIES = ["USD", "EUR", "GBP"] as const;

export class UpdateProviderDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(["sandbox", "live"])
  mode!: "sandbox" | "live";

  /** Значения только на запись; пустое значение не меняет сохранённый ключ. */
  @IsObject()
  secrets!: Record<string, string>;

  @IsObject()
  settings!: Record<string, string>;
}

export class ProductDto {
  @IsIn(["credits", "premium"])
  kind!: "credits" | "premium";

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceMinor!: number;

  @IsIn(PRODUCT_CURRENCIES)
  currency!: string;

  @IsInt()
  @Min(0)
  credits!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  periodDays?: number | null;

  @IsBoolean()
  active!: boolean;

  @IsInt()
  sortOrder!: number;
}

export class PaymentRefundDto {
  /** Наша запись транзакции покупки */
  @IsUUID()
  transactionId!: string;

  /** Без суммы — полный возврат */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  reason!: string;
}

export class BlockUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
