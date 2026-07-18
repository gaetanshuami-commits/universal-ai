import { NextResponse } from "next/server";

import {
  normalizeUniversalError,
} from "../../../../lib/universal/core";

import {
  universalAIRouter,
} from "../../../../lib/universal/router";

import type {
  UniversalRouterRequest,
} from "../../../../lib/universal/router";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as UniversalRouterRequest;

    const result =
      await universalAIRouter.route(body);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    const normalized =
      normalizeUniversalError(error);

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: normalized.code,
          message: normalized.message,
          details: normalized.details,
        },
      },
      {
        status: normalized.statusCode,
      },
    );
  }
}
