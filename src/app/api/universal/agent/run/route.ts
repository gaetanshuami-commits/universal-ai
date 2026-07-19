import { NextResponse } from "next/server";

import {
  runAutonomousAgent,
} from "../../../../../lib/universal/agent";

interface RunAgentRequestBody {
  readonly goal?: unknown;
  readonly context?: unknown;
  readonly maxSteps?: unknown;
  readonly stopOnError?: unknown;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const body =
      (await request.json()) as RunAgentRequestBody;

    const goal =
      typeof body.goal === "string"
        ? body.goal.trim()
        : "";

    const context =
      typeof body.context === "string"
        ? body.context.trim()
        : undefined;

    const maxSteps =
      typeof body.maxSteps === "number"
        ? body.maxSteps
        : undefined;

    const stopOnError =
      typeof body.stopOnError === "boolean"
        ? body.stopOnError
        : false;

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

    const result =
      await runAutonomousAgent({
        goal,
        context,
        maxSteps,
        stopOnError,
      });

    return NextResponse.json({
      ok:
        result.run.status === "completed",
      ...result,
    });
  } catch (error) {
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
