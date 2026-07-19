import { NextRequest, NextResponse } from "next/server";
import {
  universalProviderManager,
} from "@/lib/universal/provider-manager";
import type {
  UniversalChatRequest,
} from "@/lib/universal/provider-manager";

export const dynamic = "force-dynamic";

function isChatRequest(
  value: unknown,
): value is UniversalChatRequest {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate = value as {
    readonly messages?: unknown;
  };

  return (
    Array.isArray(candidate.messages) &&
    candidate.messages.length > 0
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body = (await request.json()) as unknown;

    if (!isChatRequest(body)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A non-empty messages array is required.",
        },
        { status: 400 },
      );
    }

    if (body.stream) {
      return await universalProviderManager.stream(
        body,
      );
    }

    const result =
      await universalProviderManager.chat(body);

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
            : String(error),
      },
      { status: 500 },
    );
  }
}
