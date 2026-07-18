import { NextResponse } from "next/server";

import {
  universalConfig,
} from "../../../../lib/universal/core";

import {
  bootstrapUniversalProviders,
  universalProviderRegistry,
} from "../../../../lib/universal/providers";

import type {
  UniversalHealthStatus,
} from "../../../../lib/universal/core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const processStartedAt = Date.now();

export async function GET() {
  bootstrapUniversalProviders();

  const providers =
    universalProviderRegistry.summaries();

  const configuredProviders =
    providers.filter(
      (provider) => provider.configured,
    ).length;

  const enabledProviders =
    providers.filter(
      (provider) => provider.enabled,
    ).length;

  const health: UniversalHealthStatus = {
    status:
      configuredProviders > 0
        ? "healthy"
        : "degraded",
    service: universalConfig.appName,
    version: universalConfig.appVersion,
    environment:
      universalConfig.environment,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(
      (Date.now() - processStartedAt) /
        1000,
    ),
    providers: {
      total: providers.length,
      configured:
        configuredProviders,
      enabled: enabledProviders,
    },
  };

  return NextResponse.json({
    ok: true,
    health,
    providers,
    architecture: {
      core: true,
      eventBus: true,
      logger: true,
      serviceRegistry: true,
      providerRegistry: true,
      multiProviderEngine: true,
      intelligentRouter: true,
      fallback: true,
    },
  });
}
