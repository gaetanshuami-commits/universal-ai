import { NextResponse } from "next/server";

import {
  AgentCancellationError,
  runAutonomousAgent,
} from "../../../../../lib/universal/agent";

interface RunAgentRequestBody {
  readonly goal?: unknown;
  readonly context?: unknown;
  readonly maxSteps?: unknown;
  readonly stopOnError?: unknown;
  readonly maxRetriesPerStep?: unknown;
  readonly stepTimeoutMs?: unknown;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const body =
      (await request.json()) as
        RunAgentRequestBody;

    const goal =
      typeof body.goal === "string"
        ? body.goal.trim()
        : "";

    const context =
      typeof body.context === "string"
        ? body.context.trim()
        : undefined;

    const maxSteps =
      typeof body.maxSteps === "number" &&
      Number.isFinite(body.maxSteps)
        ? body.maxSteps
        : undefined;

    const stopOnError =
      typeof body.stopOnError ===
      "boolean"
        ? body.stopOnError
        : false;

    const maxRetriesPerStep =
      typeof body.maxRetriesPerStep ===
        "number" &&
      Number.isFinite(
        body.maxRetriesPerStep,
      )
        ? body.maxRetriesPerStep
        : undefined;

    const stepTimeoutMs =
      typeof body.stepTimeoutMs ===
        "number" &&
      Number.isFinite(
        body.stepTimeoutMs,
      )
        ? body.stepTimeoutMs
        : undefined;

    if (goal.length < 3) {
      return NextResponse.json(
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

    if (request.signal.aborted) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: true,
          error:
            "La requête a été annulée avant son exécution.",
        },
        {
          status: 499,
        },
      );
    }

    const result =
      await runAutonomousAgent({
        goal,
        context,
        maxSteps,
        stopOnError,
        maxRetriesPerStep,
        stepTimeoutMs,
        signal: request.signal,
      });

    return NextResponse.json({
      ok:
        result.run.status ===
        "completed",
      ...result,
    });
  } catch (error) {
    const cancelled =
      error instanceof
        AgentCancellationError ||
      (
        error instanceof Error &&
        error.name === "AbortError"
      ) ||
      request.signal.aborted;

    if (cancelled) {
      return NextResponse.json(
        {
          ok: false,
          cancelled: true,
          error:
            "L'exécution de l'agent a été annulée.",
        },
        {
          status: 499,
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue du Runtime.",
      },
      {
        status: 500,
      },
    );
  }
}
