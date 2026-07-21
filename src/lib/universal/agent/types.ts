export type AgentStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type AgentRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type AgentToolId =
  | "web-search"
  | "calculator"
  | "vector-search"
  | "file-extract"
  | "llm"
  | "none";

export interface AgentPlanStep {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly objective: string;
  readonly tool: AgentToolId;
  readonly dependsOn: ReadonlyArray<string>;
  readonly status: AgentStepStatus;
  readonly successCriteria: string;
}

export interface AgentPlan {
  readonly id: string;
  readonly goal: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly estimatedComplexity:
    | "low"
    | "medium"
    | "high";
  readonly steps: ReadonlyArray<AgentPlanStep>;
  readonly warnings: ReadonlyArray<string>;
}

export interface CreateAgentPlanInput {
  readonly goal: string;
  readonly context?: string;
  readonly maxSteps?: number;
}

export interface AgentPlannerResult {
  readonly plan: AgentPlan;
  readonly generatedBy:
    | "openrouter"
    | "fallback";
  readonly model?: string;
}

export interface AgentStepExecution {
  readonly stepId: string;
  readonly order: number;
  readonly title: string;
  readonly tool: AgentToolId;
  readonly status: AgentStepStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly attempts?: number;
  readonly output?: string;
  readonly error?: string;
}

export interface AgentRun {
  readonly id: string;
  readonly planId: string;
  readonly goal: string;
  readonly status: AgentRunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly steps:
    ReadonlyArray<AgentStepExecution>;
  readonly finalAnswer?: string;
  readonly error?: string;
}

export interface RunAgentInput {
  readonly goal: string;
  readonly context?: string;
  readonly maxSteps?: number;
  readonly stopOnError?: boolean;
  readonly maxRetriesPerStep?: number;
  readonly stepTimeoutMs?: number;
  readonly maxParallelSteps?: number;
  readonly signal?: AbortSignal;
}

export interface AgentRuntimeResult {
  readonly plan: AgentPlan;
  readonly run: AgentRun;
  readonly plannerGeneratedBy:
    | "openrouter"
    | "fallback";
  readonly plannerModel?: string;
}

