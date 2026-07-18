import { UniversalError } from "../core";

import type {
  UniversalGenerationRequest,
  UniversalMessage,
} from "./types";

export function requireEnvironmentValue(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new UniversalError({
      code: "CONFIGURATION_ERROR",
      message:
        `The required environment variable ${name} is missing.`,
      statusCode: 503,
      details: {
        environmentVariable: name,
      },
    });
  }

  return value;
}

export function hasEnvironmentValues(
  ...names: ReadonlyArray<string>
): boolean {
  return names.every(
    (name) =>
      Boolean(process.env[name]?.trim()),
  );
}

export function separateSystemMessages(
  messages: ReadonlyArray<UniversalMessage>,
): {
  readonly system?: string;
  readonly messages: ReadonlyArray<UniversalMessage>;
} {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);

  return {
    ...(systemMessages.length > 0
      ? {
          system: systemMessages.join("\n\n"),
        }
      : {}),
    messages: messages.filter(
      (message) => message.role !== "system",
    ),
  };
}

export function validateGenerationRequest(
  request: UniversalGenerationRequest,
): void {
  if (
    !Array.isArray(request.messages) ||
    request.messages.length === 0
  ) {
    throw new UniversalError({
      code: "VALIDATION_ERROR",
      message:
        "At least one message is required.",
      statusCode: 400,
    });
  }

  const hasContent = request.messages.some(
    (message) =>
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );

  if (!hasContent) {
    throw new UniversalError({
      code: "VALIDATION_ERROR",
      message:
        "At least one message must contain text.",
      statusCode: 400,
    });
  }
}
