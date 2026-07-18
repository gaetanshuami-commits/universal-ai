import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  type AttachmentCategory,
  type AttachmentValidationResult,
  type ChatAttachment,
} from "./attachmentTypes";

export function createAttachmentId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join("-");
}

export function getFileExtension(
  filename: string,
): string {
  const index = filename.lastIndexOf(".");

  if (index < 0) {
    return "";
  }

  return filename
    .slice(index)
    .trim()
    .toLowerCase();
}

export function getAttachmentCategory(
  file: File,
): AttachmentCategory {
  const mimeType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    extension === ".xls" ||
    extension === ".xlsx" ||
    extension === ".csv"
  ) {
    return "spreadsheet";
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    extension === ".txt" ||
    extension === ".md" ||
    extension === ".json"
  ) {
    return "text";
  }

  if (
    mimeType === "application/pdf" ||
    mimeType.includes("word") ||
    extension === ".pdf" ||
    extension === ".doc" ||
    extension === ".docx"
  ) {
    return "document";
  }

  return "unknown";
}

export function formatFileSize(
  bytes: number,
): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const unitIndex = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024),
    ),
    units.length - 1,
  );

  const value =
    bytes / Math.pow(1024, unitIndex);

  return `${value.toFixed(
    unitIndex === 0 ? 0 : 1,
  )} ${units[unitIndex]}`;
}

export function validateAttachment(
  file: File,
  options?: {
    maxFileSizeBytes?: number;
    acceptedMimeTypes?: readonly string[];
    acceptedExtensions?: readonly string[];
  },
): AttachmentValidationResult {
  const maxFileSizeBytes =
    options?.maxFileSizeBytes ??
    MAX_ATTACHMENT_SIZE_BYTES;

  const acceptedMimeTypes =
    options?.acceptedMimeTypes ??
    ACCEPTED_ATTACHMENT_TYPES;

  const acceptedExtensions =
    options?.acceptedExtensions ??
    ACCEPTED_ATTACHMENT_EXTENSIONS;

  if (!file.name.trim()) {
    return {
      valid: false,
      error: "Le fichier n'a pas de nom valide.",
    };
  }

  if (file.size <= 0) {
    return {
      valid: false,
      error: `${file.name} est vide.`,
    };
  }

  if (file.size > maxFileSizeBytes) {
    return {
      valid: false,
      error: `${file.name} dépasse la limite de ${formatFileSize(
        maxFileSizeBytes,
      )}.`,
    };
  }

  const mimeType =
    file.type.trim().toLowerCase();

  const extension =
    getFileExtension(file.name);

  const mimeAccepted =
    Boolean(mimeType) &&
    acceptedMimeTypes.includes(mimeType);

  const extensionAccepted =
    Boolean(extension) &&
    acceptedExtensions.includes(extension);

  if (!mimeAccepted && !extensionAccepted) {
    return {
      valid: false,
      error: `${file.name} utilise un format non pris en charge.`,
    };
  }

  return {
    valid: true,
  };
}

export function createChatAttachment(
  file: File,
): ChatAttachment {
  const category =
    getAttachmentCategory(file);

  const previewUrl =
    category === "image" ||
    category === "audio" ||
    category === "video"
      ? URL.createObjectURL(file)
      : undefined;

  return {
    id: createAttachmentId(),
    file,
    name: file.name,
    size: file.size,
    mimeType:
      file.type ||
      "application/octet-stream",
    extension:
      getFileExtension(file.name),
    category,
    status: "ready",
    previewUrl,
  };
}

export function revokeAttachmentPreview(
  attachment: ChatAttachment,
): void {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(
      attachment.previewUrl,
    );
  }
}

export function isSameFile(
  first: File,
  second: File,
): boolean {
  return (
    first.name === second.name &&
    first.size === second.size &&
    first.type === second.type &&
    first.lastModified ===
      second.lastModified
  );
}
