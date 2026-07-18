import { UniversalError } from "../core";

import type {
  UniversalMessage,
  UniversalProviderCapability,
} from "../providers";

import type {
  UniversalTaskMode,
} from "../router";

import type {
  UniversalChatInput,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const VALID_MODES = new Set<UniversalTaskMode>([
  "auto",
  "fast",
  "reasoning",
  "code",
  "creative",
  "analysis",
  "multimodal",
]);

const VALID_CAPABILITIES =
  new Set<UniversalProviderCapability>([
    "text",
    "reasoning",
    "code",
    "vision",
    "audio",
    "video",
    "documents",
    "web-search",
    "tools",
    "structured-output",
    "embeddings",
    "image-generation",
  ]);

export function normalizeChatInput(
  body: unknown,
): UniversalChatInput {
  if (!isRecord(body)) {
    throw new UniversalError({
      code: "VALIDATION_ERROR",
      message: "Le corps de la requête doit être un objet JSON.",
      statusCode: 400,
    });
  }

  const messages = normalizeMessages(body);

  if (messages.length === 0) {
    throw new UniversalError({
      code: "VALIDATION_ERROR",
      message: "Aucun message utilisateur valide n'a été fourni.",
      statusCode: 400,
    });
  }

  const mode = normalizeMode(
    body.mode ??
      body.taskMode ??
      body.task_mode,
  );

  const providerId = readOptionalString(
    body.providerId ??
      body.provider ??
      body.provider_id,
  );

  const model = readOptionalString(
    body.model ??
      body.modelId ??
      body.model_id,
  );

  const temperature = readOptionalNumber(
    body.temperature,
    0,
    2,
  );

  const maxOutputTokens =
    readOptionalInteger(
      body.maxOutputTokens ??
        body.maxTokens ??
        body.max_tokens,
      1,
      100_000,
    );

  const allowFallback =
    readOptionalBoolean(
      body.allowFallback ??
        body.fallback,
    );

  const stream =
    readOptionalBoolean(body.stream) ??
    false;

  const requiredCapabilities =
    normalizeCapabilities(
      body.requiredCapabilities ??
        body.capabilities,
    );

  return {
    messages,
    mode,
    ...(providerId
      ? {
          providerId,
        }
      : {}),
    ...(model
      ? {
          model,
        }
      : {}),
    ...(typeof temperature === "number"
      ? {
          temperature,
        }
      : {}),
    ...(typeof maxOutputTokens === "number"
      ? {
          maxOutputTokens,
        }
      : {}),
    ...(typeof allowFallback === "boolean"
      ? {
          allowFallback,
        }
      : {}),
    stream,
    ...(requiredCapabilities.length > 0
      ? {
          requiredCapabilities,
        }
      : {}),
  };
}

function normalizeMessages(
  body: UnknownRecord,
): UniversalMessage[] {
  const rawMessages =
    body.messages ??
    body.history ??
    body.conversation;

  if (Array.isArray(rawMessages)) {
    return rawMessages
      .map(normalizeMessage)
      .filter(
        (
          message,
        ): message is UniversalMessage =>
          message !== null,
      );
  }

  const singlePrompt =
    readOptionalString(
      body.message ??
        body.prompt ??
        body.input ??
        body.content ??
        body.text,
    );

  if (!singlePrompt) {
    return [];
  }

  const systemPrompt =
    readOptionalString(
      body.system ??
        body.systemPrompt ??
        body.system_prompt,
    );

  return [
    ...(systemPrompt
      ? [
          {
            role: "system" as const,
            content: systemPrompt,
          },
        ]
      : []),
    {
      role: "user",
      content: singlePrompt,
    },
  ];
}

function normalizeMessage(
  value: unknown,
): UniversalMessage | null {
  if (typeof value === "string") {
    const content = value.trim();

    return content
      ? {
          role: "user",
          content,
        }
      : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const content = extractMessageContent(value);

  if (!content) {
    return null;
  }

  const role = normalizeRole(value.role);
  const name = readOptionalString(value.name);

  return {
    role,
    content,
    ...(name
      ? {
          name,
        }
      : {}),
  };
}

function extractMessageContent(
  value: UnknownRecord,
): string | undefined {
  const directContent =
    readOptionalString(
      value.content ??
        value.text ??
        value.message,
    );

  if (directContent) {
    return directContent;
  }

  if (Array.isArray(value.content)) {
    const parts = value.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (!isRecord(part)) {
          return "";
        }

        return (
          readOptionalString(
            part.text ??
              part.content,
          ) ?? ""
        );
      })
      .filter(Boolean);

    const merged = parts.join("\n").trim();

    return merged || undefined;
  }

  return undefined;
}

function normalizeRole(
  value: unknown,
): UniversalMessage["role"] {
  if (
    value === "system" ||
    value === "assistant" ||
    value === "tool"
  ) {
    return value;
  }

  return "user";
}

function normalizeMode(
  value: unknown,
): UniversalTaskMode {
  const mode = readOptionalString(value);

  if (
    mode &&
    VALID_MODES.has(
      mode as UniversalTaskMode,
    )
  ) {
    return mode as UniversalTaskMode;
  }

  return "auto";
}

function normalizeCapabilities(
  value: unknown,
): UniversalProviderCapability[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(readOptionalString)
        .filter(
          (
            capability,
          ): capability is string =>
            Boolean(capability),
        )
        .filter((capability) =>
          VALID_CAPABILITIES.has(
            capability as UniversalProviderCapability,
          ),
        ),
    ),
  ) as UniversalProviderCapability[];
}

function readOptionalString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized || undefined;
}

function readOptionalBoolean(
  value: unknown,
): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return undefined;
}

function readOptionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return undefined;
  }

  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

function readOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return undefined;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(numberValue),
    ),
  );
}

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}
