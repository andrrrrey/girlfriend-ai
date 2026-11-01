/**
 * @file payment-registry.service.ts
 * @description Реестр адаптеров. Провайдер доступен, только если адаптер
 * подключён, включён в админке и все его секреты читаются.
 */

import { Inject, Injectable } from "@nestjs/common";
import { PAYMENT_PROVIDERS, type PaymentProvider, type PaymentProviderId } from "./payment-provider";
import { ProviderConfigService } from "./provider-config.service";

@Injectable()
export class PaymentRegistryService {
  constructor(
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[],
    private readonly configs: ProviderConfigService,
  ) {}

  get(id: string): PaymentProvider | undefined {
    return this.providers.find((provider) => provider.id === id);
  }

  async isEnabled(id: PaymentProviderId): Promise<boolean> {
    const provider = this.get(id);
    if (!provider) return false;
    const config = await this.configs.load(id);
    return (
      config.enabled &&
      !config.secretsUnreadable &&
      provider.requiredSecrets.every((name) => Boolean(config.secrets[name]))
    );
  }

  async enabledIds(): Promise<PaymentProviderId[]> {
    const flags = await Promise.all(this.providers.map((provider) => this.isEnabled(provider.id)));
    return this.providers.filter((_, index) => flags[index]).map((provider) => provider.id);
  }
}
