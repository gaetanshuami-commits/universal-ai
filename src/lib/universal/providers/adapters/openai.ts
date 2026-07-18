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

interface OpenAIResponse {
  readonly id?: string;
  readonly model?: string;
  readonly output_text?: string;
  readonly output?: ReadonlyArray<{
    readonly content?: ReadonlyArray<{
      readonly type?: string;
      readonly text?: string;
    }>;
  }>;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly total_tokens?: number;
  };
  readonly status?: string;
}

export class OpenAIProvider
  implements UniversalAIProvider
{
  public readonly id = "openai";
  public readonly name = "OpenAI";
  public readonly enabled =
    process.env.OPENAI_ENABLED !== "false";

  public isConfigured(): boolean {
    return hasEnvironmentValues(
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
    );
  }

  public async listModels(): Promise<
    ReadonlyArray<UniversalModel>
  > {
    const model =
      process.env.OPENAI_MODEL?.trim();

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
      requireEnvironmentValue("OPENAI_API_KEY");

    const model =
      request.model?.trim() ||
      requireEnvironmentValue("OPENAI_MODEL");

    const response =
      await universalFetchJson<OpenAIResponse>({
        providerId: this.id,
        url: "https://api.openai.com/v1/responses",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          model,
          input: request.messages.map(
            (message) => ({
              role: message.role,
              content: message.content,
            }),
          ),
          ...(request.maxOutputTokens
            ? {
                max_output_tokens:
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

    const content =
      response.output_text?.trim() ||
      extractOutputText(response);

    return {
      id:
        response.id ??
        crypto.randomUUID(),
      providerId: this.id,
      model: response.model ?? model,
      content,
      finishReason:
        response.status ?? "completed",
      usage: {
        inputTokens:
          response.usage?.input_tokens,
        outputTokens:
          response.usage?.output_tokens,
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
        ? "OpenAI is configured."
        : "OPENAI_API_KEY or OPENAI_MODEL is missing.",
    };
  }
}

function extractOutputText(
  response: OpenAIResponse,
): string {
  const parts: string[] = [];

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}
