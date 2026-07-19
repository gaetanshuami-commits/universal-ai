import type {
  DocumentChunk,
} from "./documentChunking";

export interface VectorIndexResponse {
  ok: boolean;
  indexed: number;
  totalIndexed: number;
  model: string;
  dimensions: number;
}

export interface VectorSearchMatch {
  score: number;
  id: string;
  document: string;
  chunk: number;
  text: string;
}

export interface VectorSearchResponse {
  query: string;
  topK: number;
  count: number;
  results: VectorSearchMatch[];
}

interface SearchOptions {
  topK?: number;
  minimumScore?: number;
  signal?: AbortSignal;
}

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const payload: unknown =
    await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload =
      payload as { error?: string } | null;

    throw new Error(
      errorPayload?.error ??
        "La requête RAG a échoué.",
    );
  }

  return payload as T;
}

export async function indexDocumentChunks(
  chunks: DocumentChunk[],
  signal?: AbortSignal,
): Promise<VectorIndexResponse> {
  if (chunks.length === 0) {
    return {
      ok: true,
      indexed: 0,
      totalIndexed: 0,
      model: "",
      dimensions: 0,
    };
  }

  const response = await fetch(
    "/api/universal/vector-index",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks,
      }),
      signal,
    },
  );

  return readResponse<VectorIndexResponse>(
    response,
  );
}

export async function searchDocumentChunks(
  query: string,
  options: SearchOptions = {},
): Promise<VectorSearchResponse> {
  const normalizedQuery = query.trim();
  const topK = options.topK ?? 6;

  if (!normalizedQuery) {
    return {
      query: "",
      topK,
      count: 0,
      results: [],
    };
  }

  const response = await fetch(
    "/api/universal/vector-search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: normalizedQuery,
        topK,
      }),
      signal: options.signal,
    },
  );

  const payload =
    await readResponse<VectorSearchResponse>(
      response,
    );

  const minimumScore =
    options.minimumScore ?? 0.15;

  const results =
    payload.results.filter(
      (result) =>
        result.score >= minimumScore,
    );

  return {
    ...payload,
    count: results.length,
    results,
  };
}

export function buildRagContext(
  results: VectorSearchMatch[],
): string {
  if (results.length === 0) {
    return "";
  }

  const sources =
    results.map(
      (result, index) =>
        [
          `SOURCE ${index + 1}`,
          `Document : ${result.document}`,
          `Passage : ${result.chunk + 1}`,
          `Score : ${result.score.toFixed(4)}`,
          "",
          result.text,
        ].join("\n"),
    );

  return [
    "Contexte documentaire récupéré automatiquement :",
    "",
    "Réponds à la question en utilisant prioritairement ces sources.",
    "N'invente aucune information absente des documents.",
    "Lorsque les documents ne permettent pas de répondre, indique-le clairement.",
    "",
    ...sources,
  ].join("\n\n---\n\n");
}
