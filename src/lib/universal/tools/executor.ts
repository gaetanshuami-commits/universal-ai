import type {
  UniversalMessage,
} from "../providers";

import {
  detectUniversalTools,
} from "./detector";

import {
  bootstrapUniversalTools,
  universalToolRegistry,
} from "./registry";

import type {
  UniversalToolPipelineResult,
  UniversalToolResult,
} from "./types";

const TOOL_TIMEOUT_MS = 8_000;
const MAX_TOOLS_PER_REQUEST = 3;

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  toolId: string,
): Promise<TValue> {
  let timeoutHandle:
    ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise =
    new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new Error(
            `L'outil "${toolId}" a dépassé le délai autorisé.`,
          ),
        );
      }, timeoutMs);
    });

  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function buildToolContextMessage(
  executions:
    ReadonlyArray<UniversalToolResult>,
): UniversalMessage | null {
  const successful =
    executions.filter(
      (execution) =>
        execution.success,
    );

  if (successful.length === 0) {
    return null;
  }

  const content = [
    "Résultats fiables obtenus avec les outils internes :",
    "",
    ...successful.map(
      (execution) =>
        `- ${execution.toolId}: ${execution.content}`,
    ),
    "",
    "Utilise ces résultats pour répondre à l'utilisateur.",
    "Ne modifie pas les valeurs calculées.",
  ].join("\n");

  return {
    role: "system",
    content,
    name: "universal-tools",
  };
}

export async function executeUniversalToolPipeline(
  messages:
    ReadonlyArray<UniversalMessage>,
  requestId: string,
): Promise<UniversalToolPipelineResult> {
  bootstrapUniversalTools();

  const detections =
    detectUniversalTools({
      messages,
    }).slice(
      0,
      MAX_TOOLS_PER_REQUEST,
    );

  if (detections.length === 0) {
    return {
      messages,
      executions: [],
    };
  }

  const executions:
    UniversalToolResult[] = [];

  for (const detection of detections) {
    const startedAt = Date.now();

    try {
      const tool =
        universalToolRegistry.require(
          detection.toolId,
        );

      const output = await withTimeout(
        tool.execute(
          detection.input,
          {
            requestId,
            messages,
          },
        ),
        TOOL_TIMEOUT_MS,
        detection.toolId,
      );

      executions.push({
        toolId: detection.toolId,
        success: true,
        content: output.content,
        data: output.data,
        durationMs:
          Date.now() - startedAt,
      });
    } catch (error) {
      executions.push({
        toolId: detection.toolId,
        success: false,
        content: "",
        durationMs:
          Date.now() - startedAt,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  const toolContextMessage =
    buildToolContextMessage(executions);

  return {
    messages: toolContextMessage
      ? [
          toolContextMessage,
          ...messages,
        ]
      : messages,
    executions,
  };
}