export type AgentStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

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
  readonly estimatedComplexity: "low" | "medium" | "high";
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
  readonly generatedBy: "openrouter" | "fallback";
  readonly model?: string;
}
