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

interface ExaResult {
  readonly title?: unknown;
  readonly url?: unknown;
  readonly text?: unknown;
  readonly score?: unknown;
  readonly publishedDate?: unknown;
}

interface ExaResponse {
  readonly results?: unknown;
}

export const exaWebSearchProvider: WebSearchProvider = {
  id: "exa",
  name: "Exa",

  isConfigured() {
    return Boolean(process.env.EXA_API_KEY?.trim());
  },

  async search(request: WebSearchRequest): Promise<WebSearchProviderResponse> {
    const apiKey = process.env.EXA_API_KEY?.trim();
    if (!apiKey) throw new Error("EXA_API_KEY is missing.");

    const startedAt = Date.now();
    const query = normalizeQuery(request.query);

    const response = await fetchWithTimeout("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: request.intent === "deep" ? "deep" : "auto",
        numResults: clampMaxResults(request.maxResults),
        contents: {
          text: { maxCharacters: 1200 },
        },
      }),
    });

    if (!response.ok) {
      const details = await readErrorBody(response);
      throw new Error(`Exa ${response.status}: ${details || response.statusText}`);
    }

    const payload = (await response.json()) as ExaResponse;
    const rawResults = Array.isArray(payload.results) ? payload.results : [];

    const results = rawResults
      .map((raw): WebSearchResultItem | null => {
        const item = raw as ExaResult;
        const title = safeString(item.title);
        const url = safeString(item.url);
        if (!title || !url) return null;

        return {
          title,
          url,
          snippet: safeString(item.text),
          score: safeNumber(item.score),
          publishedDate: safeString(item.publishedDate) || undefined,
          providerId: "exa",
        };
      })
      .filter((item): item is WebSearchResultItem => item !== null);

    return {
      providerId: "exa",
      query,
      results,
      durationMs: Date.now() - startedAt,
    };
  },
};
