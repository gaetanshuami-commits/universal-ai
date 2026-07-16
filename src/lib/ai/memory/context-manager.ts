export type ChatRole = "user" | "assistant";

export interface ChatInputMessage {
  role: ChatRole;
  content: string;
}

export interface PreparedContext {
  messages: ChatInputMessage[];
  compacted: boolean;
  originalMessageCount: number;
  retainedMessageCount: number;
  estimatedCharacters: number;
}

const MAX_RECENT_MESSAGES = 30;
const MAX_CONTEXT_CHARACTERS = 120_000;
const SUMMARY_EXCERPT_LENGTH = 800;

export function prepareConversationContext(
  messages: ChatInputMessage[],
): PreparedContext {
  const estimatedCharacters = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  const shouldCompact =
    messages.length > MAX_RECENT_MESSAGES ||
    estimatedCharacters > MAX_CONTEXT_CHARACTERS;

  if (!shouldCompact) {
    return {
      messages,
      compacted: false,
      originalMessageCount: messages.length,
      retainedMessageCount: messages.length,
      estimatedCharacters,
    };
  }

  const recentMessages = messages.slice(-MAX_RECENT_MESSAGES);
  const olderMessages = messages.slice(0, -MAX_RECENT_MESSAGES);

  const summary = olderMessages
    .slice(-20)
    .map((message) => {
      const excerpt = message.content.slice(0, SUMMARY_EXCERPT_LENGTH);
      return `${message.role.toUpperCase()}: ${excerpt}`;
    })
    .join("\n\n");

  const memoryMessage: ChatInputMessage = {
    role: "assistant",
    content: [
      "[MEMOIRE CONDENSEE DES ECHANGES PRECEDENTS]",
      summary || "Aucun élément ancien significatif.",
      "[FIN DE LA MEMOIRE CONDENSEE]",
    ].join("\n\n"),
  };

  return {
    messages: [memoryMessage, ...recentMessages],
    compacted: true,
    originalMessageCount: messages.length,
    retainedMessageCount: recentMessages.length + 1,
    estimatedCharacters,
  };
}
