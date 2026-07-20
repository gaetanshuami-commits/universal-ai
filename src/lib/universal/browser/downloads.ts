import {
  mkdir,
  stat,
} from "node:fs/promises";

import {
  basename,
  dirname,
  extname,
  resolve,
} from "node:path";

import type {
  Download,
  Page,
} from "playwright";

import type {
  BrowserSession,
} from "./session";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;

export interface BrowserDownloadOptions {
  readonly outputDirectory?: string;
  readonly filename?: string;
  readonly timeoutMs?: number;
  readonly overwrite?: boolean;
}

export interface BrowserClickDownloadOptions
  extends BrowserDownloadOptions {
  readonly selector: string;
  readonly force?: boolean;
}

export interface BrowserDownloadResult {
  readonly success: true;
  readonly url: string;
  readonly suggestedFilename: string;
  readonly filename: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly failure: null;
}

export interface BrowserDownloadFailure {
  readonly success: false;
  readonly url: string;
  readonly suggestedFilename: string;
  readonly filename: string | null;
  readonly path: string | null;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly failure: string;
}

export type BrowserDownloadResponse =
  | BrowserDownloadResult
  | BrowserDownloadFailure;

export interface BrowserDownloadRecord {
  readonly id: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly result: BrowserDownloadResponse;
}

function normalizeTimeout(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    1_000,
    Math.min(
      MAX_TIMEOUT_MS,
      Math.floor(value),
    ),
  );
}

function sanitizeFilename(
  filename: string,
): string {
  const normalized = filename
    .trim()
    .replace(
      /[<>:"/\\|?*\u0000-\u001F]/g,
      "_",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .replace(
      /[. ]+$/g,
      "",
    );

  if (!normalized) {
    return "download";
  }

  return normalized.slice(
    0,
    240,
  );
}

function createDownloadId(): string {
  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 10),
  ].join("-");
}

function addFilenameSuffix(
  filename: string,
  suffix: number,
): string {
  const extension =
    extname(filename);

  if (!extension) {
    return `${filename}-${suffix}`;
  }

  const name =
    filename.slice(
      0,
      -extension.length,
    );

  return `${name}-${suffix}${extension}`;
}

async function pathExists(
  filePath: string,
): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createAvailablePath(
  outputDirectory: string,
  requestedFilename: string,
  overwrite: boolean,
): Promise<string> {
  const initialPath =
    resolve(
      outputDirectory,
      requestedFilename,
    );

  if (
    overwrite ||
    !(await pathExists(initialPath))
  ) {
    return initialPath;
  }

  let suffix = 2;

  while (suffix < 10_000) {
    const candidate =
      resolve(
        outputDirectory,
        addFilenameSuffix(
          requestedFilename,
          suffix,
        ),
      );

    if (
      !(await pathExists(candidate))
    ) {
      return candidate;
    }

    suffix += 1;
  }

  throw new Error(
    "Impossible de générer un nom de fichier disponible.",
  );
}

async function resolveOutputPath(
  download: Download,
  options: BrowserDownloadOptions,
): Promise<{
  outputDirectory: string;
  suggestedFilename: string;
  filename: string;
  outputPath: string;
}> {
  const suggestedFilename =
    sanitizeFilename(
      download.suggestedFilename() ||
        "download",
    );

  const filename =
    sanitizeFilename(
      options.filename ??
        suggestedFilename,
    );

  const outputDirectory =
    resolve(
      options.outputDirectory ??
        "downloads",
    );

  await mkdir(
    outputDirectory,
    {
      recursive: true,
    },
  );

  const outputPath =
    await createAvailablePath(
      outputDirectory,
      filename,
      options.overwrite ?? false,
    );

  return {
    outputDirectory,
    suggestedFilename,
    filename:
      basename(outputPath),
    outputPath,
  };
}

async function getFileSize(
  filePath: string,
): Promise<number> {
  try {
    const information =
      await stat(filePath);

    return information.size;
  } catch {
    return 0;
  }
}

export class BrowserDownloadsManager {
  private readonly history:
    BrowserDownloadRecord[] = [];

  public constructor(
    private readonly session: BrowserSession,
  ) {}

  private async saveDownload(
    download: Download,
    startedAtMs: number,
    options: BrowserDownloadOptions,
  ): Promise<BrowserDownloadResponse> {
    const {
      suggestedFilename,
      filename,
      outputPath,
    } = await resolveOutputPath(
      download,
      options,
    );

    const failure =
      await download.failure();

    if (failure) {
      return {
        success: false,
        url: download.url(),
        suggestedFilename,
        filename: null,
        path: null,
        sizeBytes: 0,
        durationMs:
          Date.now() -
          startedAtMs,
        failure,
      };
    }

    try {
      await download.saveAs(
        outputPath,
      );

      const finalFailure =
        await download.failure();

      if (finalFailure) {
        return {
          success: false,
          url: download.url(),
          suggestedFilename,
          filename: null,
          path: null,
          sizeBytes: 0,
          durationMs:
            Date.now() -
            startedAtMs,
          failure:
            finalFailure,
        };
      }

      return {
        success: true,
        url: download.url(),
        suggestedFilename,
        filename,
        path: outputPath,
        sizeBytes:
          await getFileSize(
            outputPath,
          ),
        durationMs:
          Date.now() -
          startedAtMs,
        failure: null,
      };
    } catch (error) {
      return {
        success: false,
        url: download.url(),
        suggestedFilename,
        filename: null,
        path: null,
        sizeBytes: 0,
        durationMs:
          Date.now() -
          startedAtMs,
        failure:
          error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  private addHistory(
    startedAt: Date,
    result: BrowserDownloadResponse,
  ): void {
    this.history.push({
      id: createDownloadId(),
      startedAt:
        startedAt.toISOString(),
      completedAt:
        new Date().toISOString(),
      result,
    });

    if (
      this.history.length > 500
    ) {
      this.history.splice(
        0,
        this.history.length - 500,
      );
    }
  }

  public async waitForDownload(
    trigger: (
      page: Page,
    ) => Promise<void>,
    options: BrowserDownloadOptions = {},
  ): Promise<BrowserDownloadResponse> {
    const page =
      await this.session.getPage();

    const startedAt =
      new Date();

    const startedAtMs =
      startedAt.getTime();

    try {
      const downloadPromise =
        page.waitForEvent(
          "download",
          {
            timeout:
              normalizeTimeout(
                options.timeoutMs,
              ),
          },
        );

      await trigger(page);

      const download =
        await downloadPromise;

      const result =
        await this.saveDownload(
          download,
          startedAtMs,
          options,
        );

      this.addHistory(
        startedAt,
        result,
      );

      return result;
    } catch (error) {
      const result:
        BrowserDownloadFailure = {
          success: false,
          url: page.url(),
          suggestedFilename: "",
          filename: null,
          path: null,
          sizeBytes: 0,
          durationMs:
            Date.now() -
            startedAtMs,
          failure:
            error instanceof Error
              ? error.message
              : String(error),
        };

      this.addHistory(
        startedAt,
        result,
      );

      return result;
    }
  }

  public async clickAndDownload(
    options: BrowserClickDownloadOptions,
  ): Promise<BrowserDownloadResponse> {
    const selector =
      options.selector.trim();

    if (!selector) {
      throw new Error(
        "Le sélecteur de téléchargement est obligatoire.",
      );
    }

    return this.waitForDownload(
      async (page) => {
        await page
          .locator(selector)
          .click({
            timeout:
              normalizeTimeout(
                options.timeoutMs,
              ),
            force:
              options.force ??
              false,
          });
      },
      options,
    );
  }

  public async downloadFromUrl(
    url: string,
    options: BrowserDownloadOptions = {},
  ): Promise<BrowserDownloadResponse> {
    const page =
      await this.session.getPage();

    const normalizedUrl =
      url.trim();

    let parsedUrl: URL;

    try {
      parsedUrl =
        new URL(
          normalizedUrl,
          page.url(),
        );
    } catch {
      throw new Error(
        `URL de téléchargement invalide : ${url}`,
      );
    }

    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {
      throw new Error(
        "Seules les URL HTTP et HTTPS sont autorisées.",
      );
    }

    return this.waitForDownload(
      async (activePage) => {
        await activePage.evaluate(
          (targetUrl) => {
            const anchor =
              document.createElement(
                "a",
              );

            anchor.href = targetUrl;
            anchor.download = "";
            anchor.rel = "noopener";
            anchor.style.display =
              "none";

            document.body.appendChild(
              anchor,
            );

            anchor.click();
            anchor.remove();
          },
          parsedUrl.toString(),
        );
      },
      options,
    );
  }

  public getHistory(): ReadonlyArray<
    BrowserDownloadRecord
  > {
    return [
      ...this.history,
    ];
  }

  public clearHistory(): void {
    this.history.length = 0;
  }
}

export function createBrowserDownloadsManager(
  session: BrowserSession,
): BrowserDownloadsManager {
  return new BrowserDownloadsManager(
    session,
  );
}
