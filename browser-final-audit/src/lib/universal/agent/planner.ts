import { randomUUID } from "node:crypto";

import {
  universalProviderManager,
} from "../provider-manager";

import type {
  UniversalChatMessage,
} from "../provider-manager";

import type {
  AgentPlan,
  AgentPlanStep,
  AgentPlannerResult,
  AgentToolId,
  CreateAgentPlanInput,
} from "./types";

const DEFAULT_MAX_STEPS = 8;
const MIN_MAX_STEPS = 2;
const ABSOLUTE_MAX_STEPS = 12;

interface RawPlannerStep {
  readonly title?: unknown;
  readonly objective?: unknown;
  readonly tool?: unknown;
  readonly dependsOn?: unknown;
  readonly successCriteria?: unknown;
}

interface RawPlannerResponse {
  readonly summary?: unknown;
  readonly estimatedComplexity?: unknown;
  readonly steps?: unknown;
  readonly warnings?: unknown;
}

function normalizeMaxSteps(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_STEPS;
  }

  return Math.min(
    ABSOLUTE_MAX_STEPS,
    Math.max(MIN_MAX_STEPS, Math.floor(value as number)),
  );
}

function safeString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function safeStringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizeTool(value: unknown): AgentToolId {
  const tool = safeString(value);

  const allowed: ReadonlyArray<AgentToolId> = [
    "web-search",
    "calculator",
    "vector-search",
    "file-extract",
    "llm",
    "none",
  ];

  return allowed.includes(tool as AgentToolId)
    ? (tool as AgentToolId)
    : "llm";
}

function extractJsonObject(content: string): string {
  const fenced = content.match(
    /```(?:json)?\s*([\s\S]*?)```/i,
  );

  const candidate = fenced?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "Le Planner n'a pas retourne un objet JSON valide.",
    );
  }

  return candidate.slice(start, end + 1);
}

