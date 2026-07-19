import { NextResponse } from "next/server";
import {
  universalProviderManager,
} from "@/lib/universal/provider-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const models =
      await universalProviderManager.listModels();

    return NextResponse.json({
      ok: true,
      count: models.length,
      models,
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
