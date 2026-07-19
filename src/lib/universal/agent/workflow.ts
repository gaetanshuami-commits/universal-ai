import { randomUUID } from "node:crypto";

import type {
  AgentStepExecution,
} from "./types";

import type {
  CreateWorkflowInput,
  RunWorkflowInput,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowTask,
  WorkflowTaskExecutor,
  WorkflowTaskState,
} from "./workflow-types";

const DEFAULT_MAX_PARALLEL_TASKS = 2;
const MAX_PARALLEL_TASKS = 5;
const DEFAULT_RETRY_DELAY_MS = 750;

function normalizeParallelLimit(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_PARALLEL_TASKS;
  }

  return Math.min(
    MAX_PARALLEL_TASKS,
    Math.max(
      1,
      Math.floor(value as number),
    ),
  );
}

function wait(
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  taskTitle: string,
): Promise<T> {
  let timeoutHandle:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeout = new Promise<never>(
    (_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `La tâche « ${taskTitle} » a dépassé le délai autorisé.`,
          ),
        );
      }, timeoutMs);
    },
  );

  try {
    return await Promise.race([
      operation,
      timeout,
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function createWorkflow(
  input: CreateWorkflowInput,
): WorkflowDefinition {
  const name = input.name.trim();
  const goal = input.goal.trim();

  if (name.length < 2) {
    throw new Error(
      "Le nom du workflow est trop court.",
    );
  }

  if (goal.length < 3) {
    throw new Error(
      "L'objectif du workflow est trop court.",
    );
  }

  if (input.tasks.length === 0) {
    throw new Error(
      "Le workflow doit contenir au moins une tâche.",
    );
  }

  const taskIds = input.tasks.map(
    (_, index) => `task-${index + 1}`,
  );

  const tasks: WorkflowTask[] =
    input.tasks.map((task, index) => {
      const dependencies =
        task.dependsOn.filter(
          (dependencyId) =>
            taskIds
              .slice(0, index)
              .includes(dependencyId),
        );

      return {
        ...task,
        id: taskIds[index],
        order: index + 1,
        title: task.title.trim(),
        objective: task.objective.trim(),
        dependsOn: dependencies,
        maxRetries: Math.max(
          0,
          Math.min(5, task.maxRetries),
        ),
        timeoutMs: Math.max(
          1_000,
          Math.min(
            300_000,
            task.timeoutMs,
          ),
        ),
      };
    });

  return {
    id: randomUUID(),
    name,
    goal,
    createdAt:
      new Date().toISOString(),
    tasks,
  };
}

function dependenciesCompleted(
  task: WorkflowTask,
  states:
    ReadonlyArray<WorkflowTaskState>,
): boolean {
  return task.dependsOn.every(
    (dependencyId) =>
      states.some(
        (state) =>
          state.taskId === dependencyId &&
          state.status === "completed",
      ),
  );
}

function dependencyFailed(
  task: WorkflowTask,
  states:
    ReadonlyArray<WorkflowTaskState>,
): boolean {
  return task.dependsOn.some(
    (dependencyId) =>
      states.some(
        (state) =>
          state.taskId === dependencyId &&
          (
            state.status === "failed" ||
            state.status === "cancelled" ||
            state.status === "skipped"
          ),
      ),
  );
}

function replaceTaskState(
  states: WorkflowTaskState[],
  nextState: WorkflowTaskState,
): void {
  const index = states.findIndex(
    (state) =>
      state.taskId === nextState.taskId,
  );

  if (index === -1) {
    states.push(nextState);
    return;
  }

  states[index] = nextState;
}

async function executeTaskWithRetry(
  task: WorkflowTask,
  executor: WorkflowTaskExecutor,
  executions:
    ReadonlyArray<AgentStepExecution>,
): Promise<WorkflowTaskState> {
  const startedAt =
    new Date().toISOString();

  let lastError = "";
  let attempt = 0;

  while (
    attempt <= task.maxRetries
  ) {
    attempt += 1;

    try {
      const output = await withTimeout(
        executor(task, executions),
        task.timeoutMs,
        task.title,
      );

      return {
        taskId: task.id,
        status: "completed",
        attempts: attempt,
        startedAt,
        completedAt:
          new Date().toISOString(),
        output,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        attempt <= task.maxRetries
      ) {
        await wait(
          DEFAULT_RETRY_DELAY_MS *
            attempt,
        );
      }
    }
  }

  return {
    taskId: task.id,
    status: "failed",
    attempts: attempt,
    startedAt,
    completedAt:
      new Date().toISOString(),
    error: lastError,
  };
}

export async function runWorkflow(
  input: RunWorkflowInput,
  executor: WorkflowTaskExecutor,
): Promise<WorkflowRun> {
  const runId = randomUUID();
  const startedAt =
    new Date().toISOString();

  const states:
    WorkflowTaskState[] =
      input.workflow.tasks.map(
        (task) => ({
          taskId: task.id,
          status: "pending",
          attempts: 0,
        }),
      );

  const executions:
    AgentStepExecution[] = [];

  const parallelLimit =
    normalizeParallelLimit(
      input.maxParallelTasks,
    );

  while (
    states.some(
      (state) =>
        state.status === "pending",
    )
  ) {
    let progressMade = false;

    for (
      const task of input.workflow.tasks
    ) {
      const currentState =
        states.find(
          (state) =>
            state.taskId === task.id,
        );

      if (
        !currentState ||
        currentState.status !== "pending"
      ) {
        continue;
      }

      if (
        dependencyFailed(task, states)
      ) {
        replaceTaskState(states, {
          taskId: task.id,
          status: "skipped",
          attempts: 0,
          completedAt:
            new Date().toISOString(),
          error:
            "Une dépendance requise a échoué.",
        });

        progressMade = true;
      }
    }

    const readyTasks =
      input.workflow.tasks
        .filter((task) => {
          const state =
            states.find(
              (candidate) =>
                candidate.taskId ===
                task.id,
            );

          return (
            state?.status === "pending" &&
            dependenciesCompleted(
              task,
              states,
            )
          );
        })
        .slice(0, parallelLimit);

    if (readyTasks.length === 0) {
      if (!progressMade) {
        break;
      }

      continue;
    }

    for (const task of readyTasks) {
      replaceTaskState(states, {
        taskId: task.id,
        status: "running",
        attempts: 0,
        startedAt:
          new Date().toISOString(),
      });
    }

    const results =
      await Promise.all(
        readyTasks.map((task) =>
          executeTaskWithRetry(
            task,
            executor,
            executions,
          ),
        ),
      );

    for (const result of results) {
      replaceTaskState(
        states,
        result,
      );

      const task =
        input.workflow.tasks.find(
          (candidate) =>
            candidate.id ===
            result.taskId,
        );

      if (!task) {
        continue;
      }

      executions.push({
        stepId: task.id,
        order: task.order,
        title: task.title,
        tool: task.tool,
        status:
          result.status === "completed"
            ? "completed"
            : "failed",
        startedAt:
          result.startedAt,
        completedAt:
          result.completedAt,
        output: result.output,
        error: result.error,
      });
    }

    if (
      input.stopOnError === true &&
      results.some(
        (result) =>
          result.status === "failed",
      )
    ) {
      for (const state of states) {
        if (
          state.status === "pending"
        ) {
          replaceTaskState(states, {
            ...state,
            status: "cancelled",
            completedAt:
              new Date().toISOString(),
            error:
              "Workflow interrompu après une erreur.",
          });
        }
      }

      break;
    }
  }

  const completed =
    states.filter(
      (state) =>
        state.status === "completed",
    );

  const failed =
    states.filter(
      (state) =>
        state.status === "failed",
    );

  const unfinished =
    states.filter(
      (state) =>
        state.status === "pending" ||
        state.status === "running",
    );

  const status: WorkflowRun["status"] =
    failed.length > 0 ||
    unfinished.length > 0
      ? "failed"
      : "completed";

  const finalOutput = completed
    .map((state) => {
      const task =
        input.workflow.tasks.find(
          (candidate) =>
            candidate.id ===
            state.taskId,
        );

      return [
        task
          ? `${task.order}. ${task.title}`
          : state.taskId,
        state.output,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return {
    id: runId,
    workflowId:
      input.workflow.id,
    status,
    startedAt,
    completedAt:
      new Date().toISOString(),
    taskStates: states,
    executions,
    finalOutput:
      finalOutput || undefined,
    error:
      status === "failed"
        ? "Le workflow n'a pas pu terminer toutes ses tâches."
        : undefined,
  };
}
