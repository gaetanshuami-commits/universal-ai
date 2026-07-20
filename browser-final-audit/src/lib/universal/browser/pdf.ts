import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Page } from "playwright";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

export type BrowserPdfFormat =
  | "Letter"
  | "Legal"
  | "Tabloid"
  | "Ledger"
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6";

export type BrowserPdfPageRange =
  | string
  | undefined;

export interface BrowserPdfMargin {
  readonly top?: string | number;
  readonly right?: string | number;
  readonly bottom?: string | number;
  readonly left?: string | number;
}

export interface BrowserPdfOptions {
  readonly path: string;
  readonly format?: BrowserPdfFormat;
  readonly width?: string | number;
  readonly height?: string | number;
  readonly landscape?: boolean;
  readonly printBackground?: boolean;
  readonly displayHeaderFooter?: boolean;
  readonly headerTemplate?: string;
  readonly footerTemplate?: string;
  readonly margin?: BrowserPdfMargin;
  readonly pageRanges?: BrowserPdfPageRange;
  readonly preferCSSPageSize?: boolean;
  readonly tagged?: boolean;
  readonly outline?: boolean;
  readonly scale?: number;
  readonly timeoutMs?: number;
  readonly waitUntilNetworkIdle?: boolean;
  readonly networkIdleTimeoutMs?: number;
  readonly emulateScreenMedia?: boolean;
}

export interface BrowserPdfBufferOptions
  extends Omit<BrowserPdfOptions, "path"> {}

export interface BrowserPdfResult {
  readonly success: true;
  readonly path: string;
  readonly url: string;
  readonly title: string;
  readonly format: BrowserPdfFormat | null;
  readonly landscape: boolean;
  readonly printBackground: boolean;
  readonly sizeBytes: number;
  readonly durationMs: number;
}

export interface BrowserPdfBufferResult {
  readonly success: true;
  readonly buffer: Buffer;
  readonly base64: string;
  readonly url: string;
  readonly title: string;
  readonly format: BrowserPdfFormat | null;
  readonly landscape: boolean;
  readonly printBackground: boolean;
  readonly sizeBytes: number;
  readonly durationMs: number;
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
    0,
    Math.min(
      MAX_TIMEOUT_MS,
      Math.floor(value),
    ),
  );
}

function normalizeScale(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return 1;
  }

  return Math.max(
    0.1,
    Math.min(
      2,
      value,
    ),
  );
}

function validateDimensions(
  options: {
    readonly format?: BrowserPdfFormat;
    readonly width?: string | number;
    readonly height?: string | number;
  },
): void {
  if (
    options.format &&
    (
      options.width !== undefined ||
      options.height !== undefined
    )
  ) {
    throw new Error(
      "Utilisez soit format, soit width/height, mais pas les deux.",
    );
  }

  const hasWidth =
    options.width !== undefined;

  const hasHeight =
    options.height !== undefined;

  if (hasWidth !== hasHeight) {
    throw new Error(
      "Width et height doivent être fournis ensemble.",
    );
  }
}

function validatePageRanges(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  if (
    !/^[0-9,\-\s]+$/.test(normalized)
  ) {
    throw new Error(
      "Le format pageRanges est invalide. Exemple : 1-3,5,8.",
    );
  }

  return normalized;
}

function normalizeMarginValue(
  value: string | number | undefined,
): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value === "number" &&
    !Number.isFinite(value)
  ) {
    throw new Error(
      "Une marge PDF contient une valeur invalide.",
    );
  }

  return value;
}

function normalizeMargins(
  margin: BrowserPdfMargin | undefined,
): BrowserPdfMargin | undefined {
  if (!margin) {
    return undefined;
  }

  return {
    top: normalizeMarginValue(
      margin.top,
    ),
    right: normalizeMarginValue(
      margin.right,
    ),
    bottom: normalizeMarginValue(
      margin.bottom,
    ),
    left: normalizeMarginValue(
      margin.left,
    ),
  };
}

async function ensureOutputDirectory(
  outputPath: string,
): Promise<string> {
  const absolutePath = resolve(
    outputPath,
  );

  await mkdir(
    dirname(absolutePath),
    {
      recursive: true,
    },
  );

  return absolutePath;
}

export class BrowserPdfEngine {
  public constructor(
    private readonly page: Page,
  ) {}

