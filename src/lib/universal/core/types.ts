export type UniversalEnvironment =
  | "development"
  | "test"
  | "production";

export type UniversalLogLevel =
  | "debug"
  | "info"
  | "warn"
  | "error";

export type UniversalIdentifier = string;

export interface UniversalMetadata {
  readonly [key: string]: unknown;
}

export interface UniversalExecutionContext {
  readonly requestId: string;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly createdAt: Date;
  readonly metadata?: UniversalMetadata;
}

export interface UniversalResult<TData> {
  readonly success: boolean;
  readonly data?: TData;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: UniversalMetadata;
  };
}

export interface UniversalHealthStatus {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly service: string;
  readonly version: string;
  readonly environment: UniversalEnvironment;
  readonly timestamp: string;
  readonly uptimeSeconds: number;
  readonly providers: {
    readonly total: number;
    readonly configured: number;
    readonly enabled: number;
  };
}
