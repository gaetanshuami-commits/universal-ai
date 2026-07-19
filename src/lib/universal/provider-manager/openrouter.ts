import { estimateUsageCost } from "./cost";
import { selectOpenRouterModels } from "./catalog";
import type {
  UniversalChatRequest,
  UniversalChatResponse,
  UniversalModel,
  UniversalProviderAdapter,
  UniversalProviderHealth,
} from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

interface OpenRouterModelPayload {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly context_length?: unknown;
  readonly architecture?: {
    readonly input_modalities?: unknown;
    readonly output_modalities?: unknown;
  };
  readonly pricing?: {
    readonly prompt?: unknown;
    readonly completion?: unknown;
  };
}

interface OpenRouterModelsResponse {
  readonly data?: unknown;
}

interface OpenRouterChatResponse {
  readonly id?: unknown;
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly total_tokens?: unknown;
  };
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function safeStringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function createHeaders(): HeadersInit {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const siteUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    process.env.OPENROUTER_SITE_URL?.trim();

  const appName =
    process.env.OPENROUTER_APP_NAME?.trim() ??
    "Universal AI";

  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (appName) headers["X-Title"] = appName;

  return headers;
}

async function fetchOpenRouter(
  path: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${OPENROUTER_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...createHeaders(),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readError(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 1_000);
  } catch {
    return response.statusText;
  }
}

function buildRequestBody(
  request: UniversalChatRequest,
  stream: boolean,
): Record<string, unknown> {
  const selectedModels = request.model
    ? [request.model]
    : selectOpenRouterModels(request.task);

  const body: Record<string, unknown> = {
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
      ...(message.toolCallId
        ? { tool_call_id: message.toolCallId }
        : {}),
    })),
    stream,
    provider: {
      allow_fallbacks: request.allowFallbacks ?? true,
      require_parameters: request.requireParameters ?? false,
      data_collection: request.dataCollection ?? "deny",
      ...(request.sort ? { sort: request.sort } : {}),
    },
  };

  if (selectedModels.length === 1) {
    body.model = selectedModels[0];
  } else {
    body.models = selectedModels;
    body.route = "fallback";
  }

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }

  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  if (request.userId) {
    body.user = request.userId;
  }

  return body;
}

function extractAssistantContent(payload: OpenRouterChatResponse): {
  readonly content: string;
  readonly finishReason?: string;
} {
  const choices = Array.isArray(payload.choices)
    ? payload.choices
    : [];

  const first = choices[0] as
    | {
        readonly message?: {
          readonly content?: unknown;
        };
        readonly finish_reason?: unknown;
      }
    | undefined;

  return {
    content: safeString(first?.message?.content),
    finishReason:
      safeString(first?.finish_reason) || undefined,
  };
}

export const openRouterProvider: UniversalProviderAdapter = {
  id: "openrouter",
  name: "OpenRouter",

  isConfigured() {
    return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  },

  async listModels(): Promise<ReadonlyArray<UniversalModel>> {
    const response = await fetchOpenRouter("/models", {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter models ${response.status}: ${await readError(response)}`,
      );
    }

    const payload =
      (await response.json()) as OpenRouterModelsResponse;

    const rawModels = Array.isArray(payload.data)
      ? payload.data
      : [];

    return rawModels
      .map((raw): UniversalModel | null => {
        const item = raw as OpenRouterModelPayload;
        const id = safeString(item.id);
        if (!id) return null;

        const promptPricePerToken =
          safeNumber(item.pricing?.prompt);
        const completionPricePerToken =
          safeNumber(item.pricing?.completion);

        return {
          id,
          name: safeString(item.name) || id,
          description:
            safeString(item.description) || undefined,
          contextLength:
            safeNumber(item.context_length),
          inputModalities:
            safeStringArray(
              item.architecture?.input_modalities,
            ),
          outputModalities:
            safeStringArray(
              item.architecture?.output_modalities,
            ),
          promptPricePerMillion:
            promptPricePerToken !== undefined
              ? promptPricePerToken * 1_000_000
              : undefined,
          completionPricePerMillion:
            completionPricePerToken !== undefined
              ? completionPricePerToken * 1_000_000
              : undefined,
          providerId: "openrouter",
        };
      })
      .filter(
        (model): model is UniversalModel =>
          model !== null,
      );
  },

  async healthCheck(): Promise<UniversalProviderHealth> {
    if (!this.isConfigured()) {
      return {
        providerId: "openrouter",
        configured: false,
        reachable: false,
        error: "OPENROUTER_API_KEY is missing.",
      };
    }

    const startedAt = Date.now();

    try {
      const response = await fetchOpenRouter("/models", {
        method: "GET",
      }, 15_000);

      return {
        providerId: "openrouter",
        configured: true,
        reachable: response.ok,
        latencyMs: Date.now() - startedAt,
        error: response.ok
          ? undefined
          : await readError(response),
      };
    } catch (error) {
      return {
        providerId: "openrouter",
        configured: true,
        reachable: false,
        latencyMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  },

  async chat(
    request: UniversalChatRequest,
  ): Promise<UniversalChatResponse> {
    const startedAt = Date.now();

    const response = await fetchOpenRouter(
      "/chat/completions",
      {
        method: "POST",
        body: JSON.stringify(
          buildRequestBody(request, false),
        ),
      },
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter chat ${response.status}: ${await readError(response)}`,
      );
    }

    const payload =
      (await response.json()) as OpenRouterChatResponse;

    const extracted =
      extractAssistantContent(payload);

    const promptTokens =
      safeNumber(payload.usage?.prompt_tokens) ?? 0;
    const completionTokens =
      safeNumber(payload.usage?.completion_tokens) ?? 0;

    return {
      providerId: "openrouter",
      model:
        safeString(payload.model) ||
        request.model ||
        selectOpenRouterModels(request.task)[0],
      content: extracted.content,
      finishReason: extracted.finishReason,
      usage: estimateUsageCost({
        promptTokens,
        completionTokens,
      }),
      durationMs: Date.now() - startedAt,
      raw: payload,
    };
  },

  async stream(
    request: UniversalChatRequest,
  ): Promise<Response> {
    const response = await fetchOpenRouter(
      "/chat/completions",
      {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
        },
        body: JSON.stringify(
          buildRequestBody(request, true),
        ),
      },
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter stream ${response.status}: ${await readError(response)}`,
      );
    }

    return response;
  },
};
