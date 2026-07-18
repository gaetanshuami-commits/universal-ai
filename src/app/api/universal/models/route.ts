import { NextResponse } from "next/server";

import {
  bootstrapUniversalProviders,
  universalProviderRegistry,
} from "../../../../lib/universal/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  bootstrapUniversalProviders();

  const providers =
    universalProviderRegistry.list();

  const providerModels =
    await Promise.all(
      providers.map(
        async (provider) => ({
          id: provider.id,
          name: provider.name,
          enabled: provider.enabled,
          configured:
            provider.isConfigured(),
          models:
            await provider.listModels(),
        }),
      ),
    );

  return NextResponse.json({
    ok: true,
    providers: providerModels,
  });
}
