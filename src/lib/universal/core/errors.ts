import type { UniversalMetadata } from "./types";

export type UniversalErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "CONFIGURATION_ERROR"
  | "EXECUTION_ERROR"
  | "INTERNAL_ERROR";

interface UniversalErrorOptions {
  readonly code: UniversalErrorCode;
  readonly message: string;
  readonly statusCode?: number;
  readonly details?: UniversalMetadata;
  readonly cause?: unknown;
}

export class UniversalError extends Error {
  public readonly code: UniversalErrorCode;
  public readonly statusCode: number;
  public readonly details?: UniversalMetadata;
  public readonly cause?: unknown;

  public constructor(options: UniversalErrorOptions) {
    super(options.message);

    this.name = "UniversalError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isUniversalError(
  error: unknown,
): error is UniversalError {
  return error instanceof UniversalError;
}

export function normalizeUniversalError(
  error: unknown,
): UniversalError {
  if (isUniversalError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new UniversalError({
      code: "INTERNAL_ERROR",
      message: error.message,
      cause: error,
    });
  }

  return new UniversalError({
    code: "INTERNAL_ERROR",
    message: "An unknown error occurred.",
    details: {
      originalError: error,
    },
  });
}
