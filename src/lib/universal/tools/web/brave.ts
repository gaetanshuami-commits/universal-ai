import type {
  WebSearchProvider,
  WebSearchProviderResponse,
  WebSearchRequest,
  WebSearchResultItem,
} from "./types";
import {
  clampMaxResults,
  fetchWithTimeout,
  normalizeQuery,
  readErrorBody,
  safeString,
} from "./utils";

interface BraveWebResult {
  readonly title?: unknown;
  readonly url?: unknown;
  readonly description?: unknown;
  readonly age?: unknown;
  readonly page_age?: unknown;
}

interface BraveResponse {
  readonly web?: { readonly results?: unknown };
}

export const braveWebSearchProvider: WebSearchProvider = {
  id: "brave",
  name: "Brave Search",

  isConfigured() {
    return Boolean(
      (process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY)?.trim(),
    );
  },

  async search(request: WebSearchRequest): Promise<WebSearchProviderResponse> {
    const apiKey = (
      process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY
    )?.trim();

    if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is missing.");

    const startedAt = Date.now();
    const query = normalizeQuery(request.query);
    const url = new URL("https://api.search.brave.com/res/v1/web/search");

    url.searchParams.set("q", query);
    url.searchParams.set("count", String(clampMaxResults(request.maxResults)));
    url.searchParams.set("safesearch", "moderate");
    url.searchParams.set("extra_snippets", "true");

    if (request.intent === "news") {
      url.searchParams.set("freshness", "pw");
    }

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(`Brave ${response.status}: ${details || response.statusText}`);
    }

    const payload = (await response.json()) as BraveResponse;
    const rawResults = Array.isArray(payload.web?.results)
      ? payload.web.results
      : [];

    const results = rawResults
      .map((raw): WebSearchResultItem | null => {
        const item = raw as BraveWebResult;
        const title = safeString(item.title);
        const resultUrl = safeString(item.url);
        if (!title || !resultUrl) return null;

        return {
          title,
          url: resultUrl,
          snippet: safeString(item.description),
          publishedDate: safeString(item.page_age ?? item.age) || undefined,
          providerId: "brave",
        };
      })
      .filter((item): item is WebSearchResultItem => item !== null);

    return {
      providerId: "brave",
      query,
      results,
      durationMs: Date.now() - startedAt,
    };
  },
};
