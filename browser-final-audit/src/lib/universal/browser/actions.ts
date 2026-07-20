import type { Page } from "playwright";

type WaitForSelectorState =
  | "attached"
  | "detached"
  | "visible"
  | "hidden";

import type {
  BrowserSession,
} from "./session";

const DEFAULT_ACTION_TIMEOUT_MS = 30_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const MAX_SCROLL_DISTANCE = 100_000;

export type BrowserWaitUntil =
  | "load"
  | "domcontentloaded"
  | "networkidle"
  | "commit";

export interface BrowserNavigationOptions {
  readonly timeoutMs?: number;
  readonly waitUntil?: BrowserWaitUntil;
}

export interface BrowserClickOptions {
  readonly timeoutMs?: number;
  readonly button?: "left" | "right" | "middle";
  readonly clickCount?: number;
  readonly force?: boolean;
  readonly waitAfterMs?: number;
}

export interface BrowserFillOptions {
  readonly timeoutMs?: number;
  readonly clearFirst?: boolean;
  readonly waitAfterMs?: number;
}

export interface BrowserPressOptions {
  readonly timeoutMs?: number;
  readonly waitAfterMs?: number;
}

export interface BrowserWaitOptions {
  readonly timeoutMs?: number;
  readonly state?: WaitForSelectorState;
}

export interface BrowserScrollOptions {
  readonly x?: number;
  readonly y?: number;
  readonly selector?: string;
  readonly behavior?: "auto" | "smooth";
  readonly waitAfterMs?: number;
}

export interface BrowserActionResponse<T = void> {
  readonly success: boolean;
  readonly action: string;
  readonly url: string;
  readonly title: string;
  readonly durationMs: number;
  readonly data?: T;
}

function normalizeTimeout(
  value: number | undefined,
  fallback: number,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      300_000,
      Math.floor(value),
    ),
  );
}

function normalizeDelay(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      30_000,
      Math.floor(value),
    ),
  );
}

function normalizeScrollDistance(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    -MAX_SCROLL_DISTANCE,
    Math.min(
      MAX_SCROLL_DISTANCE,
      Math.floor(value),
    ),
  );
}

function validateSelector(
  selector: string,
): string {
  const normalized =
    selector.trim();

  if (!normalized) {
    throw new Error(
      "Le sélecteur ne peut pas être vide.",
    );
  }

  return normalized;
}

