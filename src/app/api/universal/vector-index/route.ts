import type {
  DocumentChunk,
} from "@/components/universal/attachments/documentChunking";

import {
  createEmbeddingBatches,
} from "@/lib/universal/rag";

import {
  globalVectorStore,
} from "@/lib/universal/rag/vectorStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VectorIndexRequest {
  chunks?: unknown;
}

function isDocumentChunk(
  value: unknown,
): value is DocumentChunk {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const chunk =
    value as Partial<DocumentChunk>;

  return (
    typeof chunk.id === "string" &&
    typeof chunk.text === "string" &&
    typeof chunk.documentName === "string" &&
    typeof chunk.chunkIndex === "number"
  );
}

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const body =
      await request.json() as
        VectorIndexRequest;

    if (!Array.isArray(body.chunks)) {
      return Response.json(
        {
          ok: false,
          error:
            "Le champ chunks doit être un tableau.",
        },
        {
          status: 400,
        },
      );
    }

    if (body.chunks.length > 500) {
      return Response.json(
        {
          ok: false,
          error:
            "Maximum de 500 passages par requête.",
        },
        {
          status: 400,
        },
      );
    }

    const chunks =
      body.chunks.map(
        (value, index) => {
          if (!isDocumentChunk(value)) {
            throw new Error(
              `Passage invalide à l'index ${index}.`,
            );
          }

          const text = value.text.trim();

          if (!text) {
            throw new Error(
              `Passage vide à l'index ${index}.`,
            );
          }

          return {
            ...value,
            text,
          };
        },
      );

    if (chunks.length === 0) {
      return Response.json({
        ok: true,
        indexed: 0,
        totalIndexed:
          globalVectorStore.size(),
        model: "",
        dimensions: 0,
      });
    }

    const embeddingResult =
      await createEmbeddingBatches(
        chunks.map(
          (chunk) => chunk.text,
        ),
        {
          batchSize: 25,
        },
      );

    if (
      embeddingResult.embeddings.length !==
      chunks.length
    ) {
      throw new Error(
        "Tous les embeddings n'ont pas été générés.",
      );
    }

    globalVectorStore.addMany(
      chunks,
      embeddingResult.embeddings.map(
        (embedding) =>
          embedding.vector,
      ),
    );

    return Response.json({
      ok: true,
      indexed: chunks.length,
      totalIndexed:
        globalVectorStore.size(),
      model:
        embeddingResult.model,
      dimensions:
        embeddingResult.embeddings[0]
          ?.dimensions ?? 0,
    });
  }
  catch (error) {
    console.error(
      "Universal vector index error:",
      error,
    );

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "L'indexation vectorielle a échoué.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    indexed:
      globalVectorStore.size(),
  });
}
