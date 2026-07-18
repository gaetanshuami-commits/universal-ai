import { UniversalError } from "../core/errors";
import { createUniversalLogger } from "../core/logger";
import { UniversalRegistry } from "../core/registry";

import type {
  UniversalAIProvider,
  UniversalProviderHealth,
} from "./types";

const logger = createUniversalLogger(
  "universal-provider-registry",
);

export interface RegisteredProviderSummary {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly configured: boolean;
}

export class UniversalProviderRegistry {
  private readonly registry =
    new UniversalRegistry<UniversalAIProvider>();

  public register(
    provider: UniversalAIProvider,
    options?: {
      readonly replace?: boolean;
    },
  ): void {
    this.registry.register(
      provider.id,
      provider,
      options,
    );

    logger.info("AI provider registered.", {
      providerId: provider.id,
      providerName: provider.name,
      enabled: provider.enabled,
      configured: provider.isConfigured(),
    });
  }

  public get(
    providerId: string,
  ): UniversalAIProvider | undefined {
    return this.registry.get(providerId);
  }

  public require(
    providerId: string,
  ): UniversalAIProvider {
    const provider =
      this.registry.require(providerId);

    if (!provider.enabled) {
      throw new UniversalError({
        code: "PROVIDER_ERROR",
        message:
          `AI provider "${providerId}" is disabled.`,
        statusCode: 503,
      });
    }

    if (!provider.isConfigured()) {
      throw new UniversalError({
        code: "CONFIGURATION_ERROR",
        message:
          `AI provider "${providerId}" is not configured.`,
        statusCode: 503,
      });
    }

    return provider;
  }

  public list(): ReadonlyArray<UniversalAIProvider> {
    return this.registry
      .list()
      .map((entry) => entry.value);
  }

  public summaries():
    ReadonlyArray<RegisteredProviderSummary> {
    return this.list().map((provider) => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      configured: provider.isConfigured(),
    }));
  }

  public configured():
    ReadonlyArray<UniversalAIProvider> {
    return this.list().filter(
      (provider) =>
        provider.enabled &&
        provider.isConfigured(),
    );
  }

  public async healthCheckAll(): Promise<
    Readonly<Record<string, UniversalProviderHealth>>
  > {
    const providers = this.list();

    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          const health =
            await provider.healthCheck();

          return [
            provider.id,
            health,
          ] as const;
        } catch (error) {
          logger.error(
            "Provider health check failed.",
            {
              providerId: provider.id,
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            },
          );

          return [
            provider.id,
            {
              healthy: false,
              configured:
                provider.isConfigured(),
              message:
                "Provider health check failed.",
            },
          ] as const;
        }
      }),
    );

    return Object.fromEntries(results);
  }
}

export const universalProviderRegistry =
  new UniversalProviderRegistry();
