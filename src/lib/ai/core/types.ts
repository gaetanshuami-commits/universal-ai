export type UniversalProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "universal";

export type UniversalModelMode =
  | "fast"
  | "reasoning"
  | "code"
  | "research"
  | "vision"
  | "voice"
  | "creative"
  | "agent"
  | "deep-analysis";

export type UniversalInputType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "repository";

export type UniversalCapability =
  | "chat"
  | "reasoning"
  | "coding"
  | "vision"
  | "audio"
  | "video"
  | "documents"
  | "web-search"
  | "tool-use"
  | "agents"
  | "long-context"
  | "structured-output";

export interface UniversalModelDefinition {
  id: string;
  provider: UniversalProviderId;
  displayName: string;
  description: string;
  enabled: boolean;
  priority: number;
  modes: UniversalModelMode[];
  inputTypes: UniversalInputType[];
  capabilities: UniversalCapability[];
  environmentVariable?: string;
  modelEnvironmentVariable?: string;
}

export interface UniversalRoutingRequest {
  prompt: string;
  mode?: UniversalModelMode;
  inputTypes?: UniversalInputType[];
  requiredCapabilities?: UniversalCapability[];
  preferredProvider?: UniversalProviderId;
}

export interface UniversalRoutingCandidate {
  model: UniversalModelDefinition;
  score: number;
  reasons: string[];
}

export interface UniversalRoutingResult {
  selectedModel: UniversalModelDefinition;
  confidence: number;
  mode: UniversalModelMode;
  candidates: UniversalRoutingCandidate[];
}
