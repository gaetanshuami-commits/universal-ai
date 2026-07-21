import { randomUUID } from "node:crypto";

import { universalProviderManager } from "../provider-manager";
import { executeUniversalToolPipeline } from "../tools";

import { createAgentPlan } from "./planner";

import type {
  AgentPlan,
  AgentPlanStep,
  AgentRuntimeResult,
  AgentRun,
  AgentStepExecution,
  RunAgentInput,
} from "./types";

const DEFAULT_STEP_TIMEOUT_MS = 45_000;
const MIN_STEP_TIMEOUT_MS = 5_000;
const MAX_STEP_TIMEOUT_MS = 180_000;

const DEFAULT_MAX_RETRIES_PER_STEP = 1;
const MAX_RETRIES_PER_STEP = 3;
const RETRY_DELAY_MS = 750;

const MAX_CONTEXT_LENGTH = 18_000;

function normalizeStepTimeout(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_STEP_TIMEOUT_MS;
  }

  return Math.min(
    MAX_STEP_TIMEOUT_MS,
    Math.max(
      MIN_STEP_TIMEOUT_MS,
      Math.floor(value as number),
    ),
  );
}

function normalizeMaxRetries(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RETRIES_PER_STEP;
  }

  return Math.min(
    MAX_RETRIES_PER_STEP,
    Math.max(
      0,
      Math.floor(value as number),
    ),
  );
}


export class AgentCancellationError extends Error {
  constructor(
    message =
      "L’exécution de l’agent a été annulée.",
  ) {
    super(message);
    this.name = "AgentCancellationError";
  }
}

function throwIfAgentCancelled(
  signal: AbortSignal | undefined,
): void {
  if (signal?.aborted === true) {
    throw new AgentCancellationError();
  }
}

function wait(
  durationMs: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAgentCancelled(signal);

  return new Promise((resolve, reject) => {
    let settled = false;

    let timeoutHandle:
      | ReturnType<typeof setTimeout>
      | undefined;

    const cleanup = (): void => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      signal?.removeEventListener(
        "abort",
        handleAbort,
      );
    };

    const complete = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    const handleAbort = (): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(new AgentCancellationError());
    };

    timeoutHandle =
      setTimeout(
        complete,
        durationMs,
      );

    signal?.addEventListener(
      "abort",
      handleAbort,
      {
        once: true,
      },
    );

    if (signal?.aborted === true) {
      handleAbort();
    }
  });
}


