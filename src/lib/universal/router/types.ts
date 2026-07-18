import type {
  UniversalGenerationRequest,
  UniversalGenerationResponse,
  UniversalProviderCapability,
} from "../providers";

export type UniversalTaskMode =
  | "auto"
  | "fast"
  | "reasoning"
  | "code"
  | "creative"
  | "analysis"
  | "multimodal";

export interface UniversalRouterRequest
  extends UniversalGenerationRequest {
  readonly mode?: UniversalTaskMode;
  readonly preferredProviderId?: string;
  readonly requiredCapabilities?:
    ReadonlyArray<UniversalProviderCapability>;
  readonly allowFallback?: boolean;
}

export interface UniversalRoutingAttempt {
  readonly providerId: string;
  readonly success: boolean;
  readonly durationMs: number;
  readonly error?: string;
}

export interface UniversalRouterResponse
  extends UniversalGenerationResponse {
  readonly routing: {
    readonly mode: UniversalTaskMode;
    readonly selectedProviderId: string;
    readonly fallbackUsed: boolean;
    readonly attempts:
      ReadonlyArray<UniversalRoutingAttempt>;
  };
}
