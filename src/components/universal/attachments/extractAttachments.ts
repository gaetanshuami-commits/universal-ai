import type {
  ChatAttachment,
} from "./attachmentTypes";

export interface ExtractedAttachment {
  name: string;
  mimeType: string;
  extension: string;
  size: number;
  category:
    | "pdf"
    | "word"
    | "spreadsheet"
    | "text"
    | "json";
  text: string;
  characterCount: number;
  returnedCharacterCount: number;
  truncated: boolean;
  pages?: number;
  sheets?: number;
}

export interface AttachmentExtractionError {
  name: string;
  error: string;
}

export interface AttachmentExtractionResponse {
  files: ExtractedAttachment[];
  errors: AttachmentExtractionError[];
  summary: {
    requested: number;
    extracted: number;
    failed: number;
  };
}

interface ExtractionApiError {
  error?: string;
}

export class AttachmentExtractionException
  extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);

    this.name =
      "AttachmentExtractionException";

    this.status = status;
  }
}

export async function extractAttachments(
  attachments: ChatAttachment[],
  signal?: AbortSignal,
): Promise<AttachmentExtractionResponse> {
  if (attachments.length === 0) {
    return {
      files: [],
      errors: [],
      summary: {
        requested: 0,
        extracted: 0,
        failed: 0,
      },
    };
  }

  const formData =
    new FormData();

  for (
    const attachment of
    attachments
  ) {
    formData.append(
      "files",
      attachment.file,
      attachment.name,
    );
  }

  const response = await fetch(
    "/api/universal/files/extract",
    {
      method: "POST",
      body: formData,
      signal,
    },
  );

  const payload: unknown =
    await response.json().catch(
      () => null,
    );

  if (!response.ok) {
    const apiError =
      payload as
        | ExtractionApiError
        | null;

    throw new AttachmentExtractionException(
      apiError?.error ??
        "Impossible d'analyser les fichiers.",
      response.status,
    );
  }

  return payload as
    AttachmentExtractionResponse;
}

export function buildAttachmentContext(
  result: AttachmentExtractionResponse,
): string {
  const sections =
    result.files.map(
      (file, index) => {
        const metadata = [
          `Document ${index + 1}`,
          `Nom : ${file.name}`,
          `Type : ${file.mimeType}`,
          `Catégorie : ${file.category}`,
          `Taille : ${file.size} octets`,
          file.pages !== undefined
            ? `Pages : ${file.pages}`
            : null,
          file.sheets !== undefined
            ? `Feuilles : ${file.sheets}`
            : null,
          file.truncated
            ? [
                "Attention : le contenu a été",
                "tronqué avant l'envoi à l'IA.",
              ].join(" ")
            : null,
        ]
          .filter(
            (
              value,
            ): value is string =>
              Boolean(value),
          )
          .join("\n");

        return [
          "=== DÉBUT DU DOCUMENT ===",
          metadata,
          "",
          file.text,
          "=== FIN DU DOCUMENT ===",
        ].join("\n");
      },
    );

  if (result.errors.length > 0) {
    const errorSection = [
      "=== FICHIERS NON ANALYSÉS ===",
      ...result.errors.map(
        (item) =>
          `${item.name} : ${item.error}`,
      ),
    ].join("\n");

    sections.push(errorSection);
  }

  return sections.join("\n\n");
}