async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAgentCancelled(signal);

  let timeoutHandle:
    | ReturnType<typeof setTimeout>
    | undefined;

  let abortHandler:
    | (() => void)
    | undefined;

  const timeout =
    new Promise<never>(
      (_, reject) => {
        timeoutHandle =
          setTimeout(() => {
            reject(
              new Error(
                `${label} a dépassé le délai autorisé.`,
              ),
            );
          }, timeoutMs);
      },
    );

  const cancellation =
    new Promise<never>(
      (_, reject) => {
        if (!signal) {
          return;
        }

        abortHandler = (): void => {
          reject(
            new AgentCancellationError(),
          );
        };

        signal.addEventListener(
          "abort",
          abortHandler,
          {
            once: true,
          },
        );

        if (signal.aborted) {
          abortHandler();
        }
      },
    );

  try {
    return await Promise.race([
      operation,
      timeout,
      cancellation,
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    if (signal && abortHandler) {
      signal.removeEventListener(
        "abort",
        abortHandler,
      );
    }
  }
}

function getDependencyResults(
  step: AgentPlanStep,
  executions: ReadonlyArray<AgentStepExecution>,
): string {
  return executions
    .filter(
      (execution) =>
        step.dependsOn.includes(
          execution.stepId,
        ) &&
        execution.status === "completed" &&
        Boolean(execution.output),
    )
    .map(
      (execution) =>
        [
          `Résultat de l’étape ${execution.order}`,
          `Titre : ${execution.title}`,
          execution.output,
        ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_CONTEXT_LENGTH);
}

function getPreviousResults(
  executions: ReadonlyArray<AgentStepExecution>,
): string {
  return executions
    .filter(
      (execution) =>
        execution.status === "completed" &&
        Boolean(execution.output),
    )
    .map(
      (execution) =>
        [
          `Étape ${execution.order} — ${execution.title}`,
          execution.output,
        ].join("\n"),
    )
    .join("\n\n")
    .slice(0, MAX_CONTEXT_LENGTH);
}

async function executeWithLanguageModel(
  plan: AgentPlan,
  step: AgentPlanStep,
  executions: ReadonlyArray<AgentStepExecution>,
): Promise<string> {
  const dependencies =
    getDependencyResults(
      step,
      executions,
    );

  const previousResults =
    getPreviousResults(executions);

  const response =
    await universalProviderManager.chat({
      messages: [
        {
          role: "system",
          content: [
            "Tu exécutes une étape précise d’un agent autonome.",
            "Produis uniquement le résultat utile de cette étape.",
            "N’invente pas l’utilisation d’un outil qui n’a pas été exécuté.",
            "Le résultat doit être exploitable par les étapes suivantes.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Objectif global : ${plan.goal}`,
            `Étape actuelle : ${step.title}`,
            `Objectif de l’étape : ${step.objective}`,
            `Critère de réussite : ${step.successCriteria}`,
            dependencies
              ? `Résultats des dépendances :\n${dependencies}`
              : "",
            previousResults
              ? `Autres résultats déjà obtenus :\n${previousResults}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      task: "reasoning",
      temperature: 0.2,
      maxTokens: 1_800,
      allowFallbacks: true,
      dataCollection: "deny",
    });

  const content = response.content.trim();

  if (!content) {
    throw new Error(
      "Le modèle n’a retourné aucun résultat.",
    );
  }

  return content;
}

async function executeWithToolPipeline(
  plan: AgentPlan,
  step: AgentPlanStep,
  executions: ReadonlyArray<AgentStepExecution>,
): Promise<string> {
  const dependencies =
    getDependencyResults(
      step,
      executions,
    );

  const request = [
    `Objectif global : ${plan.goal}`,
    `Outil demandé : ${step.tool}`,
    `Action à exécuter : ${step.objective}`,
    `Critère de réussite : ${step.successCriteria}`,
    dependencies
      ? `Contexte disponible :\n${dependencies}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const pipeline =
    await executeUniversalToolPipeline(
      [
        {
          role: "user",
          content: request,
        },
      ],
      randomUUID(),
    );

  const preferredExecution =
    pipeline.executions.find(
      (execution) =>
        execution.toolId === step.tool &&
        execution.success &&
        execution.content.trim(),
    );

  if (preferredExecution) {
    return preferredExecution.content.trim();
  }

  const successfulExecution =
    pipeline.executions.find(
      (execution) =>
        execution.success &&
        execution.content.trim(),
    );

  if (successfulExecution) {
    return successfulExecution.content.trim();
  }

  const errors = pipeline.executions
    .filter(
      (execution) =>
        !execution.success &&
        execution.error,
    )
    .map(
      (execution) =>
        `${execution.toolId}: ${execution.error}`,
    );

  throw new Error(
    errors.length > 0
      ? errors.join(" | ")
      : `Aucun résultat n’a été produit pour l’outil ${step.tool}.`,
  );
}

async function executeAgentStep(
  plan: AgentPlan,
  step: AgentPlanStep,
  executions: ReadonlyArray<AgentStepExecution>,
): Promise<string> {
  if (
    step.tool === "llm" ||
    step.tool === "none"
  ) {
    return executeWithLanguageModel(
      plan,
      step,
      executions,
    );
  }

  return executeWithToolPipeline(
    plan,
    step,
    executions,
  );
}


async function executeAgentStepWithRetry(
  plan: AgentPlan,
  step: AgentPlanStep,
  executions:
    ReadonlyArray<AgentStepExecution>,
  maxRetries: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AgentStepExecution> {
  throwIfAgentCancelled(signal);

  const startedAtDate = new Date();
  const startedAt =
    startedAtDate.toISOString();

  let attempt = 0;
  let lastError = "";

  while (attempt <= maxRetries) {
    throwIfAgentCancelled(signal);

    attempt += 1;

    try {
      const output =
        await withTimeout(
          executeAgentStep(
            plan,
            step,
            executions,
          ),
          timeoutMs,
          `L’étape « ${step.title} »`,
          signal,
        );

      throwIfAgentCancelled(signal);

      const completedAtDate =
        new Date();

      return {
        stepId: step.id,
        order: step.order,
        title: step.title,
        tool: step.tool,
        status: "completed",
        startedAt,
        completedAt:
          completedAtDate.toISOString(),
        durationMs:
          completedAtDate.getTime() -
          startedAtDate.getTime(),
        attempts: attempt,
        output,
      };
    } catch (error) {
      if (
        error instanceof
          AgentCancellationError ||
        signal?.aborted === true
      ) {
        throw new AgentCancellationError();
      }

      lastError =
        error instanceof Error
          ? error.message
          : String(error);

      if (attempt <= maxRetries) {
        await wait(
          RETRY_DELAY_MS * attempt,
          signal,
        );
      }
    }
  }

  throwIfAgentCancelled(signal);

  const completedAtDate =
    new Date();

  return {
    stepId: step.id,
    order: step.order,
    title: step.title,
    tool: step.tool,
    status: "failed",
    startedAt,
    completedAt:
      completedAtDate.toISOString(),
    durationMs:
      completedAtDate.getTime() -
      startedAtDate.getTime(),
    attempts: attempt,
    error: lastError,
  };
}

async function generateFinalAnswer(
  plan: AgentPlan,
  executions: ReadonlyArray<AgentStepExecution>,
): Promise<string> {
  const results =
    getPreviousResults(executions);

  const failures = executions
    .filter(
      (execution) =>
        execution.status === "failed",
    )
    .map(
      (execution) =>
        `Étape ${execution.order}: ${execution.error}`,
    )
    .join("\n");

  const response =
    await universalProviderManager.chat({
      messages: [
        {
          role: "system",
          content: [
            "Tu finalises le travail d’un agent autonome.",
            "Utilise uniquement les résultats réellement obtenus.",
            "Produis une réponse claire, complète et directement utilisable.",
            "Mentionne brièvement les limites lorsqu’une étape a échoué.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Objectif : ${plan.goal}`,
            `Résumé du plan : ${plan.summary}`,
            `Résultats obtenus :\n${results}`,
            failures
              ? `Échecs rencontrés :\n${failures}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      task: "reasoning",
      temperature: 0.2,
      maxTokens: 2_500,
      allowFallbacks: true,
      dataCollection: "deny",
    });

  return response.content.trim();
}


export async function runAutonomousAgent(
  input: RunAgentInput,
): Promise<AgentRuntimeResult> {
  throwIfAgentCancelled(input.signal);

  const planner =
    await createAgentPlan({
      goal: input.goal,
      context: input.context,
      maxSteps: input.maxSteps,
    });

  throwIfAgentCancelled(input.signal);

  const plan = planner.plan;
  const executions:
    AgentStepExecution[] = [];

  const runId = randomUUID();
  const startedAt =
    new Date().toISOString();

  const maxRetries =
    normalizeMaxRetries(
      input.maxRetriesPerStep,
    );

  const stepTimeoutMs =
    normalizeStepTimeout(
      input.stepTimeoutMs,
    );

  for (const step of plan.steps) {
    throwIfAgentCancelled(
      input.signal,
    );

    const dependencyFailed =
      step.dependsOn.some(
        (dependencyId) =>
          !executions.some(
            (execution) =>
              execution.stepId ===
                dependencyId &&
              execution.status ===
                "completed",
          ),
      );

    if (dependencyFailed) {
      executions.push({
        stepId: step.id,
        order: step.order,
        title: step.title,
        tool: step.tool,
        status: "skipped",
        error:
          "Une dépendance requise n’a pas été terminée.",
      });

      continue;
    }

    const execution =
      await executeAgentStepWithRetry(
        plan,
        step,
        executions,
        maxRetries,
        stepTimeoutMs,
        input.signal,
      );

    throwIfAgentCancelled(
      input.signal,
    );

    executions.push(execution);

    if (
      execution.status === "failed" &&
      input.stopOnError === true
    ) {
      break;
    }
  }

  throwIfAgentCancelled(input.signal);

  const completedSteps =
    executions.filter(
      (execution) =>
        execution.status ===
        "completed",
    );

  const failedSteps =
    executions.filter(
      (execution) =>
        execution.status ===
        "failed",
    );

  let finalAnswer:
    | string
    | undefined;

  if (completedSteps.length > 0) {
    finalAnswer =
      await withTimeout(
        generateFinalAnswer(
          plan,
          executions,
        ),
        stepTimeoutMs,
        "La synthèse finale",
        input.signal,
      );

    throwIfAgentCancelled(
      input.signal,
    );
  }

  const status:
    AgentRun["status"] =
      completedSteps.length === 0
        ? "failed"
        : input.stopOnError === true &&
            failedSteps.length > 0
          ? "failed"
          : "completed";

  const run: AgentRun = {
    id: runId,
    planId: plan.id,
    goal: plan.goal,
    status,
    startedAt,
    completedAt:
      new Date().toISOString(),
    steps: executions,
    finalAnswer,
    error:
      status === "failed"
        ? "L’agent n’a pas pu terminer correctement la tâche."
        : undefined,
  };

  return {
    plan,
    run,
    plannerGeneratedBy:
      planner.generatedBy,
    plannerModel:
      planner.model,
  };
}
