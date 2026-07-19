import type { WebSearchExecution } from "./types";

function cleanSnippet(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

export function formatWebSearchForModel(
  execution: WebSearchExecution,
): string {
  const { response, selectedProviderId } = execution;

  const sourceLines = response.results.map((result, index) => {
    const number = index + 1;
    const date = result.publishedDate ? ` - ${result.publishedDate}` : "";

    return [
      `[${number}] ${result.title}${date}`,
      `URL: ${result.url}`,
      `Excerpt: ${cleanSnippet(result.snippet)}`,
    ].join("\n");
  });

  const answer = response.answer
    ? ["Search engine summary:", response.answer, ""]
    : [];

  return [
    `Web search completed with ${selectedProviderId}.`,
    `Query: ${response.query}`,
    "",
    ...answer,
    "Sources:",
    ...sourceLines,
    "",
    "Response rules:",
    "- Use relevant sources above for recent factual claims.",
    "- Cite sources inline with [1], [2], and so on.",
    "- Do not invent facts missing from the results.",
    "- End with a Sources section listing the titles and URLs used.",
    "- Clearly state uncertainty or contradictions.",
  ].join("\n");
}
