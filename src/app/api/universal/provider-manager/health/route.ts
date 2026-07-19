import { NextResponse } from "next/server";
import {
  universalProviderManager,
} from "@/lib/universal/provider-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers =
    await universalProviderManager.healthCheck();

  return NextResponse.json({
    ok: providers.some(
      (provider) => provider.reachable,
    ),
    providers,
  });
}