  private async preparePage(
    options: BrowserPdfBufferOptions,
  ): Promise<void> {
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );

    this.page.setDefaultTimeout(
      timeout,
    );

    if (
      options.waitUntilNetworkIdle === true
    ) {
      await this.page.waitForLoadState(
        "networkidle",
        {
          timeout: normalizeTimeout(
            options.networkIdleTimeoutMs ??
              timeout,
          ),
        },
      );
    }

    if (
      options.emulateScreenMedia === true
    ) {
      await this.page.emulateMedia({
        media: "screen",
      });
    } else {
      await this.page.emulateMedia({
        media: "print",
      });
    }
  }

  private buildPdfOptions(
    options: BrowserPdfBufferOptions,
  ) {
    validateDimensions(
      options,
    );

    const format =
      options.format ??
      (
        options.width === undefined &&
        options.height === undefined
          ? "A4"
          : undefined
      );

    return {
      format,
      width: options.width,
      height: options.height,
      landscape:
        options.landscape ?? false,
      printBackground:
        options.printBackground ?? true,
      displayHeaderFooter:
        options.displayHeaderFooter ??
        false,
      headerTemplate:
        options.headerTemplate ?? "",
      footerTemplate:
        options.footerTemplate ?? "",
      margin: normalizeMargins(
        options.margin,
      ),
      pageRanges: validatePageRanges(
        options.pageRanges,
      ),
      preferCSSPageSize:
        options.preferCSSPageSize ??
        false,
      tagged:
        options.tagged ?? false,
      outline:
        options.outline ?? false,
      scale: normalizeScale(
        options.scale,
      ),
    };
  }

  public async generate(
    options: BrowserPdfOptions,
  ): Promise<BrowserPdfResult> {
    const startedAt = Date.now();

    if (!options.path.trim()) {
      throw new Error(
        "Le chemin du fichier PDF est obligatoire.",
      );
    }

    const outputPath =
      await ensureOutputDirectory(
        options.path,
      );

    await this.preparePage(
      options,
    );

    const pdfOptions =
      this.buildPdfOptions(
        options,
      );

    const buffer =
      await this.page.pdf({
        path: outputPath,
        ...pdfOptions,
      });

    return {
      success: true,
      path: outputPath,
      url: this.page.url(),
      title: await this.page.title(),
      format:
        pdfOptions.format ?? null,
      landscape:
        pdfOptions.landscape,
      printBackground:
        pdfOptions.printBackground,
      sizeBytes:
        buffer.byteLength,
      durationMs:
        Date.now() - startedAt,
    };
  }

  public async generateBuffer(
    options: BrowserPdfBufferOptions = {},
  ): Promise<BrowserPdfBufferResult> {
    const startedAt = Date.now();

    await this.preparePage(
      options,
    );

    const pdfOptions =
      this.buildPdfOptions(
        options,
      );

    const buffer =
      await this.page.pdf({
        ...pdfOptions,
      });

    return {
      success: true,
      buffer,
      base64:
        buffer.toString("base64"),
      url: this.page.url(),
      title: await this.page.title(),
      format:
        pdfOptions.format ?? null,
      landscape:
        pdfOptions.landscape,
      printBackground:
        pdfOptions.printBackground,
      sizeBytes:
        buffer.byteLength,
      durationMs:
        Date.now() - startedAt,
    };
  }

  public async generateA4(
    options: Omit<
      BrowserPdfOptions,
      "format" | "width" | "height"
    >,
  ): Promise<BrowserPdfResult> {
    return this.generate({
      ...options,
      format: "A4",
    });
  }

  public async generateA4Landscape(
    options: Omit<
      BrowserPdfOptions,
      | "format"
      | "width"
      | "height"
      | "landscape"
    >,
  ): Promise<BrowserPdfResult> {
    return this.generate({
      ...options,
      format: "A4",
      landscape: true,
    });
  }

  public async generateLetter(
    options: Omit<
      BrowserPdfOptions,
      "format" | "width" | "height"
    >,
  ): Promise<BrowserPdfResult> {
    return this.generate({
      ...options,
      format: "Letter",
    });
  }
}

export function createBrowserPdfEngine(
  page: Page,
): BrowserPdfEngine {
  return new BrowserPdfEngine(
    page,
  );
}
