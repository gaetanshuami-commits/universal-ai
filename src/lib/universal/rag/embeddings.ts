export type EmbeddingProviderName =
  "openai";

export interface EmbeddingRequest {
  texts: string[];
  model?: string;
  dimensions?: number;
}

export interface EmbeddingVector {
  index: number;
  text: string;
  vector: number[];
  dimensions: number;
}

export interface EmbeddingResult {
  provider: EmbeddingProviderName;
  model: string;
  embeddings: EmbeddingVector[];
  usage: {
    promptTokens?: number;
    totalTokens?: number;
  };
}

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName;

  embed(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResult>;
}

interface OpenAIEmbeddingItem {
  object: "embedding";
  index: number;
  embedding: number[];
}

interface OpenAIEmbeddingResponse {
  object: "list";
  model: string;
  data: OpenAIEmbeddingItem[];
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAIErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export class EmbeddingError
  extends Error {
  readonly statusCode: number;
  readonly provider:
    EmbeddingProviderName;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      provider:
        EmbeddingProviderName;
      details?: unknown;
    },
  ) {
    super(message);

    this.name =
      "EmbeddingError";

    this.statusCode =
      options.statusCode ?? 500;

    this.provider =
      options.provider;

    this.details =
      options.details;
  }
}

const DEFAULT_OPENAI_MODEL =
  "text-embedding-3-small";

const MAX_TEXTS_PER_REQUEST =
  100;

const MAX_TEXT_CHARACTERS =
  50_000;

function normalizeInputText(
  text: string,
): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function validateRequest(
  request: EmbeddingRequest,
): string[] {
  if (
    !Array.isArray(
      request.texts,
    )
  ) {
    throw new EmbeddingError(
      "Le champ texts doit être un tableau.",
      {
        statusCode: 400,
        provider: "openai",
      },
    );
  }

  if (
    request.texts.length === 0
  ) {
    throw new EmbeddingError(
      "Au moins un texte est requis.",
      {
        statusCode: 400,
        provider: "openai",
      },
    );
  }

  if (
    request.texts.length >
    MAX_TEXTS_PER_REQUEST
  ) {
    throw new EmbeddingError(
      `Un maximum de ${MAX_TEXTS_PER_REQUEST} textes est accepté par requête.`,
      {
        statusCode: 400,
        provider: "openai",
      },
    );
  }

  return request.texts.map(
    (text, index) => {
      if (
        typeof text !== "string"
      ) {
        throw new EmbeddingError(
          `Le texte à l'index ${index} est invalide.`,
          {
            statusCode: 400,
            provider: "openai",
          },
        );
      }

      const normalizedText =
        normalizeInputText(text);

      if (!normalizedText) {
        throw new EmbeddingError(
          `Le texte à l'index ${index} est vide.`,
          {
            statusCode: 400,
            provider: "openai",
          },
        );
      }

      if (
        normalizedText.length >
        MAX_TEXT_CHARACTERS
      ) {
        throw new EmbeddingError(
          `Le texte à l'index ${index} dépasse ${MAX_TEXT_CHARACTERS} caractères.`,
          {
            statusCode: 400,
            provider: "openai",
          },
        );
      }

      return normalizedText;
    },
  );
}

function normalizeVector(
  vector: number[],
): number[] {
  const magnitude =
    Math.sqrt(
      vector.reduce(
        (sum, value) =>
          sum + value * value,
        0,
      ),
    );

  if (
    !Number.isFinite(
      magnitude,
    ) ||
    magnitude === 0
  ) {
    return vector;
  }

  return vector.map(
    (value) =>
      value / magnitude,
  );
}

