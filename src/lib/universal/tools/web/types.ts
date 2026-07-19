export type WebSearchProviderId = "tavily" | "brave" | "exa";
export type WebSearchIntent = "news" | "general" | "semantic" | "deep";

export interface WebSearchRequest {
  readonly query: string;
  readonly intent: WebSearchIntent;
  readonly maxResults?: number;
}

export interface WebSearchResultItem {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly score?: number;
  readonly publishedDate?: string;
  readonly providerId: WebSearchProviderId;
}

export interface WebSearchProviderResponse {
  readonly providerId: WebSearchProviderId;
  readonly query: string;
  readonly results: ReadonlyArray<WebSearchResultItem>;
  readonly answer?: string;
  readonly durationMs: number;
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  readonly name: string;
  isConfigured(): boolean;
  search(request: WebSearchRequest): Promise<WebSearchProviderResponse>;
}

export interface WebSearchExecution {
  readonly selectedProviderId: WebSearchProviderId;
  readonly attempts: ReadonlyArray<{
    readonly providerId: WebSearchProviderId;
    readonly success: boolean;
    readonly durationMs: number;
    readonly error?: string;
  }>;
  readonly response: WebSearchProviderResponse;
}
