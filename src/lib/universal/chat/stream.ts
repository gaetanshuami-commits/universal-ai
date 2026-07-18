import {
  normalizeUniversalError,
} from "../core";

import {
  executeUniversalChat,
} from "./service";

import type {
  UniversalChatInput,
  UniversalChatStreamEvent,
} from "./types";

const encoder = new TextEncoder();

export function createUniversalChatStream(
  input: UniversalChatInput,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const requestId =
        crypto.randomUUID();

      enqueueEvent(controller, {
        type: "start",
        requestId,
      });

      try {
        const result =
          await executeUniversalChat(input);

        const chunks =
          splitIntoReadableChunks(
            result.content,
          );

        for (const delta of chunks) {
          enqueueEvent(controller, {
            type: "delta",
            requestId:
              result.metadata.requestId,
            delta,
          });

          await delay(
            calculateDelay(delta),
          );
        }

        enqueueEvent(controller, {
          type: "complete",
          requestId:
            result.metadata.requestId,
          result,
        });
      } catch (error) {
        const normalized =
          normalizeUniversalError(error);

        enqueueEvent(controller, {
          type: "error",
          requestId,
          error: {
            code: normalized.code,
            message: normalized.message,
            details:
              normalized.details,
          },
        });
      } finally {
        controller.close();
      }
    },
  });
}

function enqueueEvent(
  controller:
    ReadableStreamDefaultController<Uint8Array>,
  event: UniversalChatStreamEvent,
): void {
  const payload =
    `data: ${JSON.stringify(event)}\n\n`;

  controller.enqueue(
    encoder.encode(payload),
  );
}

function splitIntoReadableChunks(
  content: string,
): string[] {
  if (!content) {
    return [];
  }

  const tokens =
    content.match(
      /\S+\s*|\s+/g,
    ) ?? [content];

  const chunks: string[] = [];
  let buffer = "";

  for (const token of tokens) {
    buffer += token;

    const shouldFlush =
      buffer.length >= 18 ||
      /[.!?;:\n]\s*$/.test(buffer);

    if (shouldFlush) {
      chunks.push(buffer);
      buffer = "";
    }
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
}

function calculateDelay(
  chunk: string,
): number {
  if (chunk.includes("\n")) {
    return 22;
  }

  return Math.min(
    30,
    Math.max(4, chunk.length),
  );
}

function delay(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
