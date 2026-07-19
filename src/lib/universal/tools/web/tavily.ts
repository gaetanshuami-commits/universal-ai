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
  safeNumber,
  safeString,
} from "./utils";

interface TavilyResult {
  readonly title?: unknown;
  readonly url?: unknown;
  readonly content?: unknown;
  readonly score?: unknown;
  readonly published_date?: unknown;
}

interface TavilyResponse {
  readonly answer?: unknown;
  readonly results?: unknown;
}

export const tavilyWebSearchProvider: WebSearchProvider = {
  id: "tavily",
  name: "Tavily",

  isConfigured() {
    return Boolean(process.env.TAVILY_API_KEY?.trim());
  },

  async search(request: WebSearchRequest): Promise<WebSearchProviderResponse> {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) throw new Error("TAVILY_API_KEY is missing.");

    const startedAt = Date.now();
    const query = normalizeQuery(request.query);

    const response = await fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: request.intent === "deep" ? "advanced" : "basic",
        topic: request.intent === "news" ? "news" : "general",
        max_results: clampMaxResults(request.maxResults),
        include_answer: request.intent === "deep" ? "advanced" : "basic",
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(`Tavily ${response.status}: ${details || response.statusText}`);
    }

    const payload = (await response.json()) as TavilyResponse;
    const rawResults = Array.isArray(payload.results) ? payload.results : [];

    const results = rawResults
      .map((raw): WebSearchResultItem | null => {
        const item = raw as TavilyResult;
        const title = safeString(item.title);
        const url = safeString(item.url);
        if (!title || !url) return null;

        return {
          title,
          url,
          snippet: safeString(item.content),
          score: safeNumber(item.score),
          publishedDate: safeString(item.published_date) || undefined,
          providerId: "tavily",
        };
      })
      .filter((item): item is WebSearchResultItem => item !== null);

    return {
      providerId: "tavily",
      query,
      results,
      answer: safeString(payload.answer) || undefined,
      durationMs: Date.now() - startedAt,
    };
  },
};
