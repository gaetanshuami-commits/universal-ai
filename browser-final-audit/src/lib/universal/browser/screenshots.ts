import { mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Page } from "playwright";

type ScreenshotType = "png" | "jpeg";

type ScreenshotAnimations =
  | "disabled"
  | "allow";

type ScreenshotCaret =
  | "hide"
  | "initial";

type ScreenshotScale =
  | "css"
  | "device";

interface ScreenshotClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_JPEG_QUALITY = 85;
const MAX_TIMEOUT_MS = 300_000;

export interface BrowserScreenshotOptions {
  readonly path: string;
  readonly type?: ScreenshotType;
  readonly fullPage?: boolean;
  readonly quality?: number;
  readonly omitBackground?: boolean;
  readonly animations?: ScreenshotAnimations;
  readonly caret?: ScreenshotCaret;
  readonly scale?: ScreenshotScale;
  readonly timeoutMs?: number;
  readonly maskSelectors?: readonly string[];
}

export interface BrowserElementScreenshotOptions
  extends Omit<BrowserScreenshotOptions, "fullPage"> {
  readonly selector: string;
  readonly waitForVisible?: boolean;
}

export interface BrowserClipScreenshotOptions
  extends Omit<BrowserScreenshotOptions, "fullPage"> {
  readonly clip: ScreenshotClip;
}

export interface BrowserScreenshotBufferOptions {
  readonly type?: ScreenshotType;
  readonly fullPage?: boolean;
  readonly quality?: number;
  readonly omitBackground?: boolean;
  readonly animations?: ScreenshotAnimations;
  readonly caret?: ScreenshotCaret;
  readonly scale?: ScreenshotScale;
  readonly timeoutMs?: number;
  readonly maskSelectors?: readonly string[];
}

export interface BrowserScreenshotResult {
  readonly success: true;
  readonly path: string;
  readonly type: ScreenshotType;
  readonly url: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly fullPage: boolean;
  readonly durationMs: number;
}

export interface BrowserScreenshotBufferResult {
  readonly success: true;
  readonly buffer: Buffer;
  readonly base64: string;
  readonly type: ScreenshotType;
  readonly url: string;
  readonly title: string;
  readonly fullPage: boolean;
  readonly durationMs: number;
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (
    timeoutMs === undefined ||
    !Number.isFinite(timeoutMs)
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    0,
    Math.min(
      MAX_TIMEOUT_MS,
      Math.floor(timeoutMs),
    ),
  );
}

function normalizeQuality(
  type: ScreenshotType,
  quality: number | undefined,
): number | undefined {
  if (type !== "jpeg") {
    return undefined;
  }

  if (
    quality === undefined ||
    !Number.isFinite(quality)
  ) {
    return DEFAULT_JPEG_QUALITY;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.floor(quality),
    ),
  );
}

function inferScreenshotType(
  path: string | undefined,
  explicitType: ScreenshotType | undefined,
): ScreenshotType {
  if (explicitType) {
    return explicitType;
  }

  const extension = path
    ? extname(path).toLowerCase()
    : "";

  if (
    extension === ".jpg" ||
    extension === ".jpeg"
  ) {
    return "jpeg";
  }

  return "png";
}

function normalizeClip(
  clip: ScreenshotClip,
): ScreenshotClip {
  if (
    !Number.isFinite(clip.x) ||
    !Number.isFinite(clip.y) ||
    !Number.isFinite(clip.width) ||
    !Number.isFinite(clip.height)
  ) {
    throw new Error(
      "Les coordonnées de capture doivent être des nombres valides.",
    );
  }

  if (
    clip.width <= 0 ||
    clip.height <= 0
  ) {
    throw new Error(
      "La largeur et la hauteur de la capture doivent être supérieures à zéro.",
    );
  }

  return {
    x: Math.max(0, clip.x),
    y: Math.max(0, clip.y),
    width: clip.width,
    height: clip.height,
  };
}

async function ensureOutputDirectory(
  outputPath: string,
): Promise<string> {
  const absolutePath = resolve(outputPath);

  await mkdir(
    dirname(absolutePath),
    {
      recursive: true,
    },
  );

  return absolutePath;
}

async function resolveMaskLocators(
  page: Page,
  selectors: readonly string[] | undefined,
) {
  if (!selectors?.length) {
    return undefined;
  }

  return selectors
    .map((selector) => selector.trim())
    .filter(Boolean)
    .map((selector) => page.locator(selector));
}

export class BrowserScreenshotEngine {
  public constructor(
    private readonly page: Page,
  ) {}

