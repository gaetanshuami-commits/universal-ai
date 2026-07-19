import type {
  AgentStepExecution,
  AgentToolId,
} from "./types";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export interface WorkflowTask {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly objective: string;
  readonly tool: AgentToolId;
  readonly dependsOn: ReadonlyArray<string>;
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

export interface WorkflowTaskState {
  readonly taskId: string;
  readonly status: WorkflowTaskStatus;
  readonly attempts: number;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly output?: string;
  readonly error?: string;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly goal: string;
  readonly createdAt: string;
  readonly tasks: ReadonlyArray<WorkflowTask>;
}

export interface WorkflowRun {
  readonly id: string;
  readonly workflowId: string;
  readonly status: WorkflowStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly taskStates: ReadonlyArray<WorkflowTaskState>;
  readonly executions: ReadonlyArray<AgentStepExecution>;
  readonly finalOutput?: string;
  readonly error?: string;
}

export interface CreateWorkflowInput {
  readonly name: string;
  readonly goal: string;
  readonly tasks: ReadonlyArray<
    Omit<WorkflowTask, "id" | "order">
  >;
}

export interface RunWorkflowInput {
  readonly workflow: WorkflowDefinition;
  readonly stopOnError?: boolean;
  readonly maxParallelTasks?: number;
}

export type WorkflowTaskExecutor = (
  task: WorkflowTask,
  completedExecutions:
    ReadonlyArray<AgentStepExecution>,
) => Promise<string>;
