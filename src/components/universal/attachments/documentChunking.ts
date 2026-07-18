import type {
  ExtractedAttachment,
} from "./extractAttachments";

export interface DocumentChunk {
  id: string;
  documentName: string;
  documentType: string;
  documentCategory:
    ExtractedAttachment["category"];
  documentIndex: number;
  chunkIndex: number;
  text: string;
  characterCount: number;
  startCharacter: number;
  endCharacter: number;
  metadata: {
    pages?: number;
    sheets?: number;
    sourceCharacterCount: number;
    sourceWasTruncated: boolean;
  };
}

export interface DocumentChunkingOptions {
  targetCharacters?: number;
  overlapCharacters?: number;
  minimumChunkCharacters?: number;
  maximumChunksPerDocument?: number;
}

export interface DocumentChunkingResult {
  chunks: DocumentChunk[];
  summary: {
    documentCount: number;
    chunkCount: number;
    sourceCharacterCount: number;
    chunkCharacterCount: number;
  };
}

const DEFAULT_TARGET_CHARACTERS =
  4_000;

const DEFAULT_OVERLAP_CHARACTERS =
  400;

const DEFAULT_MINIMUM_CHUNK_CHARACTERS =
  250;

const DEFAULT_MAXIMUM_CHUNKS_PER_DOCUMENT =
  250;

function normalizeDocumentText(
  value: string,
): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function createChunkId(
  documentIndex: number,
  chunkIndex: number,
  documentName: string,
): string {
  const normalizedName =
    documentName
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .slice(0, 48) ||
    "document";

  return [
    normalizedName,
    documentIndex,
    chunkIndex,
  ].join("-");
}

