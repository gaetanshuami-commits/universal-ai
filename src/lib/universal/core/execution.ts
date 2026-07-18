import { UniversalError } from "./errors";

import type {
  UniversalExecutionContext,
  UniversalResult,
} from "./types";

export function createExecutionContext(
  input?: Partial<
    Omit<
      UniversalExecutionContext,
      "requestId" | "createdAt"
    >
  >,
): UniversalExecutionContext {
  return {
    requestId: crypto.randomUUID(),
    createdAt: new Date(),
    ...input,
  };
}

export async function withTimeout<TValue>(
  operation: Promise<TValue>,
  timeoutMs: number,
  operationName = "operation",
): Promise<TValue> {
  let timeoutId:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeoutPromise = new Promise<never>(
    (_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new UniversalError({
            code: "EXECUTION_ERROR",
            message:
              `${operationName} exceeded the timeout of ${timeoutMs} ms.`,
            statusCode: 504,
          }),
        );
      }, timeoutMs);
    },
  );

  try {
    return await Promise.race([
      operation,
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function successResult<TData>(
  data: TData,
): UniversalResult<TData> {
  return {
    success: true,
    data,
  };
}

export function failureResult(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): UniversalResult<never> {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
