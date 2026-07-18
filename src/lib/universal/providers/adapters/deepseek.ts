import { universalFetchJson } from "../http";
import {
  hasEnvironmentValues,
  requireEnvironmentValue,
  validateGenerationRequest,
} from "../utils";

import type {
  UniversalAIProvider,
  UniversalGenerationRequest,
  UniversalGenerationResponse,
  UniversalModel,
  UniversalProviderHealth,
} from "../types";

interface DeepSeekResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly finish_reason?: string;
    readonly message?: {
      readonly content?: string | null;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

export class DeepSeekProvider
  implements UniversalAIProvider
{
  public readonly id = "deepseek";
  public readonly name = "DeepSeek";
  public readonly enabled =
    process.env.DEEPSEEK_ENABLED !== "false";

  public isConfigured(): boolean {
    return hasEnvironmentValues(
      "DEEPSEEK_API_KEY",
      "DEEPSEEK_MODEL",
    );
  }

  public async listModels(): Promise<
    ReadonlyArray<UniversalModel>
  > {
    const model =
      process.env.DEEPSEEK_MODEL?.trim();

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
          "tools",
          "structured-output",
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
        "DEEPSEEK_API_KEY",
      );

    const model =
      request.model?.trim() ||
      requireEnvironmentValue(
        "DEEPSEEK_MODEL",
      );

    const response =
      await universalFetchJson<DeepSeekResponse>({
        providerId: this.id,
        url:
          "https://api.deepseek.com/chat/completions",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          messages: request.messages.map(
            (message) => ({
              role: message.role,
              content: message.content,
              ...(message.name
                ? {
                    name: message.name,
                  }
                : {}),
            }),
          ),
          stream: false,
          ...(request.maxOutputTokens
            ? {
                max_tokens:
                  request.maxOutputTokens,
              }
            : {}),
          ...(typeof request.temperature ===
          "number"
            ? {
                temperature:
                  request.temperature,
              }
            : {}),
        },
      });

    const choice =
      response.choices?.[0];

    return {
      id:
        response.id ??
        crypto.randomUUID(),
      providerId: this.id,
      model: response.model ?? model,
      content:
        choice?.message?.content?.trim() ??
        "",
      finishReason:
        choice?.finish_reason ??
        "completed",
      usage: {
        inputTokens:
          response.usage?.prompt_tokens,
        outputTokens:
          response.usage
            ?.completion_tokens,
        totalTokens:
          response.usage?.total_tokens,
      },
    };
  }

  public async healthCheck(): Promise<UniversalProviderHealth> {
    return {
      healthy:
        this.enabled && this.isConfigured(),
      configured: this.isConfigured(),
      message: this.isConfigured()
        ? "DeepSeek is configured."
        : "DEEPSEEK_API_KEY or DEEPSEEK_MODEL is missing.",
    };
  }
}
