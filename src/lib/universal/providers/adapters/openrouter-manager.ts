import {
  universalProviderManager,
} from "../../provider-manager";

import type {
  UniversalTaskType,
} from "../../provider-manager";

import type {
  UniversalAIProvider,
  UniversalGenerationRequest,
  UniversalGenerationResponse,
  UniversalModel,
  UniversalProviderCapability,
  UniversalProviderHealth,
} from "../types";

export class OpenRouterManagerProvider
  implements UniversalAIProvider
{
  public readonly id = "openrouter";
  public readonly name =
    "OpenRouter Provider Manager";
  public readonly enabled =
    process.env.OPENROUTER_ENABLED !== "false";

  public isConfigured(): boolean {
    return (
      this.enabled &&
      Boolean(
        process.env.OPENROUTER_API_KEY?.trim(),
      )
    );
  }

  public async listModels(): Promise<
    ReadonlyArray<UniversalModel>
  > {
    if (!this.isConfigured()) {
      return [];
    }

    const models =
      await universalProviderManager.listModels();

    return models
      .filter(
        (model) =>
          model.providerId === "openrouter",
      )
      .map((model) => {
        const mapped: UniversalModel = {
          id: model.id,
          name: model.name,
          providerId: this.id,
          capabilities:
            inferCapabilities(
              model.inputModalities,
              model.outputModalities,
            ),
          enabled: true,
          ...(typeof model.contextLength ===
          "number"
            ? {
                contextWindow:
                  model.contextLength,
              }
            : {}),
        };

        return mapped;
      });
  }

  public async generate(
    request: UniversalGenerationRequest,
  ): Promise<UniversalGenerationResponse> {
    const result =
      await universalProviderManager.chat({
        messages: request.messages.map(
          (message) => ({
            role: message.role,
            content: message.content,
            ...(message.name
              ? { name: message.name }
              : {}),
          }),
        ),
        ...(request.model
          ? { model: request.model }
          : {}),
        task: inferTask(request),
        ...(typeof request.temperature ===
        "number"
          ? {
              temperature:
                request.temperature,
            }
          : {}),
        ...(typeof request.maxOutputTokens ===
        "number"
          ? {
              maxTokens:
                request.maxOutputTokens,
            }
          : {}),
        allowFallbacks: true,
        dataCollection: "deny",
      });

    return {
      id: `openrouter-${Date.now()}`,
      providerId: this.id,
      model: result.model,
      content: result.content,
      ...(result.finishReason
        ? {
            finishReason:
              result.finishReason,
          }
        : {}),
      ...(result.usage
        ? {
            usage: {
              inputTokens:
                result.usage.promptTokens,
              outputTokens:
                result.usage.completionTokens,
              totalTokens:
                result.usage.totalTokens,
            },
          }
        : {}),
    };
  }

  public async healthCheck(): Promise<
    UniversalProviderHealth
  > {
    if (!this.isConfigured()) {
      return {
        healthy: false,
        configured: false,
        message:
          "OPENROUTER_API_KEY is missing or OpenRouter is disabled.",
      };
    }

    const results =
      await universalProviderManager.healthCheck();

    const health = results.find(
      (item) =>
        item.providerId === "openrouter",
    );

    if (!health) {
      return {
        healthy: false,
        configured: true,
        message:
          "OpenRouter is not registered in Provider Manager.",
      };
    }

    return {
      healthy: health.reachable,
      configured: health.configured,
      ...(typeof health.latencyMs ===
      "number"
        ? {
            latencyMs: health.latencyMs,
          }
        : {}),
      message:
        health.error ??
        (health.reachable
          ? "OpenRouter is reachable."
          : "OpenRouter is unreachable."),
    };
  }
}

function inferTask(
  request: UniversalGenerationRequest,
): UniversalTaskType {
  const prompt = request.messages
    .map((message) => message.content)
    .join(" ")
    .toLowerCase();

  if (
    /code|typescript|javascript|python|sql|debug|compile|function|class/.test(
      prompt,
    )
  ) {
    return "code";
  }

  if (
    /reason|analyse|analysis|compare|explain|strategy|plan/.test(
      prompt,
    )
  ) {
    return "reasoning";
  }

  if (
    /image|photo|vision|screenshot/.test(
      prompt,
    )
  ) {
    return "vision";
  }

  return "general";
}

function inferCapabilities(
  inputModalities: ReadonlyArray<string>,
  outputModalities: ReadonlyArray<string>,
): ReadonlyArray<UniversalProviderCapability> {
  const capabilities =
    new Set<UniversalProviderCapability>([
      "text",
      "reasoning",
      "code",
      "documents",
      "tools",
      "structured-output",
    ]);

  const modalities = [
    ...inputModalities,
    ...outputModalities,
  ].map((value) => value.toLowerCase());

  if (
    modalities.includes("image") ||
    modalities.includes("vision")
  ) {
    capabilities.add("vision");
  }

  if (modalities.includes("audio")) {
    capabilities.add("audio");
  }

  if (modalities.includes("video")) {
    capabilities.add("video");
  }

  return Array.from(capabilities);
}

export const openRouterManagerProvider =
  new OpenRouterManagerProvider();
