import { UniversalError } from "./errors";

import type {
  UniversalEnvironment,
  UniversalLogLevel,
} from "./types";

export interface UniversalConfig {
  readonly appName: string;
  readonly appVersion: string;
  readonly environment: UniversalEnvironment;
  readonly logLevel: UniversalLogLevel;
  readonly enableProviderFallback: boolean;
  readonly defaultRequestTimeoutMs: number;
}

function readEnvironment(): UniversalEnvironment {
  const value = process.env.NODE_ENV;

  if (
    value === "development" ||
    value === "test" ||
    value === "production"
  ) {
    return value;
  }

  return "development";
}

function readLogLevel(): UniversalLogLevel {
  const value = process.env.UNIVERSAL_LOG_LEVEL;

  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  ) {
    return value;
  }

  return readEnvironment() === "production"
    ? "info"
    : "debug";
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new UniversalError({
      code: "CONFIGURATION_ERROR",
      message: `Invalid positive integer configuration value: ${value}`,
      statusCode: 500,
    });
  }

  return parsed;
}

function readBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export const universalConfig: UniversalConfig =
  Object.freeze({
    appName:
      process.env.NEXT_PUBLIC_APP_NAME ??
      "Universal AI",

    appVersion:
      process.env.NEXT_PUBLIC_APP_VERSION ??
      "0.1.0",

    environment: readEnvironment(),

    logLevel: readLogLevel(),

    enableProviderFallback: readBoolean(
      process.env.UNIVERSAL_PROVIDER_FALLBACK,
      true,
    ),

    defaultRequestTimeoutMs: readPositiveInteger(
      process.env.UNIVERSAL_REQUEST_TIMEOUT_MS,
      60_000,
    ),
  });