  public async capturePage(
    options: BrowserScreenshotOptions,
  ): Promise<BrowserScreenshotResult> {
    const startedAt = Date.now();
    const outputPath = await ensureOutputDirectory(
      options.path,
    );

    const type = inferScreenshotType(
      outputPath,
      options.type,
    );

    const timeout = normalizeTimeout(
      options.timeoutMs,
    );

    const fullPage =
      options.fullPage ?? false;

    const mask = await resolveMaskLocators(
      this.page,
      options.maskSelectors,
    );

    await this.page.screenshot({
      path: outputPath,
      type,
      fullPage,
      quality: normalizeQuality(
        type,
        options.quality,
      ),
      omitBackground:
        options.omitBackground ?? false,
      animations:
        options.animations ?? "disabled",
      caret:
        options.caret ?? "hide",
      scale:
        options.scale ?? "device",
      timeout,
      mask,
    });

    const viewport =
      this.page.viewportSize();

    const dimensions = fullPage
      ? await this.page.evaluate(() => ({
          width: Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth ?? 0,
            window.innerWidth,
          ),
          height: Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ?? 0,
            window.innerHeight,
          ),
        }))
      : {
          width:
            viewport?.width ??
            await this.page.evaluate(
              () => window.innerWidth,
            ),
          height:
            viewport?.height ??
            await this.page.evaluate(
              () => window.innerHeight,
            ),
        };

    return {
      success: true,
      path: outputPath,
      type,
      url: this.page.url(),
      title: await this.page.title(),
      width: dimensions.width,
      height: dimensions.height,
      fullPage,
      durationMs:
        Date.now() - startedAt,
    };
  }

  public async captureFullPage(
    options: Omit<
      BrowserScreenshotOptions,
      "fullPage"
    >,
  ): Promise<BrowserScreenshotResult> {
    return this.capturePage({
      ...options,
      fullPage: true,
    });
  }

  public async captureViewport(
    options: Omit<
      BrowserScreenshotOptions,
      "fullPage"
    >,
  ): Promise<BrowserScreenshotResult> {
    return this.capturePage({
      ...options,
      fullPage: false,
    });
  }

  public async captureElement(
    options: BrowserElementScreenshotOptions,
  ): Promise<BrowserScreenshotResult> {
    const startedAt = Date.now();
    const selector =
      options.selector.trim();

    if (!selector) {
      throw new Error(
        "Le sélecteur de l'élément est obligatoire.",
      );
    }

    const outputPath =
      await ensureOutputDirectory(
        options.path,
      );

    const type = inferScreenshotType(
      outputPath,
      options.type,
    );

    const timeout = normalizeTimeout(
      options.timeoutMs,
    );

    const locator =
      this.page.locator(selector).first();

    await locator.waitFor({
      state:
        options.waitForVisible === false
          ? "attached"
          : "visible",
      timeout,
    });

    const mask = await resolveMaskLocators(
      this.page,
      options.maskSelectors,
    );

    await locator.screenshot({
      path: outputPath,
      type,
      quality: normalizeQuality(
        type,
        options.quality,
      ),
      omitBackground:
        options.omitBackground ?? false,
      animations:
        options.animations ?? "disabled",
      caret:
        options.caret ?? "hide",
      scale:
        options.scale ?? "device",
      timeout,
      mask,
    });

    const boundingBox =
      await locator.boundingBox();

    return {
      success: true,
      path: outputPath,
      type,
      url: this.page.url(),
      title: await this.page.title(),
      width: Math.round(
        boundingBox?.width ?? 0,
      ),
      height: Math.round(
        boundingBox?.height ?? 0,
      ),
      fullPage: false,
      durationMs:
        Date.now() - startedAt,
    };
  }

  public async captureClip(
    options: BrowserClipScreenshotOptions,
  ): Promise<BrowserScreenshotResult> {
    const startedAt = Date.now();
    const outputPath =
      await ensureOutputDirectory(
        options.path,
      );

    const type = inferScreenshotType(
      outputPath,
      options.type,
    );

    const timeout = normalizeTimeout(
      options.timeoutMs,
    );

    const clip = normalizeClip(
      options.clip,
    );

    const mask = await resolveMaskLocators(
      this.page,
      options.maskSelectors,
    );

    await this.page.screenshot({
      path: outputPath,
      type,
      clip,
      quality: normalizeQuality(
        type,
        options.quality,
      ),
      omitBackground:
        options.omitBackground ?? false,
      animations:
        options.animations ?? "disabled",
      caret:
        options.caret ?? "hide",
      scale:
        options.scale ?? "device",
      timeout,
      mask,
    });

    return {
      success: true,
      path: outputPath,
      type,
      url: this.page.url(),
      title: await this.page.title(),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
      fullPage: false,
      durationMs:
        Date.now() - startedAt,
    };
  }

  public async captureBuffer(
    options: BrowserScreenshotBufferOptions = {},
  ): Promise<BrowserScreenshotBufferResult> {
    const startedAt = Date.now();

    const type = inferScreenshotType(
      undefined,
      options.type,
    );

    const timeout = normalizeTimeout(
      options.timeoutMs,
    );

    const mask = await resolveMaskLocators(
      this.page,
      options.maskSelectors,
    );

    const buffer =
      await this.page.screenshot({
        type,
        fullPage:
          options.fullPage ?? false,
        quality: normalizeQuality(
          type,
          options.quality,
        ),
        omitBackground:
          options.omitBackground ?? false,
        animations:
          options.animations ?? "disabled",
        caret:
          options.caret ?? "hide",
        scale:
          options.scale ?? "device",
        timeout,
        mask,
      });

    return {
      success: true,
      buffer,
      base64:
        buffer.toString("base64"),
      type,
      url: this.page.url(),
      title: await this.page.title(),
      fullPage:
        options.fullPage ?? false,
      durationMs:
        Date.now() - startedAt,
    };
  }
}

export function createBrowserScreenshotEngine(
  page: Page,
): BrowserScreenshotEngine {
  return new BrowserScreenshotEngine(
    page,
  );
}

