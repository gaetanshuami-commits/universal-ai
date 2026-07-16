import type { ChatInputMessage } from "@/lib/ai/memory/context-manager";
import type { AIProvider } from "@/types/ai";

export interface ProviderStreamInput {
  provider: AIProvider;
  messages: ChatInputMessage[];
  systemPrompt: string;
  signal?: AbortSignal;
}

interface ProviderConfiguration {
  apiKey: string;
  model: string;
}

function getProviderConfiguration(
  provider: AIProvider,
): ProviderConfiguration {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_DEFAULT_MODEL;

    if (!apiKey || !model) {
      throw new Error(
        "OpenAI n'est pas configuré. Ajoutez OPENAI_API_KEY et OPENAI_DEFAULT_MODEL.",
      );
    }

    return { apiKey, model };
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_DEFAULT_MODEL;

    if (!apiKey || !model) {
      throw new Error(
        "Claude n'est pas configuré. Ajoutez ANTHROPIC_API_KEY et ANTHROPIC_DEFAULT_MODEL.",
      );
    }

    return { apiKey, model };
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const model = process.env.GEMINI_DEFAULT_MODEL;

  if (!apiKey || !model) {
    throw new Error(
      "Gemini n'est pas configuré. Ajoutez GOOGLE_GENERATIVE_AI_API_KEY et GEMINI_DEFAULT_MODEL.",
    );
  }

  return { apiKey, model };
}

function createOpenAIRequest(
  config: ProviderConfiguration,
  messages: ChatInputMessage[],
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      instructions: systemPrompt,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: true,
    }),
    signal,
  });
}

function createAnthropicRequest(
  config: ProviderConfiguration,
  messages: ChatInputMessage[],
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages,
      stream: true,
    }),
    signal,
  });
}

function createGeminiRequest(
  config: ProviderConfiguration,
  messages: ChatInputMessage[],
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<Response> {
  const model = encodeURIComponent(config.model);
  const apiKey = encodeURIComponent(config.apiKey);

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
      }),
      signal,
    },
  );
}

export async function createProviderResponse({
  provider,
  messages,
  systemPrompt,
  signal,
}: ProviderStreamInput): Promise<Response> {
  const config = getProviderConfiguration(provider);

  let response: Response;

  if (provider === "openai") {
    response = await createOpenAIRequest(
      config,
      messages,
      systemPrompt,
      signal,
    );
  } else if (provider === "anthropic") {
    response = await createAnthropicRequest(
      config,
      messages,
      systemPrompt,
      signal,
    );
  } else {
    response = await createGeminiRequest(
      config,
      messages,
      systemPrompt,
      signal,
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `${provider} a répondu avec le statut ${response.status}: ${errorBody.slice(0, 1000)}`,
    );
  }

  if (!response.body) {
    throw new Error(`Le fournisseur ${provider} n'a retourné aucun flux.`);
  }

  return response;
}
