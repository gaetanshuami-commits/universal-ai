import { braveWebSearchProvider } from "./brave";
import { exaWebSearchProvider } from "./exa";
import { tavilyWebSearchProvider } from "./tavily";
import type {
  WebSearchExecution,
  WebSearchIntent,
  WebSearchProvider,
  WebSearchProviderId,
  WebSearchRequest,
} from "./types";

const providers = new Map<WebSearchProviderId, WebSearchProvider>([
  ["tavily", tavilyWebSearchProvider],
  ["brave", braveWebSearchProvider],
  ["exa", exaWebSearchProvider],
]);

function getProviderOrder(
  intent: WebSearchIntent,
): ReadonlyArray<WebSearchProviderId> {
  switch (intent) {
    case "news":
      return ["tavily", "brave", "exa"];
    case "semantic":
    case "deep":
      return ["exa", "tavily", "brave"];
    case "general":
    default:
      return ["brave", "tavily", "exa"];
  }
}

export async function executeWebSearch(
  request: WebSearchRequest,
): Promise<WebSearchExecution> {
  const attempts: Array<{
    providerId: WebSearchProviderId;
    success: boolean;
    durationMs: number;
    error?: string;
  }> = [];

  for (const providerId of getProviderOrder(request.intent)) {
    const provider = providers.get(providerId);

    if (!provider || !provider.isConfigured()) {
      attempts.push({
        providerId,
        success: false,
        durationMs: 0,
        error: "Provider is not configured.",
      });
      continue;
    }

    const startedAt = Date.now();

    try {
      const response = await provider.search(request);

      if (response.results.length === 0) {
        attempts.push({
          providerId,
          success: false,
          durationMs: Date.now() - startedAt,
          error: "No result returned.",
        });
        continue;
      }

      attempts.push({
        providerId,
        success: true,
        durationMs: Date.now() - startedAt,
      });

      return {
        selectedProviderId: providerId,
        attempts,
        response,
      };
    } catch (error) {
      attempts.push({
        providerId,
        success: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const configured = Array.from(providers.values()).filter((provider) =>
    provider.isConfigured(),
  );

  if (configured.length === 0) {
    throw new Error(
      "No web search key is configured. Add TAVILY_API_KEY, EXA_API_KEY or BRAVE_SEARCH_API_KEY to .env.local.",
    );
  }

  const details = attempts
    .map((attempt) => `${attempt.providerId}: ${attempt.error ?? "unknown error"}`)
    .join(" | ");

  throw new Error(`All web search providers failed: ${details}`);
}
