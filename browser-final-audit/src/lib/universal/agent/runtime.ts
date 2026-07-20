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

const STEP_TIMEOUT_MS = 45_000;
const MAX_CONTEXT_LENGTH = 18_000;

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle:
    | ReturnType<typeof setTimeout>
    | undefined;

  const timeout = new Promise<never>(
    (_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `${label} a dépassé le délai autorisé.`,
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
  const planner =
    await createAgentPlan({
      goal: input.goal,
      context: input.context,
      maxSteps: input.maxSteps,
    });

  const plan = planner.plan;
  const executions: AgentStepExecution[] = [];

  const runId = randomUUID();
  const startedAt =
    new Date().toISOString();

  for (const step of plan.steps) {
    const dependencyFailed =
      step.dependsOn.some(
        (dependencyId) =>
          !executions.some(
            (execution) =>
              execution.stepId === dependencyId &&
              execution.status === "completed",
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

    const startTime = Date.now();
    const stepStartedAt =
      new Date(startTime).toISOString();

    try {
      const output = await withTimeout(
        executeAgentStep(
          plan,
          step,
          executions,
        ),
        STEP_TIMEOUT_MS,
        `L’étape « ${step.title} »`,
      );

      const completionTime =
        new Date();

      executions.push({
        stepId: step.id,
        order: step.order,
        title: step.title,
        tool: step.tool,
        status: "completed",
        startedAt: stepStartedAt,
        completedAt:
          completionTime.toISOString(),
        durationMs:
          completionTime.getTime() -
          startTime,
        output,
      });
    } catch (error) {
      const completionTime =
        new Date();

      executions.push({
        stepId: step.id,
        order: step.order,
        title: step.title,
        tool: step.tool,
        status: "failed",
        startedAt: stepStartedAt,
        completedAt:
          completionTime.toISOString(),
        durationMs:
          completionTime.getTime() -
          startTime,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });

      if (input.stopOnError === true) {
        break;
      }
    }
  }

  const completedSteps =
    executions.filter(
      (execution) =>
        execution.status === "completed",
    );

  const failedSteps =
    executions.filter(
      (execution) =>
        execution.status === "failed",
    );

  let finalAnswer: string | undefined;

  if (completedSteps.length > 0) {
    finalAnswer = await withTimeout(
      generateFinalAnswer(
        plan,
        executions,
      ),
      STEP_TIMEOUT_MS,
      "La synthèse finale",
    );
  }

  const status: AgentRun["status"] =
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
