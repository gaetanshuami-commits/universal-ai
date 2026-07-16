import type { AIProvider } from "@/types/ai";

function extractOpenAIText(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    payload.type === "response.output_text.delta" &&
    "delta" in payload &&
    typeof payload.delta === "string"
  ) {
    return payload.delta;
  }

  return "";
}

function extractAnthropicText(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "type" in payload &&
    payload.type === "content_block_delta" &&
    "delta" in payload &&
    typeof payload.delta === "object" &&
    payload.delta !== null &&
    "type" in payload.delta &&
    payload.delta.type === "text_delta" &&
    "text" in payload.delta &&
    typeof payload.delta.text === "string"
  ) {
    return payload.delta.text;
  }

  return "";
}

function extractGeminiText(payload: unknown): string {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("candidates" in payload) ||
    !Array.isArray(payload.candidates)
  ) {
    return "";
  }

  const candidate = payload.candidates[0];

  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("content" in candidate) ||
    typeof candidate.content !== "object" ||
    candidate.content === null ||
    !("parts" in candidate.content) ||
    !Array.isArray(candidate.content.parts)
  ) {
    return "";
  }

  return candidate.content.parts
    .map((part: unknown) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("");
}

function extractText(provider: AIProvider, payload: unknown): string {
  if (provider === "openai") {
    return extractOpenAIText(payload);
  }

  if (provider === "anthropic") {
    return extractAnthropicText(payload);
  }

  return extractGeminiText(payload);
}

export function normalizeProviderStream(
  provider: AIProvider,
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const dataLines = event
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());

            for (const data of dataLines) {
              if (!data || data === "[DONE]") {
                continue;
              }

              try {
                const payload = JSON.parse(data) as unknown;
                const text = extractText(provider, payload);

                if (text) {
                  controller.enqueue(encoder.encode(text));
                }
              } catch {
                // Certains fournisseurs peuvent envoyer des événements
                // sans contenu textuel. Ils sont ignorés proprement.
              }
            }
          }
        }

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });
}
