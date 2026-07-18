import { universalFetchJson } from "../http";
import {
  hasEnvironmentValues,
  requireEnvironmentValue,
  separateSystemMessages,
  validateGenerationRequest,
} from "../utils";

import type {
  UniversalAIProvider,
  UniversalGenerationRequest,
  UniversalGenerationResponse,
  UniversalModel,
  UniversalProviderHealth,
} from "../types";

interface AnthropicResponse {
  readonly id?: string;
  readonly model?: string;
  readonly stop_reason?: string;
  readonly content?: ReadonlyArray<{
    readonly type?: string;
    readonly text?: string;
  }>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
  };
}

export class AnthropicProvider
  implements UniversalAIProvider
{
  public readonly id = "anthropic";
  public readonly name = "Anthropic";
  public readonly enabled =
    process.env.ANTHROPIC_ENABLED !== "false";

  public isConfigured(): boolean {
    return hasEnvironmentValues(
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL",
    );
  }

  public async listModels(): Promise<
    ReadonlyArray<UniversalModel>
  > {
    const model =
      process.env.ANTHROPIC_MODEL?.trim();

    if (!model) {
      return [];
    }

    return [
      {
        id: model,
        name: model,
        providerId: this.id,
        capabilities: [
          "text",
          "reasoning",
          "code",
          "vision",
          "documents",
          "tools",
        ],
        enabled: this.enabled,
      },
    ];
  }

  public async generate(
    request: UniversalGenerationRequest,
  ): Promise<UniversalGenerationResponse> {
    validateGenerationRequest(request);

    const apiKey =
      requireEnvironmentValue(
        "ANTHROPIC_API_KEY",
      );

    const model =
      request.model?.trim() ||
      requireEnvironmentValue(
        "ANTHROPIC_MODEL",
      );

    const separated =
      separateSystemMessages(
        request.messages,
      );

    const response =
      await universalFetchJson<AnthropicResponse>({
        providerId: this.id,
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: {
          model,
          max_tokens:
            request.maxOutputTokens ?? 4096,
          ...(separated.system
            ? {
                system: separated.system,
              }
            : {}),
          messages: separated.messages.map(
            (message) => ({
              role:
                message.role === "assistant"
                  ? "assistant"
                  : "user",
              content: message.content,
            }),
          ),
          ...(typeof request.temperature ===
          "number"
            ? {
                temperature:
                  request.temperature,
              }
            : {}),
        },
      });

    const content = (
      response.content ?? []
    )
      .filter(
        (item) =>
          item.type === "text" &&
          typeof item.text === "string",
      )
      .map((item) => item.text)
      .join("\n")
      .trim();

    const inputTokens =
      response.usage?.input_tokens;

    const outputTokens =
      response.usage?.output_tokens;

    return {
      id:
        response.id ??
        crypto.randomUUID(),
      providerId: this.id,
      model: response.model ?? model,
      content,
      finishReason:
        response.stop_reason ?? "completed",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens:
          typeof inputTokens === "number" &&
          typeof outputTokens === "number"
            ? inputTokens + outputTokens
            : undefined,
      },
    };
  }

  public async healthCheck(): Promise<UniversalProviderHealth> {
    return {
      healthy:
        this.enabled && this.isConfigured(),
      configured: this.isConfigured(),
      message: this.isConfigured()
        ? "Anthropic is configured."
        : "ANTHROPIC_API_KEY or ANTHROPIC_MODEL is missing.",
    };
  }
}
