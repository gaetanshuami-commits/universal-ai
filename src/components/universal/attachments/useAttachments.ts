"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  type AttachmentManagerOptions,
  type AttachmentManagerResult,
  type ChatAttachment,
} from "./attachmentTypes";

import {
  createChatAttachment,
  isSameFile,
  revokeAttachmentPreview,
  validateAttachment,
} from "./attachmentUtils";

export function useAttachments(
  options: AttachmentManagerOptions = {},
): AttachmentManagerResult {
  const {
    maxFiles = MAX_ATTACHMENT_COUNT,
    maxFileSizeBytes =
      MAX_ATTACHMENT_SIZE_BYTES,
    acceptedMimeTypes =
      ACCEPTED_ATTACHMENT_TYPES,
    acceptedExtensions =
      ACCEPTED_ATTACHMENT_EXTENSIONS,
  } = options;

  const [
    attachments,
    setAttachments,
  ] = useState<ChatAttachment[]>([]);

  const [errors, setErrors] =
    useState<string[]>([]);

  const [isDragging, setDragging] =
    useState(false);

  const attachmentsRef =
    useRef<ChatAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current =
      attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (
        const attachment of
        attachmentsRef.current
      ) {
        revokeAttachmentPreview(
          attachment,
        );
      }
    };
  }, []);

  const addFiles = useCallback(
    (input: FileList | File[]) => {
      const incomingFiles =
        Array.from(input);

      if (incomingFiles.length === 0) {
        return;
      }

      setAttachments(
        (currentAttachments) => {
          const nextAttachments = [
            ...currentAttachments,
          ];

          const nextErrors: string[] = [];

          for (
            const file of incomingFiles
          ) {
            if (
              nextAttachments.length >=
              maxFiles
            ) {
              nextErrors.push(
                `Maximum ${maxFiles} fichiers par message.`,
              );

              break;
            }

            const duplicate =
              nextAttachments.some(
                (attachment) =>
                  isSameFile(
                    attachment.file,
                    file,
                  ),
              );

            if (duplicate) {
              nextErrors.push(
                `${file.name} est déjà ajouté.`,
              );

              continue;
            }

            const validation =
              validateAttachment(file, {
                maxFileSizeBytes,
                acceptedMimeTypes,
                acceptedExtensions,
              });

            if (!validation.valid) {
              nextErrors.push(
                validation.error ??
                  `${file.name} est invalide.`,
              );

              continue;
            }

            nextAttachments.push(
              createChatAttachment(file),
            );
          }

          if (nextErrors.length > 0) {
            setErrors(
              (currentErrors) => [
                ...currentErrors,
                ...nextErrors,
              ],
            );
          }

          return nextAttachments;
        },
      );
    },
    [
      acceptedExtensions,
      acceptedMimeTypes,
      maxFiles,
      maxFileSizeBytes,
    ],
  );

  const removeAttachment =
    useCallback((id: string) => {
      setAttachments(
        (currentAttachments) => {
          const attachment =
            currentAttachments.find(
              (item) => item.id === id,
            );

          if (attachment) {
            revokeAttachmentPreview(
              attachment,
            );
          }

          return currentAttachments.filter(
            (item) => item.id !== id,
          );
        },
      );
    }, []);

  const clearAttachments =
    useCallback(() => {
      setAttachments(
        (currentAttachments) => {
          for (
            const attachment of
            currentAttachments
          ) {
            revokeAttachmentPreview(
              attachment,
            );
          }

          return [];
        },
      );
    }, []);

  const clearErrors =
    useCallback(() => {
      setErrors([]);
    }, []);

  return {
    attachments,
    errors,
    isDragging,
    addFiles,
    removeAttachment,
    clearAttachments,
    clearErrors,
    setDragging,
  };
}
