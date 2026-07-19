import { openRouterProvider } from "./openrouter";
import type {
  UniversalChatRequest,
  UniversalChatResponse,
  UniversalModel,
  UniversalProviderAdapter,
  UniversalProviderHealth,
  UniversalProviderId,
} from "./types";

export class UniversalProviderManager {
  private readonly providers = new Map<
    UniversalProviderId,
    UniversalProviderAdapter
  >();

  register(provider: UniversalProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(
    providerId: UniversalProviderId,
  ): UniversalProviderAdapter | undefined {
    return this.providers.get(providerId);
  }

  listConfigured(): ReadonlyArray<UniversalProviderAdapter> {
    return Array.from(this.providers.values()).filter(
      (provider) => provider.isConfigured(),
    );
  }

  async listModels(): Promise<ReadonlyArray<UniversalModel>> {
    const configured = this.listConfigured();

    const results = await Promise.allSettled(
      configured.map((provider) =>
        provider.listModels(),
      ),
    );

    return results.flatMap((result) =>
      result.status === "fulfilled"
        ? result.value
        : [],
    );
  }

  async healthCheck(): Promise<
    ReadonlyArray<UniversalProviderHealth>
  > {
    return Promise.all(
      Array.from(this.providers.values()).map(
        (provider) => provider.healthCheck(),
      ),
    );
  }

  async chat(
    request: UniversalChatRequest,
  ): Promise<UniversalChatResponse> {
    const configured = this.listConfigured();

    if (configured.length === 0) {
      throw new Error(
        "No AI provider is configured. Add OPENROUTER_API_KEY to .env.local.",
      );
    }

    const errors: string[] = [];

    for (const provider of configured) {
      try {
        return await provider.chat(request);
      } catch (error) {
        errors.push(
          `${provider.id}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }

    throw new Error(
      `All configured AI providers failed: ${errors.join(" | ")}`,
    );
  }

  async stream(
    request: UniversalChatRequest,
  ): Promise<Response> {
    const configured = this.listConfigured();

    if (configured.length === 0) {
      throw new Error(
        "No AI provider is configured. Add OPENROUTER_API_KEY to .env.local.",
      );
    }

    const errors: string[] = [];

    for (const provider of configured) {
      try {
        return await provider.stream(request);
      } catch (error) {
        errors.push(
          `${provider.id}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }

    throw new Error(
      `All configured streaming providers failed: ${errors.join(" | ")}`,
    );
  }
}

export const universalProviderManager =
  new UniversalProviderManager();

universalProviderManager.register(
  openRouterProvider,
);
