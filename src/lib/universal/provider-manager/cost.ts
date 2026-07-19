import type {
  UniversalUsage,
} from "./types";

export function estimateUsageCost(input: {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly promptPricePerToken?: number;
  readonly completionPricePerToken?: number;
}): UniversalUsage {
  const estimatedCostUsd =
    input.promptPricePerToken !== undefined &&
    input.completionPricePerToken !== undefined
      ? input.promptTokens * input.promptPricePerToken +
        input.completionTokens * input.completionPricePerToken
      : undefined;

  return {
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.promptTokens + input.completionTokens,
    estimatedCostUsd,
  };
}
