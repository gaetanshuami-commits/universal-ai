import {
  handleUniversalChatRequest,
} from "../../../../lib/universal/chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: Request,
): Promise<Response> {
  return handleUniversalChatRequest(
    request,
  );
}
