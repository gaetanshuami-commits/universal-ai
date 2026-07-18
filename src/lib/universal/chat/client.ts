import type {
  UniversalChatInput,
  UniversalChatResult,
  UniversalChatStreamEvent,
} from "./types";

export interface UniversalChatStreamCallbacks {
  readonly onStart?: (
    requestId: string,
  ) => void;
  readonly onDelta?: (
    delta: string,
  ) => void;
  readonly onComplete?: (
    result: UniversalChatResult,
  ) => void;
  readonly onError?: (
    error: Error,
  ) => void;
}

export async function sendUniversalChat(
  input: UniversalChatInput,
  signal?: AbortSignal,
): Promise<UniversalChatResult> {
  const response = await fetch(
    "/api/universal/chat",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        ...input,
        stream: false,
      }),
      signal,
    },
  );

  const payload =
    (await response.json()) as {
      readonly ok?: boolean;
      readonly result?: UniversalChatResult;
      readonly error?: {
        readonly message?: string;
      };
    };

  if (
    !response.ok ||
    !payload.ok ||
    !payload.result
  ) {
    throw new Error(
      payload.error?.message ??
        "La génération Universal AI a échoué.",
    );
  }

  return payload.result;
}

export async function streamUniversalChat(
  input: UniversalChatInput,
  callbacks:
    UniversalChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    "/api/universal/chat",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        ...input,
        stream: true,
      }),
      signal,
    },
  );

  if (
    !response.ok ||
    !response.body
  ) {
    throw new Error(
      `Universal AI streaming failed with HTTP ${response.status}.`,
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";

  try {
    while (true) {
      const {
        value,
        done,
      } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(
        value,
        {
          stream: true,
        },
      );

      const events =
        buffer.split("\n\n");

      buffer =
        events.pop() ?? "";

      for (const rawEvent of events) {
        const dataLine =
          rawEvent
            .split("\n")
            .find((line) =>
              line.startsWith(
                "data: ",
              ),
            );

        if (!dataLine) {
          continue;
        }

        const event =
          JSON.parse(
            dataLine.slice(6),
          ) as UniversalChatStreamEvent;

        switch (event.type) {
          case "start":
            callbacks.onStart?.(
              event.requestId,
            );
            break;

          case "delta":
            callbacks.onDelta?.(
              event.delta,
            );
            break;

          case "complete":
            callbacks.onComplete?.(
              event.result,
            );
            break;

          case "error": {
            const error = new Error(
              event.error.message,
            );

            callbacks.onError?.(
              error,
            );

            throw error;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
