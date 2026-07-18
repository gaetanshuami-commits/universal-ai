import {
  getUniversalModels,
  isProviderConfigured,
} from "./models";

import type {
  UniversalModelDefinition,
  UniversalModelMode,
  UniversalRoutingCandidate,
  UniversalRoutingRequest,
  UniversalRoutingResult,
} from "./types";

const CODE_PATTERNS = [
  "code",
  "typescript",
  "javascript",
  "python",
  "react",
  "next.js",
  "nextjs",
  "api",
  "repository",
  "github",
  "terminal",
  "powershell",
  "build",
  "bug",
  "erreur",
  "fonction",
  "classe",
  "database",
  "base de données",
];

const RESEARCH_PATTERNS = [
  "recherche",
  "chercher",
  "sources",
  "actualité",
  "marché",
  "concurrents",
  "étude",
  "rapport",
  "comparer",
  "vérifier",
];

const VISION_PATTERNS = [
  "image",
  "photo",
  "capture",
  "caméra",
  "scanner",
  "radio",
  "diagramme",
  "graphique",
  "voir",
  "visuel",
];

const CREATIVE_PATTERNS = [
  "créer",
  "design",
  "film",
  "vidéo",
  "musique",
  "logo",
  "publicité",
  "storyboard",
  "présentation",
];

const DEEP_REASONING_PATTERNS = [
  "raisonnement",
  "analyse approfondie",
  "problème complexe",
  "stratégie",
  "architecture",
  "plan détaillé",
  "hypothèse",
  "simulation",
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

function includesPattern(
  prompt: string,
  patterns: string[],
): boolean {
  const normalizedPrompt = normalize(prompt);

  return patterns.some((pattern) =>
    normalizedPrompt.includes(normalize(pattern)),
  );
}

function inferMode(prompt: string): UniversalModelMode {
  if (includesPattern(prompt, CODE_PATTERNS)) {
    return "code";
  }

  if (includesPattern(prompt, RESEARCH_PATTERNS)) {
    return "research";
  }

  if (includesPattern(prompt, VISION_PATTERNS)) {
    return "vision";
  }

  if (includesPattern(prompt, CREATIVE_PATTERNS)) {
    return "creative";
  }

  if (includesPattern(prompt, DEEP_REASONING_PATTERNS)) {
    return "deep-analysis";
  }

  return "fast";
}

function scoreModel(
  model: UniversalModelDefinition,
  request: UniversalRoutingRequest,
  mode: UniversalModelMode,
): UniversalRoutingCandidate {
  let score = model.priority;
  const reasons: string[] = [];

  if (model.provider === "universal") {
    return {
      model,
      score: 0,
      reasons: ["Meta-router only"],
    };
  }

  if (!isProviderConfigured(model)) {
    score -= 1000;
    reasons.push("Provider API key is not configured");
  } else {
    reasons.push("Provider is configured");
  }

  if (model.modes.includes(mode)) {
    score += 50;
    reasons.push(`Supports ${mode} mode`);
  } else {
    score -= 35;
  }

  if (
    request.preferredProvider &&
    model.provider === request.preferredProvider
  ) {
    score += 40;
    reasons.push("Matches preferred provider");
  }

  for (const inputType of request.inputTypes ?? ["text"]) {
    if (model.inputTypes.includes(inputType)) {
      score += 12;
      reasons.push(`Supports ${inputType} input`);
    } else {
      score -= 50;
    }
  }

  for (const capability of request.requiredCapabilities ?? []) {
    if (model.capabilities.includes(capability)) {
      score += 18;
      reasons.push(`Supports ${capability}`);
    } else {
      score -= 60;
    }
  }

  return {
    model,
    score,
    reasons,
  };
}

export function routeUniversalModel(
  request: UniversalRoutingRequest,
): UniversalRoutingResult {
  const prompt = request.prompt.trim();

  if (!prompt) {
    throw new Error("A prompt is required.");
  }

  const mode = request.mode ?? inferMode(prompt);

  const candidates = getUniversalModels()
    .filter((model) => model.provider !== "universal")
    .map((model) => scoreModel(model, request, mode))
    .sort((left, right) => right.score - left.score);

  const selectedCandidate = candidates[0];

  if (!selectedCandidate || selectedCandidate.score < 0) {
    throw new Error(
      "No configured AI provider can process this request.",
    );
  }

  const secondScore = candidates[1]?.score ?? 0;
  const difference = selectedCandidate.score - secondScore;

  const confidence = Math.max(
    0.5,
    Math.min(0.99, 0.65 + difference / 200),
  );

  return {
    selectedModel: selectedCandidate.model,
    confidence,
    mode,
    candidates: candidates.slice(0, 4),
  };
}
