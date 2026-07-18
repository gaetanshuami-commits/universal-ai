import { NextResponse } from "next/server";

import { routeUniversalModel } from "../../../../lib/ai/core/router";

import type {
  UniversalRoutingRequest,
} from "../../../../lib/ai/core/types";

export const dynamic = "force-dynamic";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body.",
        },
        {
          status: 400,
        },
      );
    }

    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : "";

    if (!prompt) {
      return NextResponse.json(
        {
          ok: false,
          error: "The prompt field is required.",
        },
        {
          status: 400,
        },
      );
    }

    const routingRequest: UniversalRoutingRequest = {
      prompt,
    };

    if (typeof body.mode === "string") {
      routingRequest.mode =
        body.mode as UniversalRoutingRequest["mode"];
    }

    if (typeof body.preferredProvider === "string") {
      routingRequest.preferredProvider =
        body.preferredProvider as UniversalRoutingRequest["preferredProvider"];
    }

    if (
      Array.isArray(body.inputTypes) &&
      body.inputTypes.every(
        (value) => typeof value === "string",
      )
    ) {
      routingRequest.inputTypes =
        body.inputTypes as UniversalRoutingRequest["inputTypes"];
    }

    if (
      Array.isArray(body.requiredCapabilities) &&
      body.requiredCapabilities.every(
        (value) => typeof value === "string",
      )
    ) {
      routingRequest.requiredCapabilities =
        body.requiredCapabilities as UniversalRoutingRequest["requiredCapabilities"];
    }

    const result = routeUniversalModel(routingRequest);

    return NextResponse.json({
      ok: true,
      routing: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to route the request.";

    console.error("Universal AI routing error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
