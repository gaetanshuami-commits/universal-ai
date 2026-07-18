import { NextResponse } from "next/server";

import {
  normalizeUniversalError,
} from "../core";

import {
  normalizeChatInput,
} from "./normalize";

import {
  executeUniversalChat,
} from "./service";

import {
  createUniversalChatStream,
} from "./stream";

export async function handleUniversalChatRequest(
  request: Request,
): Promise<Response> {
  try {
    const body = await request.json();
    const input =
      normalizeChatInput(body);

    const acceptsEventStream =
      request.headers
        .get("accept")
        ?.includes(
          "text/event-stream",
        ) ?? false;

    if (
      input.stream ||
      acceptsEventStream
    ) {
      const stream =
        createUniversalChatStream(input);

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type":
            "text/event-stream; charset=utf-8",
          "Cache-Control":
            "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result =
      await executeUniversalChat(input);

    return NextResponse.json({
      ok: true,
      result,
      id: result.id,
      content: result.content,
      message: result.content,
      response: result.content,
      provider:
        result.metadata.providerId,
      providerId:
        result.metadata.providerId,
      model: result.metadata.model,
      mode: result.metadata.mode,
      fallbackUsed:
        result.metadata.fallbackUsed,
      usage: result.metadata.usage,
      routing: {
        selectedProviderId:
          result.metadata.providerId,
        mode: result.metadata.mode,
        fallbackUsed:
          result.metadata.fallbackUsed,
        attempts:
          result.metadata.attempts,
      },
    });
  } catch (error) {
    const normalized =
      normalizeUniversalError(error);

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: normalized.code,
          message:
            normalized.message,
          details:
            normalized.details,
        },
      },
      {
        status:
          normalized.statusCode,
      },
    );
  }
}
