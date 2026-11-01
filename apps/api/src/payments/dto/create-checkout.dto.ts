/**
 * @file create-checkout.dto.ts
 * @description Тело запроса POST /payments/checkout.
 */

import { Equals, IsIn, IsUUID } from "class-validator";
import { PAYMENT_PROVIDER_IDS, type PaymentProviderId } from "../payment-provider";

export class CreateCheckoutDto {
  @IsUUID()
  productId!: string;

  @IsIn(PAYMENT_PROVIDER_IDS)
  provider!: PaymentProviderId;

  /** Согласие с условиями покупки; момент согласия сохраняется в платеже. */
  @Equals(true)
  acceptTerms!: boolean;
}
