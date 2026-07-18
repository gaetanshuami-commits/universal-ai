import type {
  UniversalExecutionContext,
  UniversalMetadata,
} from "../core/types";

export type UniversalProviderCapability =
  | "text"
  | "reasoning"
  | "code"
  | "vision"
  | "audio"
  | "video"
  | "documents"
  | "web-search"
  | "tools"
  | "structured-output"
  | "embeddings"
  | "image-generation";

export interface UniversalModel {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly capabilities:
    ReadonlyArray<UniversalProviderCapability>;
  readonly contextWindow?: number;
  readonly enabled: boolean;
}

export interface UniversalMessage {
  readonly role:
    | "system"
    | "user"
    | "assistant"
    | "tool";
  readonly content: string;
  readonly name?: string;
}

export interface UniversalGenerationRequest {
  readonly messages:
    ReadonlyArray<UniversalMessage>;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly metadata?: UniversalMetadata;
  readonly context?: UniversalExecutionContext;
}

export interface UniversalGenerationUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface UniversalGenerationResponse {
  readonly id: string;
  readonly providerId: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason?: string;
  readonly usage?: UniversalGenerationUsage;
  readonly metadata?: UniversalMetadata;
}

export interface UniversalProviderHealth {
  readonly healthy: boolean;
  readonly configured: boolean;
  readonly latencyMs?: number;
  readonly message?: string;
}

export interface UniversalAIProvider {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;

  isConfigured(): boolean;

  listModels(): Promise<
    ReadonlyArray<UniversalModel>
  >;

  generate(
    request: UniversalGenerationRequest,
  ): Promise<UniversalGenerationResponse>;

  healthCheck(): Promise<UniversalProviderHealth>;
}
