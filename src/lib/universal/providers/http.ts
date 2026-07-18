import {
  UniversalError,
  universalConfig,
} from "../core";

interface UniversalFetchOptions {
  readonly url: string;
  readonly providerId: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly method?: "GET" | "POST";
  readonly timeoutMs?: number;
}

export async function universalFetchJson<TResponse>(
  options: UniversalFetchOptions,
): Promise<TResponse> {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ??
      universalConfig.defaultRequestTimeoutMs,
  );

  try {
    const response = await fetch(options.url, {
      method: options.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...(options.body !== undefined
        ? {
            body: JSON.stringify(options.body),
          }
        : {}),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawBody = await response.text();

    let data: unknown;

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = {
        rawBody,
      };
    }

    if (!response.ok) {
      const message = extractProviderErrorMessage(
        data,
        `${options.providerId} returned HTTP ${response.status}.`,
      );

      throw new UniversalError({
        code: "PROVIDER_ERROR",
        message,
        statusCode:
          response.status >= 400 &&
          response.status <= 599
            ? response.status
            : 502,
        details: {
          providerId: options.providerId,
          providerStatus: response.status,
        },
      });
    }

    return data as TResponse;
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw new UniversalError({
        code: "EXECUTION_ERROR",
        message:
          `${options.providerId} exceeded the request timeout.`,
        statusCode: 504,
        details: {
          providerId: options.providerId,
        },
      });
    }

    if (error instanceof UniversalError) {
      throw error;
    }

    throw new UniversalError({
      code: "PROVIDER_ERROR",
      message:
        `${options.providerId} request failed.`,
      statusCode: 502,
      cause: error,
      details: {
        providerId: options.providerId,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractProviderErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const record = data as Record<string, unknown>;
  const error = record.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = (
      error as Record<string, unknown>
    ).message;

    if (typeof message === "string") {
      return message;
    }
  }

  const message = record.message;

  return typeof message === "string"
    ? message
    : fallback;
}
