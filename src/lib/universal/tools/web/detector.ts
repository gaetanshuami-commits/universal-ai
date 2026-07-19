import type { UniversalToolDetectionContext } from "../types";
import type { WebSearchIntent } from "./types";

const explicitPatterns = [
  /\brecherche\b/i,
  /\bcherche\b/i,
  /\btrouve\b/i,
  /\bsearch\b/i,
  /\bfind\b/i,
  /\bsur internet\b/i,
  /\bsur le web\b/i,
  /\ben ligne\b/i,
  /\bavec des sources\b/i,
  /\bcite tes sources\b/i,
];

const freshnessPatterns = [
  /\baujourd'hui\b/i,
  /\bmaintenant\b/i,
  /\bactuel(?:le|s)?\b/i,
  /\brecent(?:e|es|s)?\b/i,
  /\bdernier(?:e|s|es)?\b/i,
  /\bactualite\b/i,
  /\bnews\b/i,
  /\b202[5-9]\b/i,
  /\bprix\b/i,
  /\bmeteo\b/i,
  /\bscore\b/i,
  /\bclassement\b/i,
];

const semanticPatterns = [
  /\barticle scientifique\b/i,
  /\bpublication\b/i,
  /\bresearch paper\b/i,
  /\betude\b/i,
  /\bdocumentation technique\b/i,
  /\bsource primaire\b/i,
  /\bgithub\b/i,
  /\brepository\b/i,
];

const deepPatterns = [
  /\brecherche approfondie\b/i,
  /\banalyse approfondie\b/i,
  /\bdeep research\b/i,
  /\bcomparaison detaillee\b/i,
  /\brapport complet\b/i,
];

function latestUserMessage(context: UniversalToolDetectionContext): string {
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const message = context.messages[index];
    if (message.role === "user") return message.content.trim();
  }
  return "";
}

function matchesAny(value: string, patterns: ReadonlyArray<RegExp>): boolean {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return patterns.some((pattern) => pattern.test(normalized));
}

export function detectWebSearchIntent(
  context: UniversalToolDetectionContext,
): {
  readonly query: string;
  readonly intent: WebSearchIntent;
  readonly confidence: number;
  readonly reason: string;
} | null {
  const query = latestUserMessage(context);
  if (!query) return null;

  const explicit = matchesAny(query, explicitPatterns);
  const fresh = matchesAny(query, freshnessPatterns);
  const semantic = matchesAny(query, semanticPatterns);
  const deep = matchesAny(query, deepPatterns);

  if (!explicit && !fresh && !semantic && !deep) return null;

  if (deep) {
    return {
      query,
      intent: "deep",
      confidence: 1,
      reason: "A deep web search was requested.",
    };
  }

  if (semantic) {
    return {
      query,
      intent: "semantic",
      confidence: explicit ? 1 : 0.9,
      reason: "A semantic or technical web search is required.",
    };
  }

  if (fresh) {
    return {
      query,
      intent: "news",
      confidence: explicit ? 1 : 0.9,
      reason: "The question depends on fresh information.",
    };
  }

  return {
    query,
    intent: "general",
    confidence: 0.95,
    reason: "An explicit web search was requested.",
  };
}
