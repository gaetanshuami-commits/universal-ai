import { NextResponse } from "next/server";
import { z } from "zod";
import {
  prepareConversationContext,
  type ChatInputMessage,
} from "@/lib/ai/memory/context-manager";
import { selectProvider } from "@/lib/ai/router/select-provider";
import { createProviderResponse } from "@/lib/ai/providers/provider-stream";
import { normalizeProviderStream } from "@/lib/ai/providers/normalize-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  provider: z
    .enum(["auto", "openai", "anthropic", "gemini"])
    .default("auto"),
  conversationId: z.string().min(1).max(200),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(250_000),
      }),
    )
    .min(1)
    .max(500),
});

const SYSTEM_PROMPT = `
Tu es le noyau de Universal AI, une plateforme d'intelligence artificielle
multi-modèles capable de réfléchir, rechercher, créer, coder et coordonner
des agents spécialisés.

Règles :
- Réponds avec précision et honnêteté.
- Ne prétends jamais avoir exécuté un outil qui n'a pas réellement été exécuté.
- Pour le code, donne des solutions robustes et vérifiables.
- Signale clairement les hypothèses et les limites.
- Préserve les décisions importantes du projet.
- Réponds dans la langue utilisée par l'utilisateur.
`.trim();

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());

    const context = prepareConversationContext(
      body.messages as ChatInputMessage[],
    );

    const latestUserMessage =
      [...body.messages]
        .reverse()
        .find((message) => message.role === "user")?.content ?? "";

    const provider = selectProvider({
      requestedProvider: body.provider,
      latestPrompt: latestUserMessage,
      estimatedCharacters: context.estimatedCharacters,
    });

    const providerResponse = await createProviderResponse({
      provider,
      messages: context.messages,
      systemPrompt: SYSTEM_PROMPT,
      signal: request.signal,
    });

    const stream = normalizeProviderStream(
      provider,
      providerResponse.body as ReadableStream<Uint8Array>,
    );

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        "X-AI-Provider": provider,
        "X-Context-Compacted": String(context.compacted),
        "X-Original-Message-Count": String(
          context.originalMessageCount,
        ),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Une erreur inconnue est survenue.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}
