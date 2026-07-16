import type { AIProvider } from "@/types/ai";

export type RequestedProvider = AIProvider | "auto";

interface ProviderSelectionInput {
  requestedProvider: RequestedProvider;
  latestPrompt: string;
  estimatedCharacters: number;
}

export function selectProvider({
  requestedProvider,
  latestPrompt,
  estimatedCharacters,
}: ProviderSelectionInput): AIProvider {
  if (requestedProvider !== "auto") {
    return requestedProvider;
  }

  const prompt = latestPrompt.toLowerCase();

  const codingSignals = [
    "code",
    "coder",
    "projet",
    "repository",
    "repo",
    "github",
    "typescript",
    "javascript",
    "python",
    "next.js",
    "react",
    "bug",
    "erreur",
    "build",
    "terminal",
    "api",
    "base de données",
  ];

  const longContextSignals = [
    "long document",
    "gros document",
    "pdf",
    "vidéo",
    "video",
    "analyse complète",
    "contexte long",
  ];

  if (codingSignals.some((signal) => prompt.includes(signal))) {
    return "anthropic";
  }

  if (
    estimatedCharacters > 80_000 ||
    longContextSignals.some((signal) => prompt.includes(signal))
  ) {
    return "gemini";
  }

  return "openai";
}
