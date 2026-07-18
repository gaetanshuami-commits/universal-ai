import {
  handleUniversalChatRequest,
} from "../../../../lib/universal/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Route de compatibilité.
 *
 * L'interface historique peut continuer à appeler
 * /api/ai/chat sans modification immédiate.
 *
 * Les formats suivants sont acceptés :
 *
 * { message: "Bonjour" }
 * { prompt: "Bonjour" }
 * { messages: [...] }
 * { messages: [...], provider: "openai" }
 * { messages: [...], mode: "code", stream: true }
 */
export async function POST(
  request: Request,
): Promise<Response> {
  return handleUniversalChatRequest(
    request,
  );
}
