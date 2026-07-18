import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES =
  20 * 1024 * 1024;

const MAX_EXTRACTED_CHARACTERS =
  120_000;

type FileCategory =
  | "pdf"
  | "word"
  | "spreadsheet"
  | "text"
  | "json";

interface ExtractedFile {
  name: string;
  mimeType: string;
  extension: string;
  size: number;
  category: FileCategory;
  text: string;
  characterCount: number;
  returnedCharacterCount: number;
  truncated: boolean;
  pages?: number;
  sheets?: number;
}

interface ExtractionFailure {
  name: string;
  error: string;
}

function getExtension(
  filename: string,
): string {
  const dotIndex =
    filename.lastIndexOf(".");

  if (dotIndex < 0) {
    return "";
  }

  return filename
    .slice(dotIndex)
    .toLowerCase();
}

function normalizeText(
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

function limitExtractedText(
  value: string,
): {
  text: string;
  characterCount: number;
  returnedCharacterCount: number;
  truncated: boolean;
} {
  const normalized =
    normalizeText(value);

  const characterCount =
    normalized.length;

  const truncated =
    characterCount >
    MAX_EXTRACTED_CHARACTERS;

  const text = truncated
    ? normalized.slice(
        0,
        MAX_EXTRACTED_CHARACTERS,
      )
    : normalized;

  return {
    text,
    characterCount,
    returnedCharacterCount:
      text.length,
    truncated,
  };
}

function validateFile(
  file: File,
): void {
  if (!file.name.trim()) {
    throw new Error(
      "Le fichier ne possède pas de nom.",
    );
  }

  if (file.size <= 0) {
    throw new Error(
      `${file.name} est vide.`,
    );
  }

  if (
    file.size >
    MAX_FILE_SIZE_BYTES
  ) {
    throw new Error(
      `${file.name} dépasse la limite de 20 Mo.`,
    );
  }
}

async function extractPdf(
  buffer: Buffer,
): Promise<{
  text: string;
  pages: number;
}> {
  const result =
    await extractText(
      new Uint8Array(buffer),
      {
        mergePages: true,
      },
    );

  return {
    text: result.text,
    pages: result.totalPages,
  };
}

async function extractWord(
  buffer: Buffer,
): Promise<string> {
  const result =
    await mammoth.extractRawText({
      buffer,
    });

  return result.value;
}

function extractSpreadsheet(
  buffer: Buffer,
): {
  text: string;
  sheets: number;
} {
  const workbook =
    XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellText: true,
    });

  const sections =
    workbook.SheetNames.map(
      (sheetName) => {
        const worksheet =
          workbook.Sheets[
            sheetName
          ];

        if (!worksheet) {
          return [
            `### Feuille : ${sheetName}`,
            "(Feuille inaccessible)",
          ].join("\n");
        }

        const csv =
          XLSX.utils.sheet_to_csv(
            worksheet,
            {
              blankrows: false,
            },
          );

        return [
          `### Feuille : ${sheetName}`,
          csv || "(Feuille vide)",
        ].join("\n");
      },
    );

  return {
    text: sections.join(
      "\n\n",
    ),
    sheets:
      workbook.SheetNames.length,
  };
}

function extractJson(
  buffer: Buffer,
): string {
  const raw =
    buffer.toString("utf8");

  const parsed: unknown =
    JSON.parse(raw);

  return JSON.stringify(
    parsed,
    null,
    2,
  );
}

function extractPlainText(
  buffer: Buffer,
): string {
  return buffer.toString(
    "utf8",
  );
}

async function extractFile(
  file: File,
): Promise<ExtractedFile> {
  validateFile(file);

  const extension =
    getExtension(file.name);

  const mimeType =
    file.type ||
    "application/octet-stream";

  const buffer = Buffer.from(
    await file.arrayBuffer(),
  );

  let category: FileCategory;
  let extractedText = "";
  let pages: number | undefined;
  let sheets: number | undefined;

  if (
    mimeType ===
      "application/pdf" ||
    extension === ".pdf"
  ) {
    category = "pdf";

    const result =
      await extractPdf(buffer);

    extractedText =
      result.text;

    pages =
      result.pages;
  }
  else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    category = "word";

    extractedText =
      await extractWord(
        buffer,
      );
  }
  else if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType ===
      "application/vnd.ms-excel" ||
    extension === ".xlsx" ||
    extension === ".xls"
  ) {
    category =
      "spreadsheet";

    const result =
      extractSpreadsheet(
        buffer,
      );

    extractedText =
      result.text;

    sheets =
      result.sheets;
  }
  else if (
    mimeType ===
      "application/json" ||
    extension === ".json"
  ) {
    category = "json";

    extractedText =
      extractJson(buffer);
  }
  else if (
    mimeType.startsWith(
      "text/",
    ) ||
    [
      ".txt",
      ".md",
      ".markdown",
      ".csv",
      ".tsv",
      ".log",
      ".xml",
      ".html",
      ".css",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".sql",
      ".yaml",
      ".yml",
    ].includes(extension)
  ) {
    category = "text";

    extractedText =
      extractPlainText(
        buffer,
      );
  }
  else {
    throw new Error(
      `${file.name} n'est pas encore pris en charge.`,
    );
  }

  const limited =
    limitExtractedText(
      extractedText,
    );

  if (!limited.text) {
    throw new Error(
      `${file.name} ne contient aucun texte exploitable.`,
    );
  }

  return {
    name: file.name,
    mimeType,
    extension,
    size: file.size,
    category,
    text: limited.text,
    characterCount:
      limited.characterCount,
    returnedCharacterCount:
      limited.returnedCharacterCount,
    truncated:
      limited.truncated,
    ...(pages !== undefined
      ? { pages }
      : {}),
    ...(sheets !== undefined
      ? { sheets }
      : {}),
  };
}

export async function POST(
  request: Request,
): Promise<Response> {
  try {
    const contentType =
      request.headers.get(
        "content-type",
      );

    if (
      !contentType?.includes(
        "multipart/form-data",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "La requête doit utiliser multipart/form-data.",
        },
        {
          status: 415,
        },
      );
    }

    const formData =
      await request.formData();

    const entries =
      formData.getAll("files");

    const files =
      entries.filter(
        (
          entry,
        ): entry is File =>
          entry instanceof File,
      );

    if (files.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun fichier reçu.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      files.length >
      MAX_FILES
    ) {
      return NextResponse.json(
        {
          error:
            `Maximum ${MAX_FILES} fichiers par requête.`,
        },
        {
          status: 400,
        },
      );
    }

    const results =
      await Promise.allSettled(
        files.map(
          (file) =>
            extractFile(file),
        ),
      );

    const extractedFiles:
      ExtractedFile[] = [];

    const errors:
      ExtractionFailure[] = [];

    results.forEach(
      (result, index) => {
        const sourceFile =
          files[index];

        if (
          result.status ===
          "fulfilled"
        ) {
          extractedFiles.push(
            result.value,
          );

          return;
        }

        errors.push({
          name:
            sourceFile?.name ??
            "Fichier inconnu",
          error:
            result.reason instanceof
            Error
              ? result.reason.message
              : "Extraction impossible.",
        });
      },
    );

    const status =
      extractedFiles.length > 0
        ? 200
        : 422;

    return NextResponse.json(
      {
        files:
          extractedFiles,
        errors,
        summary: {
          requested:
            files.length,
          extracted:
            extractedFiles.length,
          failed:
            errors.length,
        },
      },
      {
        status,
      },
    );
  }
  catch (error) {
    console.error(
      "Document extraction error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur interne pendant l'extraction.",
      },
      {
        status: 500,
      },
    );
  }
}
