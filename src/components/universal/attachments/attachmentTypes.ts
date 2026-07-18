export const MAX_ATTACHMENT_SIZE_BYTES =
  20 * 1024 * 1024;

export const MAX_ATTACHMENT_COUNT = 10;

export const ACCEPTED_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
] as const;

export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".md",
  ".json",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp3",
  ".wav",
  ".webm",
  ".mp4",
] as const;

export type AttachmentStatus =
  | "ready"
  | "processing"
  | "uploaded"
  | "error";

export type AttachmentCategory =
  | "document"
  | "spreadsheet"
  | "image"
  | "audio"
  | "video"
  | "text"
  | "unknown";

export interface ChatAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  extension: string;
  category: AttachmentCategory;
  status: AttachmentStatus;
  previewUrl?: string;
  error?: string;
}

export interface AttachmentValidationResult {
  valid: boolean;
  error?: string;
}

export interface AttachmentManagerOptions {
  maxFiles?: number;
  maxFileSizeBytes?: number;
  acceptedMimeTypes?: readonly string[];
  acceptedExtensions?: readonly string[];
}

export interface AttachmentManagerResult {
  attachments: ChatAttachment[];
  errors: string[];
  isDragging: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  clearErrors: () => void;
  setDragging: (dragging: boolean) => void;
}
