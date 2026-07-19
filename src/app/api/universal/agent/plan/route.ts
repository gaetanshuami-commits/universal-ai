import { NextResponse } from "next/server";

import {
  createAgentPlan,
} from "../../../../../lib/universal/agent";

interface PlanRequestBody {
  readonly goal?: unknown;
  readonly context?: unknown;
  readonly maxSteps?: unknown;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const body =
      (await request.json()) as PlanRequestBody;

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

    const result = await createAgentPlan({
      goal,
      context,
      maxSteps,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue du Planner.",
      },
      {
        status: 400,
      },
    );
  }
}
