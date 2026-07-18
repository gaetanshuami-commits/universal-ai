import type {
  UniversalMessage,
  UniversalProviderCapability,
} from "../providers";

import type {
  UniversalTaskMode,
} from "../router";

export interface UniversalChatInput {
  readonly messages: ReadonlyArray<UniversalMessage>;
  readonly mode?: UniversalTaskMode;
  readonly providerId?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly allowFallback?: boolean;
  readonly stream?: boolean;
  readonly requiredCapabilities?:
    ReadonlyArray<UniversalProviderCapability>;
}

export interface UniversalChatMetadata {
  readonly requestId: string;
  readonly providerId: string;
  readonly model: string;
  readonly mode: UniversalTaskMode;
  readonly fallbackUsed: boolean;
  readonly finishReason?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly attempts: ReadonlyArray<{
    readonly providerId: string;
    readonly success: boolean;
    readonly durationMs: number;
    readonly error?: string;
  }>;
}

export interface UniversalChatResult {
  readonly id: string;
  readonly content: string;
  readonly metadata: UniversalChatMetadata;
}

export type UniversalChatStreamEvent =
  | {
      readonly type: "start";
      readonly requestId: string;
    }
  | {
      readonly type: "delta";
      readonly requestId: string;
      readonly delta: string;
    }
  | {
      readonly type: "complete";
      readonly requestId: string;
      readonly result: UniversalChatResult;
    }
  | {
      readonly type: "error";
      readonly requestId: string;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };
