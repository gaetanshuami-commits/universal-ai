"use client";

import {
  useRef,
  type ChangeEvent,
  type DragEvent,
} from "react";

import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  formatFileSize,
  type AttachmentManagerResult,
  type ChatAttachment,
} from "./index";

interface AttachmentComposerProps {
  manager: AttachmentManagerResult;
  disabled?: boolean;
}

function AttachmentIcon({
  attachment,
}: {
  attachment: ChatAttachment;
}) {
  const labels: Record<
    ChatAttachment["category"],
    string
  > = {
    document: "DOC",
    spreadsheet: "XLS",
    image: "IMG",
    audio: "AUD",
    video: "VID",
    text: "TXT",
    unknown: "FILE",
  };

  if (
    attachment.category === "image" &&
    attachment.previewUrl
  ) {
    return (
      <img
        alt=""
        className="h-11 w-11 rounded-lg object-cover"
        src={attachment.previewUrl}
      />
    );
  }

  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-[10px] font-bold text-black/55">
      {labels[attachment.category]}
    </span>
  );
}

export function AttachmentComposer({
  manager,
  disabled = false,
}: AttachmentComposerProps) {
  const inputRef =
    useRef<HTMLInputElement>(null);

  const {
    attachments,
    errors,
    isDragging,
    addFiles,
    removeAttachment,
    clearErrors,
    setDragging,
  } = manager;

  function openFilePicker(): void {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    if (event.target.files) {
      addFiles(event.target.files);
    }

    event.target.value = "";
  }

  function handleDragEnter(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (!disabled) {
      setDragging(true);
    }
  }

  function handleDragOver(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    if (
      event.currentTarget ===
      event.target
    ) {
      setDragging(false);
    }
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    setDragging(false);

    if (
      !disabled &&
      event.dataTransfer.files.length > 0
    ) {
      addFiles(event.dataTransfer.files);
    }
  }

  return (
    <div
      className={[
        "relative",
        isDragging
          ? "rounded-2xl ring-2 ring-black/20 ring-offset-2"
          : "",
      ].join(" ")}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        accept={ACCEPTED_ATTACHMENT_EXTENSIONS.join(
          ",",
        )}
        className="hidden"
        disabled={disabled}
        multiple
        onChange={handleFileChange}
        type="file"
      />

      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-black/25 bg-white/95 backdrop-blur">
          <div className="text-center">
            <div className="text-sm font-semibold text-[#17191f]">
              Déposez vos fichiers ici
            </div>

            <div className="mt-1 text-xs text-black/45">
              Maximum 10 fichiers
            </div>
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              {errors.map(
                (error, index) => (
                  <p
                    className="text-xs text-red-700"
                    key={`${error}-${index}`}
                  >
                    {error}
                  </p>
                ),
              )}
            </div>

            <button
              className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900"
              onClick={clearErrors}
              type="button"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {attachments.map(
            (attachment) => (
              <div
                className="flex min-w-[210px] max-w-[260px] items-center gap-2 rounded-xl border border-black/[0.08] bg-white p-2 shadow-sm"
                key={attachment.id}
              >
                <AttachmentIcon
                  attachment={attachment}
                />

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-xs font-semibold text-[#17191f]"
                    title={attachment.name}
                  >
                    {attachment.name}
                  </p>

                  <p className="mt-0.5 text-[11px] text-black/45">
                    {formatFileSize(
                      attachment.size,
                    )}
                  </p>
                </div>

                <button
                  aria-label={`Supprimer ${attachment.name}`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg text-black/40 transition hover:bg-black/[0.06] hover:text-black"
                  onClick={() =>
                    removeAttachment(
                      attachment.id,
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </div>
            ),
          )}
        </div>
      ) : null}

      <button
        aria-label="Ajouter des fichiers"
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-xs font-semibold text-[#17191f] shadow-sm transition hover:border-black/15 hover:bg-black/[0.02] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={openFilePicker}
        type="button"
      >
        <span className="text-lg font-light leading-none">
          +
        </span>

        <span>Ajouter un fichier</span>

        {attachments.length > 0 ? (
          <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px]">
            {attachments.length}
          </span>
        ) : null}
      </button>
    </div>
  );
}
