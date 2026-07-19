import type {
  UniversalTaskType,
} from "./types";

export const OPENROUTER_DEFAULT_MODELS: Readonly<
  Record<UniversalTaskType, ReadonlyArray<string>>
> = {
  general: [
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash",
    "anthropic/claude-3.5-haiku",
  ],
  reasoning: [
    "openai/o4-mini",
    "deepseek/deepseek-r1",
    "anthropic/claude-sonnet-4",
  ],
  code: [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "google/gemini-2.5-pro",
  ],
  vision: [
    "google/gemini-2.5-pro",
    "openai/gpt-4.1",
    "anthropic/claude-sonnet-4",
  ],
  "long-context": [
    "google/gemini-2.5-pro",
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
  ],
  fast: [
    "google/gemini-2.5-flash",
    "openai/gpt-4.1-mini",
    "anthropic/claude-3.5-haiku",
  ],
  economy: [
    "deepseek/deepseek-chat-v3-0324",
    "google/gemini-2.5-flash-lite",
    "openai/gpt-4.1-nano",
  ],
};

export function selectOpenRouterModels(
  task: UniversalTaskType = "general",
): ReadonlyArray<string> {
  return OPENROUTER_DEFAULT_MODELS[task];
}
