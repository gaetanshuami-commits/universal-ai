import type {
  UniversalModelDefinition,
  UniversalProviderId,
} from "./types";

export const UNIVERSAL_MODELS: UniversalModelDefinition[] = [
  {
    id: "universal-auto",
    provider: "universal",
    displayName: "Universal Auto",
    description:
      "Sélectionne automatiquement le moteur le plus adapté à la demande.",
    enabled: true,
    priority: 100,
    modes: [
      "fast",
      "reasoning",
      "code",
      "research",
      "vision",
      "voice",
      "creative",
      "agent",
      "deep-analysis",
    ],
    inputTypes: [
      "text",
      "image",
      "audio",
      "video",
      "document",
      "repository",
    ],
    capabilities: [
      "chat",
      "reasoning",
      "coding",
      "vision",
      "audio",
      "video",
      "documents",
      "web-search",
      "tool-use",
      "agents",
      "long-context",
      "structured-output",
    ],
  },

  {
    id: "openai-primary",
    provider: "openai",
    displayName: "Universal Intelligence",
    description:
      "Moteur général pour conversation, raisonnement, outils et multimodal.",
    enabled: true,
    priority: 90,
    modes: [
      "fast",
      "reasoning",
      "vision",
      "voice",
      "agent",
      "deep-analysis",
    ],
    inputTypes: ["text", "image", "audio", "document"],
    capabilities: [
      "chat",
      "reasoning",
      "vision",
      "audio",
      "documents",
      "tool-use",
      "agents",
      "structured-output",
    ],
    environmentVariable: "OPENAI_API_KEY",
    modelEnvironmentVariable: "OPENAI_MODEL",
  },

  {
    id: "anthropic-primary",
    provider: "anthropic",
    displayName: "Universal Code",
    description:
      "Moteur spécialisé dans le code, les dépôts et les contextes longs.",
    enabled: true,
    priority: 88,
    modes: ["reasoning", "code", "agent", "deep-analysis"],
    inputTypes: ["text", "image", "document", "repository"],
    capabilities: [
      "chat",
      "reasoning",
      "coding",
      "vision",
      "documents",
      "tool-use",
      "agents",
      "long-context",
      "structured-output",
    ],
    environmentVariable: "ANTHROPIC_API_KEY",
    modelEnvironmentVariable: "ANTHROPIC_MODEL",
  },

  {
    id: "google-primary",
    provider: "google",
    displayName: "Universal Vision",
    description:
      "Moteur multimodal pour texte, images, audio, vidéo et documents.",
    enabled: true,
    priority: 86,
    modes: [
      "fast",
      "research",
      "vision",
      "voice",
      "creative",
      "deep-analysis",
    ],
    inputTypes: ["text", "image", "audio", "video", "document"],
    capabilities: [
      "chat",
      "reasoning",
      "vision",
      "audio",
      "video",
      "documents",
      "long-context",
      "structured-output",
    ],
    environmentVariable: "GOOGLE_AI_API_KEY",
    modelEnvironmentVariable: "GOOGLE_AI_MODEL",
  },

  {
    id: "deepseek-primary",
    provider: "deepseek",
    displayName: "Universal Deep Reasoning",
    description:
      "Moteur spécialisé dans le raisonnement technique et la génération de code.",
    enabled: true,
    priority: 84,
    modes: ["reasoning", "code", "deep-analysis"],
    inputTypes: ["text", "document", "repository"],
    capabilities: [
      "chat",
      "reasoning",
      "coding",
      "documents",
      "structured-output",
    ],
    environmentVariable: "DEEPSEEK_API_KEY",
    modelEnvironmentVariable: "DEEPSEEK_MODEL",
  },
];

export function getUniversalModels(): UniversalModelDefinition[] {
  return UNIVERSAL_MODELS.filter((model) => model.enabled);
}

export function getProviderModels(
  provider: UniversalProviderId,
): UniversalModelDefinition[] {
  return getUniversalModels().filter(
    (model) => model.provider === provider,
  );
}

export function isProviderConfigured(
  model: UniversalModelDefinition,
): boolean {
  if (model.provider === "universal") {
    return true;
  }

  if (!model.environmentVariable) {
    return false;
  }

  return Boolean(process.env[model.environmentVariable]);
}
