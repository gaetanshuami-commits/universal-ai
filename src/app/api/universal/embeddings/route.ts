import {
  EmbeddingError,
  createEmbeddingBatches,
  type EmbeddingProviderName,
} from "@/lib/universal/rag";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface EmbeddingApiRequest {
  texts?: unknown;
  provider?: unknown;
  model?: unknown;
  dimensions?: unknown;
}

function parseProvider(
  value: unknown,
): EmbeddingProviderName {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "openai";
  }

  if (value === "openai") {
    return value;
  }

  throw new EmbeddingError(
    "Fournisseur d'embeddings invalide.",
    {
      statusCode: 400,
      provider: "openai",
    },
  );
}

function parseModel(
  value: unknown,
): string | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  if (
    typeof value !== "string"
  ) {
    throw new EmbeddingError(
      "Le modèle d'embeddings est invalide.",
      {
        statusCode: 400,
        provider: "openai",
      },
    );
  }

  return value.trim();
}

function parseDimensions(
  value: unknown,
): number | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new EmbeddingError(
      "Le nombre de dimensions est invalide.",
      {
        statusCode: 400,
        provider: "openai",
      },
    );
  }

  return value;
}

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const body =
      await request.json() as
        EmbeddingApiRequest;

    if (
      !Array.isArray(
        body.texts,
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

    const texts =
      body.texts.map(
        (text, index) => {
          if (
            typeof text !==
            "string"
          ) {
            throw new EmbeddingError(
              `Le texte à l'index ${index} est invalide.`,
              {
                statusCode: 400,
                provider:
                  "openai",
              },
            );
          }

          return text;
        },
      );

    const result =
      await createEmbeddingBatches(
        texts,
        {
          provider:
            parseProvider(
              body.provider,
            ),
          model:
            parseModel(
              body.model,
            ),
          dimensions:
            parseDimensions(
              body.dimensions,
            ),
        },
      );

    return Response.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Universal embeddings error:",
      error,
    );

    if (
      error instanceof
      EmbeddingError
    ) {
      return Response.json(
        {
          ok: false,
          error:
            error.message,
          provider:
            error.provider,
        },
        {
          status:
            error.statusCode,
        },
      );
    }

    return Response.json(
      {
        ok: false,
        error:
          "Une erreur interne est survenue pendant la génération des embeddings.",
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
    service:
      "universal-embeddings",
    providers: [
      "openai",
    ],
    defaultModel:
      process.env
        .OPENAI_EMBEDDING_MODEL ??
      "text-embedding-3-small",
    configured:
      Boolean(
        process.env
          .OPENAI_API_KEY,
      ),
  });
}
