import {
  createExecutionContext,
} from "../core";

import {
  universalAIRouter,
} from "../router";

import {
  executeUniversalToolPipeline,
} from "../tools";

import type {
  UniversalChatInput,
  UniversalChatResult,
} from "./types";

export async function executeUniversalChat(
  input: UniversalChatInput,
): Promise<UniversalChatResult> {
  const context = createExecutionContext();

  const toolPipeline =
    await executeUniversalToolPipeline(
      input.messages,
      context.requestId,
    );

  const response =
    await universalAIRouter.route({
      messages: toolPipeline.messages,
      mode: input.mode ?? "auto",
      preferredProviderId:
        input.providerId,
      model: input.model,
      temperature:
        input.temperature,
      maxOutputTokens:
        input.maxOutputTokens,
      allowFallback:
        input.allowFallback,
      requiredCapabilities:
        input.requiredCapabilities,
      context,
    });

  return {
    id: response.id,
    content: response.content,
    metadata: {
      requestId: context.requestId,
      providerId:
        response.providerId,
      model: response.model,
      mode: response.routing.mode,
      fallbackUsed:
        response.routing.fallbackUsed,
      finishReason:
        response.finishReason,
      usage: response.usage,
      attempts:
        response.routing.attempts,
    },
  };
}