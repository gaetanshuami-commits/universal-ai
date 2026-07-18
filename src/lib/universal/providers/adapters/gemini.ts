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

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<{
    readonly finishReason?: string;
    readonly content?: {
      readonly parts?: ReadonlyArray<{
        readonly text?: string;
      }>;
    };
  }>;
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

export class GeminiProvider
  implements UniversalAIProvider
{
  public readonly id = "google";
  public readonly name = "Google Gemini";
  public readonly enabled =
    process.env.GOOGLE_AI_ENABLED !== "false";

  public isConfigured(): boolean {
    return hasEnvironmentValues(
      "GOOGLE_AI_API_KEY",
      "GOOGLE_AI_MODEL",
    );
  }

  public async listModels(): Promise<
    ReadonlyArray<UniversalModel>
  > {
    const model =
      process.env.GOOGLE_AI_MODEL?.trim();

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
          "audio",
          "video",
          "documents",
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
        "GOOGLE_AI_API_KEY",
      );

    const model =
      request.model?.trim() ||
      requireEnvironmentValue(
        "GOOGLE_AI_MODEL",
      );

    const separated =
      separateSystemMessages(
        request.messages,
      );

    const encodedModel =
      encodeURIComponent(model);

    const response =
      await universalFetchJson<GeminiResponse>({
        providerId: this.id,
        url:
          `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
        body: {
          ...(separated.system
            ? {
                systemInstruction: {
                  parts: [
                    {
                      text: separated.system,
                    },
                  ],
                },
              }
            : {}),
          contents: separated.messages.map(
            (message) => ({
              role:
                message.role === "assistant"
                  ? "model"
                  : "user",
              parts: [
                {
                  text: message.content,
                },
              ],
            }),
          ),
          generationConfig: {
            ...(typeof request.temperature ===
            "number"
              ? {
                  temperature:
                    request.temperature,
                }
              : {}),
            ...(request.maxOutputTokens
              ? {
                  maxOutputTokens:
                    request.maxOutputTokens,
                }
              : {}),
          },
        },
      });

    const candidate =
      response.candidates?.[0];

    const content = (
      candidate?.content?.parts ?? []
    )
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    return {
      id: crypto.randomUUID(),
      providerId: this.id,
      model,
      content,
      finishReason:
        candidate?.finishReason ??
        "completed",
      usage: {
        inputTokens:
          response.usageMetadata
            ?.promptTokenCount,
        outputTokens:
          response.usageMetadata
            ?.candidatesTokenCount,
        totalTokens:
          response.usageMetadata
            ?.totalTokenCount,
      },
    };
  }

  public async healthCheck(): Promise<UniversalProviderHealth> {
    return {
      healthy:
        this.enabled && this.isConfigured(),
      configured: this.isConfigured(),
      message: this.isConfigured()
        ? "Google Gemini is configured."
        : "GOOGLE_AI_API_KEY or GOOGLE_AI_MODEL is missing.",
    };
  }
}
