import {
  AgentCancellationError,
  runAutonomousAgent,
} from "../../../../../lib/universal/agent";

import type {
  AgentRuntimeEvent,
} from "../../../../../lib/universal/agent/types";

interface StreamAgentRequestBody {
  readonly goal?: unknown;
  readonly context?: unknown;
  readonly maxSteps?: unknown;
  readonly stopOnError?: unknown;
  readonly maxRetriesPerStep?: unknown;
  readonly stepTimeoutMs?: unknown;
  readonly maxParallelSteps?: unknown;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder =
  new TextEncoder();

function encodeSse(
  eventName: string,
  data: unknown,
): Uint8Array {
  return encoder.encode(
    [
      `event: ${eventName}`,
      `data: ${JSON.stringify(data)}`,
      "",
      "",
    ].join("\n"),
  );
}

function getFiniteNumber(
  value: unknown,
): number | undefined {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : undefined;
}

export async function POST(
  request: Request,
): Promise<Response> {
  let body:
    StreamAgentRequestBody;

  try {
    body =
      (await request.json()) as
        StreamAgentRequestBody;
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Le corps JSON est invalide.",
      },
      {
        status: 400,
      },
    );
  }

  const goal =
    typeof body.goal === "string"
      ? body.goal.trim()
      : "";

  if (goal.length < 3) {
    return Response.json(
      {
        ok: false,
        error:
          "L'objectif doit contenir au moins 3 caractères.",
      },
      {
        status: 400,
      },
    );
  }

  const context =
    typeof body.context === "string"
      ? body.context.trim()
      : undefined;

  const stopOnError =
    typeof body.stopOnError ===
    "boolean"
      ? body.stopOnError
      : false;

  const stream =
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;

        const close = (): void => {
          if (closed) {
            return;
          }

          closed = true;

          try {
            controller.close();
          } catch {
            // Flux déjà fermé.
          }
        };

        const send = (
          eventName: string,
          data: unknown,
        ): void => {
          if (
            closed ||
            request.signal.aborted
          ) {
            return;
          }

          try {
            controller.enqueue(
              encodeSse(
                eventName,
                data,
              ),
            );
          } catch {
            close();
          }
        };

        send(
          "connected",
          {
            ok: true,
            timestamp:
              new Date().toISOString(),
          },
        );

        try {
          const result =
            await runAutonomousAgent({
              goal,
              context,
              maxSteps:
                getFiniteNumber(
                  body.maxSteps,
                ),
              stopOnError,
              maxRetriesPerStep:
                getFiniteNumber(
                  body.maxRetriesPerStep,
                ),
              stepTimeoutMs:
                getFiniteNumber(
                  body.stepTimeoutMs,
                ),
              maxParallelSteps:
                getFiniteNumber(
                  body.maxParallelSteps,
                ),
              signal:
                request.signal,
              onEvent: (
                event:
                  AgentRuntimeEvent,
              ) => {
                send(
                  event.type,
                  event,
                );
              },
            });

          send(
            "result",
            {
              ok:
                result.run.status ===
                "completed",
              ...result,
            },
          );

          send(
            "done",
            {
              ok: true,
              timestamp:
                new Date().toISOString(),
            },
          );
        } catch (error) {
          const cancelled =
            request.signal.aborted ||
            error instanceof
              AgentCancellationError ||
            (
              error instanceof Error &&
              error.name ===
                "AbortError"
            );

          if (!cancelled) {
            send(
              "error",
              {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Erreur inconnue du Runtime.",
              },
            );
          }
        } finally {
          close();
        }
      },
    });

  return new Response(
    stream,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/event-stream; charset=utf-8",
        "Cache-Control":
          "no-cache, no-transform",
        "X-Accel-Buffering":
          "no",
      },
    },
  );
}
