import type {
  UniversalMessage,
} from "../providers";

export interface UniversalToolDetectionContext {
  readonly messages:
    ReadonlyArray<UniversalMessage>;
}

export interface UniversalToolExecutionContext {
  readonly requestId: string;
  readonly messages:
    ReadonlyArray<UniversalMessage>;
}

export interface UniversalToolDetection {
  readonly toolId: string;
  readonly confidence: number;
  readonly input: unknown;
  readonly reason: string;
}

export interface UniversalToolResult {
  readonly toolId: string;
  readonly success: boolean;
  readonly content: string;
  readonly data?: unknown;
  readonly durationMs: number;
  readonly error?: string;
}

export interface UniversalTool {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  detect(
    context: UniversalToolDetectionContext,
  ): UniversalToolDetection | null;

  execute(
    input: unknown,
    context: UniversalToolExecutionContext,
  ): Promise<{
    readonly content: string;
    readonly data?: unknown;
  }>;
}

export interface UniversalToolPipelineResult {
  readonly messages:
    ReadonlyArray<UniversalMessage>;
  readonly executions:
    ReadonlyArray<UniversalToolResult>;
}