import { NextResponse } from "next/server";

import {
  getUniversalModels,
  isProviderConfigured,
} from "../../../../lib/ai/core/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const models = getUniversalModels().map((model) => ({
    ...model,
    configured: isProviderConfigured(model),
    environmentVariable: undefined,
    modelEnvironmentVariable: undefined,
  }));

  return NextResponse.json({
    ok: true,
    platform: "Universal AI",
    models,
  });
}