class OpenAIEmbeddingProvider
  implements EmbeddingProvider {
  readonly name =
    "openai" as const;

  async embed(
    request: EmbeddingRequest,
  ): Promise<EmbeddingResult> {
    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new EmbeddingError(
        "OPENAI_API_KEY n'est pas configurée.",
        {
          statusCode: 503,
          provider: this.name,
        },
      );
    }

    const texts =
      validateRequest(request);

    const model =
      request.model?.trim() ||
      process.env
        .OPENAI_EMBEDDING_MODEL ||
      DEFAULT_OPENAI_MODEL;

    const dimensions =
      request.dimensions;

    if (
      dimensions !== undefined &&
      (
        !Number.isInteger(
          dimensions,
        ) ||
        dimensions < 1
      )
    ) {
      throw new EmbeddingError(
        "Le nombre de dimensions doit être un entier positif.",
        {
          statusCode: 400,
          provider: this.name,
        },
      );
    }

    const requestBody: {
      model: string;
      input: string[];
      encoding_format: "float";
      dimensions?: number;
    } = {
      model,
      input: texts,
      encoding_format: "float",
    };

    if (
      dimensions !== undefined
    ) {
      requestBody.dimensions =
        dimensions;
    }

    let response: Response;

    try {
      response = await fetch(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${apiKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            requestBody,
          ),
          signal:
            AbortSignal.timeout(
              60_000,
            ),
        },
      );
    } catch (error) {
      throw new EmbeddingError(
        "Impossible de contacter le fournisseur d'embeddings.",
        {
          statusCode: 502,
          provider: this.name,
          details: error,
        },
      );
    }

    const payload: unknown =
      await response
        .json()
        .catch(() => null);

    if (!response.ok) {
      const errorPayload =
        payload as
          | OpenAIErrorResponse
          | null;

      throw new EmbeddingError(
        errorPayload?.error
          ?.message ||
          "La génération des embeddings a échoué.",
        {
          statusCode:
            response.status,
          provider: this.name,
          details: payload,
        },
      );
    }

    const embeddingResponse =
      payload as
        OpenAIEmbeddingResponse;

    if (
      !Array.isArray(
        embeddingResponse.data,
      ) ||
      embeddingResponse.data.length !==
        texts.length
    ) {
      throw new EmbeddingError(
        "La réponse du fournisseur d'embeddings est incomplète.",
        {
          statusCode: 502,
          provider: this.name,
          details: payload,
        },
      );
    }

    const orderedItems =
      [...embeddingResponse.data]
        .sort(
          (left, right) =>
            left.index -
            right.index,
        );

    const embeddings =
      orderedItems.map(
        (item, index) => {
          if (
            !Array.isArray(
              item.embedding,
            ) ||
            item.embedding.length ===
              0
          ) {
            throw new EmbeddingError(
              `Le vecteur à l'index ${index} est invalide.`,
              {
                statusCode: 502,
                provider:
                  this.name,
              },
            );
          }

          const vector =
            normalizeVector(
              item.embedding,
            );

          return {
            index,
            text: texts[index],
            vector,
            dimensions:
              vector.length,
          };
        },
      );

    return {
      provider: this.name,
      model:
        embeddingResponse.model ||
        model,
      embeddings,
      usage: {
        promptTokens:
          embeddingResponse
            .usage
            ?.prompt_tokens,
        totalTokens:
          embeddingResponse
            .usage
            ?.total_tokens,
      },
    };
  }
}

const providers: Record<
  EmbeddingProviderName,
  EmbeddingProvider
> = {
  openai:
    new OpenAIEmbeddingProvider(),
};

export function getEmbeddingProvider(
  name:
    EmbeddingProviderName =
      "openai",
): EmbeddingProvider {
  const provider =
    providers[name];

  if (!provider) {
    throw new EmbeddingError(
      `Fournisseur d'embeddings non pris en charge : ${name}`,
      {
        statusCode: 400,
        provider: name,
      },
    );
  }

  return provider;
}

export async function createEmbeddings(
  request: EmbeddingRequest,
  providerName:
    EmbeddingProviderName =
      "openai",
): Promise<EmbeddingResult> {
  const provider =
    getEmbeddingProvider(
      providerName,
    );

  return provider.embed(
    request,
  );
}

export async function createEmbeddingBatches(
  texts: string[],
  options: {
    provider?: EmbeddingProviderName;
    model?: string;
    dimensions?: number;
    batchSize?: number;
  } = {},
): Promise<EmbeddingResult> {
  if (texts.length === 0) {
    return {
      provider:
        options.provider ??
        "openai",
      model:
        options.model ??
        process.env
          .OPENAI_EMBEDDING_MODEL ??
        DEFAULT_OPENAI_MODEL,
      embeddings: [],
      usage: {},
    };
  }

  const batchSize =
    Math.max(
      1,
      Math.min(
        Math.floor(
          options.batchSize ??
            50,
        ),
        MAX_TEXTS_PER_REQUEST,
      ),
    );

  const results:
    EmbeddingResult[] = [];

  for (
    let start = 0;
    start < texts.length;
    start += batchSize
  ) {
    const batch =
      texts.slice(
        start,
        start + batchSize,
      );

    const result =
      await createEmbeddings(
        {
          texts: batch,
          model:
            options.model,
          dimensions:
            options.dimensions,
        },
        options.provider,
      );

    results.push(result);
  }

  const embeddings =
    results.flatMap(
      (result) =>
        result.embeddings,
    );

  return {
    provider:
      results[0].provider,
    model:
      results[0].model,
    embeddings:
      embeddings.map(
        (
          embedding,
          index,
        ) => ({
          ...embedding,
          index,
          text: texts[index],
        }),
      ),
    usage: {
      promptTokens:
        results.reduce(
          (total, result) =>
            total +
            (
              result.usage
                .promptTokens ??
              0
            ),
          0,
        ),
      totalTokens:
        results.reduce(
          (total, result) =>
            total +
            (
              result.usage
                .totalTokens ??
              0
            ),
          0,
        ),
    },
  };
}
