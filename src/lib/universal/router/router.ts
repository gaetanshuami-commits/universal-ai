import {
  UniversalError,
  createUniversalLogger,
  universalConfig,
} from "../core";

import {
  bootstrapUniversalProviders,
  universalProviderRegistry,
} from "../providers";

import type {
  UniversalAIProvider,
  UniversalProviderCapability,
} from "../providers";

import type {
  UniversalRouterRequest,
  UniversalRouterResponse,
  UniversalRoutingAttempt,
  UniversalTaskMode,
} from "./types";

const logger =
  createUniversalLogger(
    "universal-ai-router",
  );

const PROVIDER_MODE_PRIORITY:
  Readonly<Record<
    UniversalTaskMode,
    ReadonlyArray<string>
  >> = {
    auto: [
      "openai",
      "anthropic",
      "google",
      "deepseek",
    ],
    fast: [
      "google",
      "openai",
      "deepseek",
      "anthropic",
    ],
    reasoning: [
      "openai",
      "anthropic",
      "deepseek",
      "google",
    ],
    code: [
      "anthropic",
      "openai",
      "deepseek",
      "google",
    ],
    creative: [
      "anthropic",
      "openai",
      "google",
      "deepseek",
    ],
    analysis: [
      "openai",
      "anthropic",
      "deepseek",
      "google",
    ],
    multimodal: [
      "google",
      "openai",
      "anthropic",
      "deepseek",
    ],
  };

export class UniversalAIRouter {
  public async route(
    request: UniversalRouterRequest,
  ): Promise<UniversalRouterResponse> {
    bootstrapUniversalProviders();

    const mode =
      request.mode === "auto" ||
      !request.mode
        ? inferTaskMode(request)
        : request.mode;

    const providers =
      await this.selectProviders(
        request,
        mode,
      );

    if (providers.length === 0) {
      throw new UniversalError({
        code: "CONFIGURATION_ERROR",
        message:
          "No configured AI provider can handle this request.",
        statusCode: 503,
      });
    }

    const allowFallback =
      request.allowFallback ??
      universalConfig.enableProviderFallback;

    const candidates = allowFallback
      ? providers
      : providers.slice(0, 1);

    const attempts: UniversalRoutingAttempt[] =
      [];

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      const provider = candidates[index];
      const startedAt = Date.now();

      try {
        const response =
          await provider.generate(request);

        attempts.push({
          providerId: provider.id,
          success: true,
          durationMs:
            Date.now() - startedAt,
        });

        logger.info(
          "AI request completed.",
          {
            providerId: provider.id,
            mode,
            fallbackUsed: index > 0,
          },
        );

        return {
          ...response,
          routing: {
            mode,
            selectedProviderId:
              provider.id,
            fallbackUsed: index > 0,
            attempts,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : String(error);

        attempts.push({
          providerId: provider.id,
          success: false,
          durationMs:
            Date.now() - startedAt,
          error: errorMessage,
        });

        logger.warn(
          "AI provider attempt failed.",
          {
            providerId: provider.id,
            mode,
            error: errorMessage,
          },
        );
      }
    }

    throw new UniversalError({
      code: "PROVIDER_ERROR",
      message:
        "All eligible AI providers failed.",
      statusCode: 502,
      details: {
        mode,
        attempts,
      },
    });
  }

  private async selectProviders(
    request: UniversalRouterRequest,
    mode: UniversalTaskMode,
  ): Promise<
    ReadonlyArray<UniversalAIProvider>
  > {
    const configured =
      universalProviderRegistry.configured();

    const compatible: UniversalAIProvider[] =
      [];

    for (const provider of configured) {
      if (
        await providerSupportsCapabilities(
          provider,
          request.requiredCapabilities ??
            [],
        )
      ) {
        compatible.push(provider);
      }
    }

    const preferredProviderId =
      request.preferredProviderId?.trim();

    return compatible.sort(
      (left, right) => {
        if (
          preferredProviderId &&
          left.id === preferredProviderId
        ) {
          return -1;
        }

        if (
          preferredProviderId &&
          right.id === preferredProviderId
        ) {
          return 1;
        }

        const priority =
          PROVIDER_MODE_PRIORITY[mode];

        const leftIndex =
          priority.indexOf(left.id);

        const rightIndex =
          priority.indexOf(right.id);

        return normalizePriority(
          leftIndex,
        ) -
          normalizePriority(rightIndex);
      },
    );
  }
}

function inferTaskMode(
  request: UniversalRouterRequest,
): UniversalTaskMode {
  const prompt = request.messages
    .map((message) => message.content)
    .join(" ")
    .toLowerCase();

  const capabilities =
    request.requiredCapabilities ?? [];

  if (
    capabilities.some(
      (capability) =>
        capability === "vision" ||
        capability === "audio" ||
        capability === "video",
    )
  ) {
    return "multimodal";
  }

  if (
    containsAny(prompt, [
      "code",
      "typescript",
      "javascript",
      "python",
      "react",
      "next.js",
      "api",
      "bug",
      "debug",
      "fonction",
      "class ",
      "sql",
    ])
  ) {
    return "code";
  }

  if (
    containsAny(prompt, [
      "analyse approfondie",
      "raisonne",
      "raisonnement",
      "compare",
      "stratégie",
      "architecture",
      "démontre",
      "résous",
      "calculate",
    ])
  ) {
    return "reasoning";
  }

  if (
    containsAny(prompt, [
      "créatif",
      "créative",
      "histoire",
      "scénario",
      "marketing",
      "slogan",
      "design",
      "story",
    ])
  ) {
    return "creative";
  }

  if (
    containsAny(prompt, [
      "résume",
      "rapidement",
      "bref",
      "court",
      "simple",
    ])
  ) {
    return "fast";
  }

  return "auto";
}

async function providerSupportsCapabilities(
  provider: UniversalAIProvider,
  requiredCapabilities:
    ReadonlyArray<UniversalProviderCapability>,
): Promise<boolean> {
  if (requiredCapabilities.length === 0) {
    return true;
  }

  const models = await provider.listModels();

  return models.some((model) =>
    requiredCapabilities.every(
      (requiredCapability) =>
        model.capabilities.includes(
          requiredCapability,
        ),
    ),
  );
}

function normalizePriority(
  index: number,
): number {
  return index === -1
    ? Number.MAX_SAFE_INTEGER
    : index;
}

function containsAny(
  value: string,
  keywords: ReadonlyArray<string>,
): boolean {
  return keywords.some((keyword) =>
    value.includes(keyword),
  );
}

export const universalAIRouter =
  new UniversalAIRouter();
