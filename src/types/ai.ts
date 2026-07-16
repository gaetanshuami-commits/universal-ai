export type AIProvider = "openai" | "anthropic" | "gemini";

export type PlatformMode =
  | "chat"
  | "code"
  | "company"
  | "gamer"
  | "streamer"
  | "creator"
  | "builder"
  | "camera"
  | "life"
  | "scientist"
  | "movie"
  | "dream"
  | "time-machine"
  | "universe"
  | "impossible";

export interface AIModel {
  id: string;
  provider: AIProvider;
  name: string;
  description: string;
  enabled: boolean;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
}