function findBestChunkEnd(
  text: string,
  start: number,
  targetEnd: number,
  minimumEnd: number,
): number {
  if (targetEnd >= text.length) {
    return text.length;
  }

  const searchStart =
    Math.max(
      minimumEnd,
      start,
    );

  const searchSection =
    text.slice(
      searchStart,
      targetEnd,
    );

  const paragraphBreak =
    searchSection.lastIndexOf(
      "\n\n",
    );

  if (paragraphBreak >= 0) {
    return (
      searchStart +
      paragraphBreak +
      2
    );
  }

  const sentenceMatches = [
    ...searchSection.matchAll(
      /[.!?](?:["')\]]*)\s+/g,
    ),
  ];

  const finalSentenceMatch =
    sentenceMatches.at(-1);

  if (
    finalSentenceMatch?.index !==
    undefined
  ) {
    return (
      searchStart +
      finalSentenceMatch.index +
      finalSentenceMatch[0].length
    );
  }

  const lineBreak =
    searchSection.lastIndexOf(
      "\n",
    );

  if (lineBreak >= 0) {
    return (
      searchStart +
      lineBreak +
      1
    );
  }

  const whitespace =
    searchSection.lastIndexOf(
      " ",
    );

  if (whitespace >= 0) {
    return (
      searchStart +
      whitespace +
      1
    );
  }

  return targetEnd;
}

function createDocumentChunks(
  document: ExtractedAttachment,
  documentIndex: number,
  options: Required<
    DocumentChunkingOptions
  >,
): DocumentChunk[] {
  const text =
    normalizeDocumentText(
      document.text,
    );

  if (!text) {
    return [];
  }

  if (
    text.length <=
    options.targetCharacters
  ) {
    return [
      {
        id: createChunkId(
          documentIndex,
          0,
          document.name,
        ),
        documentName:
          document.name,
        documentType:
          document.mimeType,
        documentCategory:
          document.category,
        documentIndex,
        chunkIndex: 0,
        text,
        characterCount:
          text.length,
        startCharacter: 0,
        endCharacter:
          text.length,
        metadata: {
          pages:
            document.pages,
          sheets:
            document.sheets,
          sourceCharacterCount:
            document.characterCount,
          sourceWasTruncated:
            document.truncated,
        },
      },
    ];
  }

  const chunks:
    DocumentChunk[] = [];

  let start = 0;
  let chunkIndex = 0;

  while (
    start < text.length &&
    chunkIndex <
      options.maximumChunksPerDocument
  ) {
    const targetEnd =
      Math.min(
        start +
          options.targetCharacters,
        text.length,
      );

    const minimumEnd =
      Math.min(
        start +
          options.minimumChunkCharacters,
        targetEnd,
      );

    let end =
      findBestChunkEnd(
        text,
        start,
        targetEnd,
        minimumEnd,
      );

    if (end <= start) {
      end = targetEnd;
    }

    const chunkText =
      text
        .slice(start, end)
        .trim();

    if (
      chunkText.length >=
        options.minimumChunkCharacters ||
      chunks.length === 0 ||
      end >= text.length
    ) {
      chunks.push({
        id: createChunkId(
          documentIndex,
          chunkIndex,
          document.name,
        ),
        documentName:
          document.name,
        documentType:
          document.mimeType,
        documentCategory:
          document.category,
        documentIndex,
        chunkIndex,
        text: chunkText,
        characterCount:
          chunkText.length,
        startCharacter:
          start,
        endCharacter:
          end,
        metadata: {
          pages:
            document.pages,
          sheets:
            document.sheets,
          sourceCharacterCount:
            document.characterCount,
          sourceWasTruncated:
            document.truncated,
        },
      });

      chunkIndex += 1;
    }

    if (end >= text.length) {
      break;
    }

    const nextStart =
      Math.max(
        end -
          options.overlapCharacters,
        start + 1,
      );

    start = nextStart;
  }

  return chunks;
}

function resolveOptions(
  options: DocumentChunkingOptions,
): Required<DocumentChunkingOptions> {
  const targetCharacters =
    Math.max(
      500,
      Math.floor(
        options.targetCharacters ??
          DEFAULT_TARGET_CHARACTERS,
      ),
    );

  const overlapCharacters =
    Math.max(
      0,
      Math.min(
        Math.floor(
          options.overlapCharacters ??
            DEFAULT_OVERLAP_CHARACTERS,
        ),
        targetCharacters - 1,
      ),
    );

  const minimumChunkCharacters =
    Math.max(
      1,
      Math.min(
        Math.floor(
          options.minimumChunkCharacters ??
            DEFAULT_MINIMUM_CHUNK_CHARACTERS,
        ),
        targetCharacters,
      ),
    );

  const maximumChunksPerDocument =
    Math.max(
      1,
      Math.floor(
        options.maximumChunksPerDocument ??
          DEFAULT_MAXIMUM_CHUNKS_PER_DOCUMENT,
      ),
    );

  return {
    targetCharacters,
    overlapCharacters,
    minimumChunkCharacters,
    maximumChunksPerDocument,
  };
}

export function chunkExtractedDocuments(
  documents: ExtractedAttachment[],
  options: DocumentChunkingOptions = {},
): DocumentChunkingResult {
  const resolvedOptions =
    resolveOptions(options);

  const chunks =
    documents.flatMap(
      (
        document,
        documentIndex,
      ) =>
        createDocumentChunks(
          document,
          documentIndex,
          resolvedOptions,
        ),
    );

  return {
    chunks,
    summary: {
      documentCount:
        documents.length,
      chunkCount:
        chunks.length,
      sourceCharacterCount:
        documents.reduce(
          (total, document) =>
            total +
            document.text.length,
          0,
        ),
      chunkCharacterCount:
        chunks.reduce(
          (total, chunk) =>
            total +
            chunk.characterCount,
          0,
        ),
    },
  };
}

export function buildChunkContext(
  chunks: DocumentChunk[],
): string {
  return chunks
    .map(
      (chunk) =>
        [
          "=== PASSAGE DOCUMENTAIRE ===",
          `Document : ${chunk.documentName}`,
          `Passage : ${chunk.chunkIndex + 1}`,
          `Caractères : ${chunk.startCharacter}-${chunk.endCharacter}`,
          "",
          chunk.text,
          "=== FIN DU PASSAGE ===",
        ].join("\n"),
    )
    .join("\n\n");
}
