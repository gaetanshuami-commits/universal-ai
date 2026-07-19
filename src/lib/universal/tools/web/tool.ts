import type {
  UniversalTool,
  UniversalToolDetection,
} from "../types";
import { detectWebSearchIntent } from "./detector";
import { formatWebSearchForModel } from "./formatter";
import { executeWebSearch } from "./router";
import type { WebSearchIntent } from "./types";

interface WebSearchToolInput {
  readonly query: string;
  readonly intent: WebSearchIntent;
}

function isWebSearchToolInput(value: unknown): value is WebSearchToolInput {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    readonly query?: unknown;
    readonly intent?: unknown;
  };

  return (
    typeof candidate.query === "string" &&
    ["news", "general", "semantic", "deep"].includes(String(candidate.intent))
  );
}

export const webSearchTool: UniversalTool = {
  id: "web-search",
  name: "Web Search",
  description:
    "Searches fresh or specialized information with Tavily, Brave Search and Exa.",

  detect(context): UniversalToolDetection | null {
    const detection = detectWebSearchIntent(context);
    if (!detection) return null;

    return {
      toolId: "web-search",
      confidence: detection.confidence,
      input: {
        query: detection.query,
        intent: detection.intent,
      } satisfies WebSearchToolInput,
      reason: detection.reason,
    };
  },

  async execute(input) {
    if (!isWebSearchToolInput(input)) {
      throw new Error("Invalid web search request.");
    }

    const execution = await executeWebSearch({
      query: input.query,
      intent: input.intent,
      maxResults: input.intent === "deep" ? 8 : 6,
    });

    return {
      content: formatWebSearchForModel(execution),
      data: execution,
    };
  },
};