function validateUrl(
  url: string,
): string {
  const normalized =
    url.trim();

  if (!normalized) {
    throw new Error(
      "L'URL ne peut pas être vide.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error(
      `URL invalide : ${normalized}`,
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

  return parsedUrl.toString();
}

async function waitAfterAction(
  page: Page,
  waitAfterMs: number | undefined,
): Promise<void> {
  const delay =
    normalizeDelay(waitAfterMs);

  if (delay > 0) {
    await page.waitForTimeout(delay);
  }
}

export class BrowserActions {
  public constructor(
    private readonly session: BrowserSession,
  ) {}

  private async execute<T>(
    action: string,
    operation: (
      page: Page,
    ) => Promise<T>,
  ): Promise<BrowserActionResponse<T>> {
    const startedAt = Date.now();
    const page =
      await this.session.getPage();

    const data =
      await operation(page);

    let title = "";

    try {
      title = await page.title();
    } catch {
      title = "";
    }

    return {
      success: true,
      action,
      url: page.url(),
      title,
      durationMs:
        Date.now() - startedAt,
      data,
    };
  }

  public async goto(
    url: string,
    options: BrowserNavigationOptions = {},
  ): Promise<
    BrowserActionResponse<{
      status: number | null;
      finalUrl: string;
    }>
  > {
    const targetUrl =
      validateUrl(url);

    return this.execute(
      "goto",
      async (page) => {
        const response =
          await page.goto(
            targetUrl,
            {
              waitUntil:
                options.waitUntil ??
                "domcontentloaded",
              timeout: normalizeTimeout(
                options.timeoutMs,
                DEFAULT_NAVIGATION_TIMEOUT_MS,
              ),
            },
          );

        return {
          status:
            response?.status() ??
            null,
          finalUrl:
            page.url(),
        };
      },
    );
  }

  public async click(
    selector: string,
    options: BrowserClickOptions = {},
  ): Promise<BrowserActionResponse> {
    const normalizedSelector =
      validateSelector(selector);

    return this.execute(
      "click",
      async (page) => {
        const locator =
          page.locator(
            normalizedSelector,
          ).first();

        await locator.click({
          timeout: normalizeTimeout(
            options.timeoutMs,
            DEFAULT_ACTION_TIMEOUT_MS,
          ),
          button:
            options.button ??
            "left",
          clickCount:
            options.clickCount ??
            1,
          force:
            options.force ??
            false,
        });

        await waitAfterAction(
          page,
          options.waitAfterMs,
        );
      },
    );
  }

  public async fill(
    selector: string,
    value: string,
    options: BrowserFillOptions = {},
  ): Promise<BrowserActionResponse> {
    const normalizedSelector =
      validateSelector(selector);

    return this.execute(
      "fill",
      async (page) => {
        const locator =
          page.locator(
            normalizedSelector,
          ).first();

        const timeout =
          normalizeTimeout(
            options.timeoutMs,
            DEFAULT_ACTION_TIMEOUT_MS,
          );

        await locator.waitFor({
          state: "visible",
          timeout,
        });

        if (
          options.clearFirst ??
          true
        ) {
          await locator.fill(
            "",
            {
              timeout,
            },
          );
        }

        await locator.fill(
          value,
          {
            timeout,
          },
        );

        await waitAfterAction(
          page,
          options.waitAfterMs,
        );
      },
    );
  }

  public async press(
    selector: string,
    key: string,
    options: BrowserPressOptions = {},
  ): Promise<BrowserActionResponse> {
    const normalizedSelector =
      validateSelector(selector);

    const normalizedKey =
      key.trim();

    if (!normalizedKey) {
      throw new Error(
        "La touche ne peut pas être vide.",
      );
    }

    return this.execute(
      "press",
      async (page) => {
        await page
          .locator(
            normalizedSelector,
          )
          .first()
          .press(
            normalizedKey,
            {
              timeout:
                normalizeTimeout(
                  options.timeoutMs,
                  DEFAULT_ACTION_TIMEOUT_MS,
                ),
            },
          );

        await waitAfterAction(
          page,
          options.waitAfterMs,
        );
      },
    );
  }

  public async waitForSelector(
    selector: string,
    options: BrowserWaitOptions = {},
  ): Promise<BrowserActionResponse> {
    const normalizedSelector =
      validateSelector(selector);

    return this.execute(
      "waitForSelector",
      async (page) => {
        await page
          .locator(
            normalizedSelector,
          )
          .first()
          .waitFor({
            state:
              options.state ??
              "visible",
            timeout:
              normalizeTimeout(
                options.timeoutMs,
                DEFAULT_ACTION_TIMEOUT_MS,
              ),
          });
      },
    );
  }

  public async wait(
    timeoutMs: number,
  ): Promise<BrowserActionResponse> {
    const timeout =
      normalizeTimeout(
        timeoutMs,
        1_000,
      );

    return this.execute(
      "wait",
      async (page) => {
        await page.waitForTimeout(
          timeout,
        );
      },
    );
  }

  public async scroll(
    options: BrowserScrollOptions = {},
  ): Promise<
    BrowserActionResponse<{
      x: number;
      y: number;
    }>
  > {
    const x =
      normalizeScrollDistance(
        options.x,
      );

    const y =
      normalizeScrollDistance(
        options.y ?? 700,
      );

    return this.execute(
      "scroll",
      async (page) => {
        if (
          options.selector?.trim()
        ) {
          const locator =
            page.locator(
              validateSelector(
                options.selector,
              ),
            ).first();

          await locator.evaluate(
            (
              element,
              scrollOptions,
            ) => {
              element.scrollBy(
                scrollOptions,
              );
            },
            {
              left: x,
              top: y,
              behavior:
                options.behavior ??
                "auto",
            },
          );
        } else {
          await page.evaluate(
            (scrollOptions) => {
              window.scrollBy(
                scrollOptions,
              );
            },
            {
              left: x,
              top: y,
              behavior:
                options.behavior ??
                "auto",
            },
          );
        }

        await waitAfterAction(
          page,
          options.waitAfterMs,
        );

        return page.evaluate(
          () => ({
            x: window.scrollX,
            y: window.scrollY,
          }),
        );
      },
    );
  }

  public async back(
    options: BrowserNavigationOptions = {},
  ): Promise<BrowserActionResponse> {
    return this.execute(
      "back",
      async (page) => {
        await page.goBack({
          waitUntil:
            options.waitUntil ??
            "domcontentloaded",
          timeout:
            normalizeTimeout(
              options.timeoutMs,
              DEFAULT_NAVIGATION_TIMEOUT_MS,
            ),
        });
      },
    );
  }

  public async forward(
    options: BrowserNavigationOptions = {},
  ): Promise<BrowserActionResponse> {
    return this.execute(
      "forward",
      async (page) => {
        await page.goForward({
          waitUntil:
            options.waitUntil ??
            "domcontentloaded",
          timeout:
            normalizeTimeout(
              options.timeoutMs,
              DEFAULT_NAVIGATION_TIMEOUT_MS,
            ),
        });
      },
    );
  }

  public async reload(
    options: BrowserNavigationOptions = {},
  ): Promise<BrowserActionResponse> {
    return this.execute(
      "reload",
      async (page) => {
        await page.reload({
          waitUntil:
            options.waitUntil ??
            "domcontentloaded",
          timeout:
            normalizeTimeout(
              options.timeoutMs,
              DEFAULT_NAVIGATION_TIMEOUT_MS,
            ),
        });
      },
    );
  }
}

export function createBrowserActions(
  session: BrowserSession,
): BrowserActions {
  return new BrowserActions(
    session,
  );
}

