export type UniversalProviderId =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google";

export type UniversalTaskType =
  | "general"
  | "reasoning"
  | "code"
  | "vision"
  | "long-context"
  | "fast"
  | "economy";

export type UniversalProviderSort =
  | "price"
  | "latency"
  | "throughput";

export interface UniversalChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
}

export interface UniversalChatRequest {
  readonly messages: ReadonlyArray<UniversalChatMessage>;
  readonly model?: string;
  readonly task?: UniversalTaskType;
  readonly stream?: boolean;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly userId?: string;
  readonly sort?: UniversalProviderSort;
  readonly requireParameters?: boolean;
  readonly allowFallbacks?: boolean;
  readonly dataCollection?: "allow" | "deny";
}

export interface UniversalUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd?: number;
}

export interface UniversalChatResponse {
  readonly providerId: UniversalProviderId;
  readonly model: string;
  readonly content: string;
  readonly finishReason?: string;
  readonly usage?: UniversalUsage;
  readonly durationMs: number;
  readonly raw?: unknown;
}

export interface UniversalModel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly contextLength?: number;
  readonly inputModalities: ReadonlyArray<string>;
  readonly outputModalities: ReadonlyArray<string>;
  readonly promptPricePerMillion?: number;
  readonly completionPricePerMillion?: number;
  readonly providerId: UniversalProviderId;
}

export interface UniversalProviderHealth {
  readonly providerId: UniversalProviderId;
  readonly configured: boolean;
  readonly reachable: boolean;
  readonly latencyMs?: number;
  readonly error?: string;
}

export interface UniversalProviderAdapter {
  readonly id: UniversalProviderId;
  readonly name: string;

  isConfigured(): boolean;
  listModels(): Promise<ReadonlyArray<UniversalModel>>;
  healthCheck(): Promise<UniversalProviderHealth>;
  chat(request: UniversalChatRequest): Promise<UniversalChatResponse>;
  stream(request: UniversalChatRequest): Promise<Response>;
}