function createPlannerMessages(
  input: CreateAgentPlanInput,
  maxSteps: number,
): ReadonlyArray<UniversalChatMessage> {
  const system = [
    "Tu es le planificateur de Universal AI.",
    "Transforme l'objectif utilisateur en un plan concret, court et executable.",
    "Tu ne dois executer aucune action.",
    "Retourne uniquement un objet JSON valide, sans commentaire ni Markdown.",
    "",
    "Schema obligatoire :",
    "{",
    '  "summary": "resume du plan",',
    '  "estimatedComplexity": "low | medium | high",',
    '  "steps": [',
    "    {",
    '      "title": "titre court",',
    '      "objective": "resultat attendu",',
    '      "tool": "web-search | calculator | vector-search | file-extract | llm | none",',
    '      "dependsOn": ["numero des etapes precedentes, ex: 1"],',
    '      "successCriteria": "condition de reussite"',
    "    }",
    "  ],",
    '  "warnings": ["risque ou limite utile"]',
    "}",
    "",
    `Maximum ${maxSteps} etapes.`,
    "Chaque etape doit produire un resultat utile pour la suivante.",
    "N'ajoute pas d'etape inutile.",
  ].join("\n");

  const user = [
    `Objectif : ${input.goal}`,
    input.context
      ? `Contexte : ${input.context}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      role: "system",
      content: system,
    },
    {
      role: "user",
      content: user,
    },
  ];
}

function buildPlanFromRaw(
  input: CreateAgentPlanInput,
  raw: RawPlannerResponse,
  maxSteps: number,
): AgentPlan {
  const rawSteps = Array.isArray(raw.steps)
    ? raw.steps.slice(0, maxSteps)
    : [];

  if (rawSteps.length === 0) {
    throw new Error(
      "Le Planner n'a produit aucune etape exploitable.",
    );
  }

  const generatedIds = rawSteps.map(
    (_, index) => `step-${index + 1}`,
  );

  const steps: AgentPlanStep[] = rawSteps.map(
    (item, index) => {
      const step = item as RawPlannerStep;

      const dependencyNumbers =
        safeStringArray(step.dependsOn)
          .map((dependency) =>
            Number.parseInt(dependency, 10),
          )
          .filter(
            (dependency) =>
              Number.isInteger(dependency) &&
              dependency > 0 &&
              dependency <= index,
          );

      return {
        id: generatedIds[index],
        order: index + 1,
        title:
          safeString(step.title) ||
          `Etape ${index + 1}`,
        objective:
          safeString(step.objective) ||
          "Produire le resultat attendu pour cette etape.",
        tool: normalizeTool(step.tool),
        dependsOn: dependencyNumbers.map(
          (dependency) =>
            generatedIds[dependency - 1],
        ),
        status: "pending",
        successCriteria:
          safeString(step.successCriteria) ||
          "Le resultat est exploitable par l'etape suivante.",
      };
    },
  );

  const complexity =
    raw.estimatedComplexity === "low" ||
    raw.estimatedComplexity === "medium" ||
    raw.estimatedComplexity === "high"
      ? raw.estimatedComplexity
      : steps.length <= 3
        ? "low"
        : steps.length <= 6
          ? "medium"
          : "high";

  return {
    id: randomUUID(),
    goal: input.goal,
    summary:
      safeString(raw.summary) ||
      `Plan en ${steps.length} etapes.`,
    createdAt: new Date().toISOString(),
    estimatedComplexity: complexity,
    steps,
    warnings: safeStringArray(raw.warnings),
  };
}

function createFallbackPlan(
  input: CreateAgentPlanInput,
  maxSteps: number,
): AgentPlan {
  const goal = input.goal.toLowerCase();
  const steps: Array<
    Omit<AgentPlanStep, "id" | "order" | "status">
  > = [];

  const addStep = (
    title: string,
    objective: string,
    tool: AgentToolId,
    successCriteria: string,
  ) => {
    if (steps.length >= maxSteps) {
      return;
    }

    steps.push({
      title,
      objective,
      tool,
      dependsOn:
        steps.length === 0
          ? []
          : [`step-${steps.length}`],
      successCriteria,
    });
  };

  addStep(
    "Clarifier l'objectif",
    "Identifier le livrable, les contraintes et les informations necessaires.",
    "llm",
    "Le resultat final attendu est defini sans ambiguite.",
  );

  if (
    goal.includes("pdf") ||
    goal.includes("document") ||
    goal.includes("fichier") ||
    goal.includes("excel") ||
    goal.includes("word")
  ) {
    addStep(
      "Extraire le contenu",
      "Lire et structurer les informations utiles du fichier.",
      "file-extract",
      "Les donnees importantes du fichier sont disponibles.",
    );
  }

  if (
    goal.includes("internet") ||
    goal.includes("web") ||
    goal.includes("recherche") ||
    goal.includes("actualite") ||
    goal.includes("recent")
  ) {
    addStep(
      "Rechercher les sources",
      "Trouver des informations externes pertinentes et recentes.",
      "web-search",
      "Des sources pertinentes permettent de traiter l'objectif.",
    );
  }

  if (
    goal.includes("calcul") ||
    goal.includes("budget") ||
    goal.includes("prix") ||
    goal.includes("cout") ||
    goal.includes("pourcentage")
  ) {
    addStep(
      "Effectuer les calculs",
      "Calculer et verifier les valeurs necessaires.",
      "calculator",
      "Les resultats numeriques sont verifies.",
    );
  }

  addStep(
    "Analyser les resultats",
    "Comparer, verifier et organiser toutes les informations obtenues.",
    "llm",
    "Les informations sont coherentes et repondent a l'objectif.",
  );

  addStep(
    "Produire le livrable",
    "Rediger la reponse finale dans le format demande.",
    "llm",
    "Le livrable est complet, clair et directement utilisable.",
  );

  return {
    id: randomUUID(),
    goal: input.goal,
    summary:
      "Plan de secours genere localement apres indisponibilite du planificateur IA.",
    createdAt: new Date().toISOString(),
    estimatedComplexity:
      steps.length <= 3
        ? "low"
        : steps.length <= 6
          ? "medium"
          : "high",
    steps: steps.map((step, index) => ({
      ...step,
      id: `step-${index + 1}`,
      order: index + 1,
      status: "pending",
    })),
    warnings: [
      "Plan genere avec le moteur de secours local.",
    ],
  };
}

export async function createAgentPlan(
  input: CreateAgentPlanInput,
): Promise<AgentPlannerResult> {
  const goal = input.goal.trim();

  if (goal.length < 3) {
    throw new Error(
      "L'objectif doit contenir au moins 3 caracteres.",
    );
  }

  const maxSteps = normalizeMaxSteps(input.maxSteps);

  try {
    const response =
      await universalProviderManager.chat({
        messages: createPlannerMessages(
          {
            ...input,
            goal,
          },
          maxSteps,
        ),
        task: "reasoning",
        temperature: 0.1,
        maxTokens: 1_800,
        allowFallbacks: true,
        dataCollection: "deny",
      });

    const parsed = JSON.parse(
      extractJsonObject(response.content),
    ) as RawPlannerResponse;

    return {
      plan: buildPlanFromRaw(
        {
          ...input,
          goal,
        },
        parsed,
        maxSteps,
      ),
      generatedBy: "openrouter",
      model: response.model,
    };
  } catch {
    return {
      plan: createFallbackPlan(
        {
          ...input,
          goal,
        },
        maxSteps,
      ),
      generatedBy: "fallback",
    };
  }
}
