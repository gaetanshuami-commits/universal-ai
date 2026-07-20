import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
} from "playwright";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 45_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

export interface BrowserSessionOptions {
  readonly headless?: boolean;
  readonly slowMoMs?: number;
  readonly timeoutMs?: number;
  readonly navigationTimeoutMs?: number;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly userAgent?: string;
  readonly locale?: string;
  readonly timezoneId?: string;
  readonly ignoreHTTPSErrors?: boolean;
  readonly downloadsPath?: string;
}

export interface BrowserTabInfo {
  readonly index: number;
  readonly url: string;
  readonly title: string;
  readonly active: boolean;
  readonly closed: boolean;
}

export interface BrowserSessionStatus {
  readonly started: boolean;
  readonly closed: boolean;
  readonly tabCount: number;
  readonly activeTabIndex: number | null;
  readonly tabs: ReadonlyArray<BrowserTabInfo>;
}

function normalizeTimeout(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(
      MIN_TIMEOUT_MS,
      Math.floor(value as number),
    ),
  );
}

function normalizeSlowMotion(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    5_000,
    Math.max(0, Math.floor(value as number)),
  );
}

function normalizeViewport(
  viewport:
    | BrowserSessionOptions["viewport"]
    | undefined,
): {
  width: number;
  height: number;
} {
  if (!viewport) {
    return {
      width: 1440,
      height: 900,
    };
  }

  return {
    width: Math.min(
      3840,
      Math.max(320, Math.floor(viewport.width)),
    ),
    height: Math.min(
      2160,
      Math.max(240, Math.floor(viewport.height)),
    ),
  };
}

export class BrowserSession {
  private browser: Browser | null = null;

  private context: BrowserContext | null = null;

  private activePage: Page | null = null;

  private readonly options: BrowserSessionOptions;

  private readonly timeoutMs: number;

  private readonly navigationTimeoutMs: number;

  public constructor(
    options: BrowserSessionOptions = {},
  ) {
    this.options = options;

    this.timeoutMs = normalizeTimeout(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
    );

    this.navigationTimeoutMs = normalizeTimeout(
      options.navigationTimeoutMs,
      DEFAULT_NAVIGATION_TIMEOUT_MS,
    );
  }

  public async start(): Promise<Page> {
    if (
      this.browser &&
      this.context &&
      this.activePage &&
      !this.activePage.isClosed()
    ) {
      return this.activePage;
    }

    await this.close();

    const launchOptions: LaunchOptions = {
      headless: this.options.headless ?? true,
      slowMo: normalizeSlowMotion(
        this.options.slowMoMs,
      ),
      downloadsPath:
        this.options.downloadsPath,
    };

    this.browser = await chromium.launch(
      launchOptions,
    );

    const contextOptions: BrowserContextOptions = {
      viewport: normalizeViewport(
        this.options.viewport,
      ),
      userAgent: this.options.userAgent,
      locale: this.options.locale ?? "fr-FR",
      timezoneId:
        this.options.timezoneId ??
        "Europe/Paris",
      ignoreHTTPSErrors:
        this.options.ignoreHTTPSErrors ??
        false,
      acceptDownloads: true,
    };

    this.context =
      await this.browser.newContext(
        contextOptions,
      );

    this.context.setDefaultTimeout(
      this.timeoutMs,
    );

    this.context.setDefaultNavigationTimeout(
      this.navigationTimeoutMs,
    );

    this.context.on(
      "page",
      (page) => {
        this.configurePage(page);
        this.activePage = page;
      },
    );

    this.activePage =
      await this.context.newPage();

    this.configurePage(
      this.activePage,
    );

    return this.activePage;
  }

  private configurePage(
    page: Page,
  ): void {
    page.setDefaultTimeout(
      this.timeoutMs,
    );

    page.setDefaultNavigationTimeout(
      this.navigationTimeoutMs,
    );

    page.on(
      "close",
      () => {
        if (
          this.activePage === page
        ) {
          const remainingPages =
            this.context
              ?.pages()
              .filter(
                (candidate) =>
                  !candidate.isClosed(),
              ) ?? [];

          this.activePage =
            remainingPages.at(-1) ??
            null;
        }
      },
    );
  }

  public isStarted(): boolean {
    return Boolean(
      this.browser &&
      this.context &&
      this.browser.isConnected(),
    );
  }

  public async getPage(): Promise<Page> {
    if (
      !this.isStarted() ||
      !this.activePage ||
      this.activePage.isClosed()
    ) {
      return this.start();
    }

    return this.activePage;
  }

  public async newPage(
    url?: string,
  ): Promise<Page> {
    if (
      !this.context ||
      !this.isStarted()
    ) {
      await this.start();
    }

    if (!this.context) {
      throw new Error(
        "Le contexte navigateur n'a pas pu être créé.",
      );
    }

    const page =
      await this.context.newPage();

    this.configurePage(page);
    this.activePage = page;

    if (url?.trim()) {
      await page.goto(
        url.trim(),
        {
          waitUntil: "domcontentloaded",
          timeout:
            this.navigationTimeoutMs,
        },
      );
    }

    return page;
  }

  public async getPages(): Promise<
    ReadonlyArray<Page>
  > {
    if (
      !this.context ||
      !this.isStarted()
    ) {
      await this.start();
    }

    return (
      this.context
        ?.pages()
        .filter(
          (page) =>
            !page.isClosed(),
        ) ?? []
    );
  }

  public async switchToPage(
    index: number,
  ): Promise<Page> {
    const pages =
      await this.getPages();

    const normalizedIndex =
      Math.floor(index);

    const page =
      pages[normalizedIndex];

    if (!page) {
      throw new Error(
        `L'onglet ${normalizedIndex} n'existe pas.`,
      );
    }

    this.activePage = page;

    await page.bringToFront();

    return page;
  }

  public async closePage(
    index?: number,
  ): Promise<void> {
    const pages =
      await this.getPages();

    let page: Page | undefined;

    if (index === undefined) {
      page =
        this.activePage ??
        pages.at(-1);
    } else {
      page =
        pages[Math.floor(index)];
    }

    if (!page) {
      return;
    }

    await page.close({
      runBeforeUnload: false,
    });

    const remainingPages =
      await this.getPages();

    if (
      remainingPages.length === 0 &&
      this.context
    ) {
      this.activePage =
        await this.context.newPage();

      this.configurePage(
        this.activePage,
      );

      return;
    }

    this.activePage =
      remainingPages.at(-1) ??
      null;

    if (this.activePage) {
      await this.activePage.bringToFront();
    }
  }

  public async getStatus(): Promise<BrowserSessionStatus> {
    if (!this.isStarted()) {
      return {
        started: false,
        closed: true,
        tabCount: 0,
        activeTabIndex: null,
        tabs: [],
      };
    }

    const pages =
      await this.getPages();

    const tabs =
      await Promise.all(
        pages.map(
          async (
            page,
            index,
          ): Promise<BrowserTabInfo> => {
            let title = "";

            try {
              title =
                await page.title();
            } catch {
              title = "";
            }

            return {
              index,
              url: page.url(),
              title,
              active:
                page ===
                this.activePage,
              closed:
                page.isClosed(),
            };
          },
        ),
      );

    const activeTabIndex =
      this.activePage
        ? pages.indexOf(
            this.activePage,
          )
        : -1;

    return {
      started: true,
      closed: false,
      tabCount: pages.length,
      activeTabIndex:
        activeTabIndex >= 0
          ? activeTabIndex
          : null,
      tabs,
    };
  }

  public async close(): Promise<void> {
    const context =
      this.context;

    const browser =
      this.browser;

    this.activePage = null;
    this.context = null;
    this.browser = null;

    if (context) {
      try {
        await context.close();
      } catch {
        // Le contexte était peut-être déjà fermé.
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch {
        // Le navigateur était peut-être déjà fermé.
      }
    }
  }
}

export function createBrowserSession(
  options: BrowserSessionOptions = {},
): BrowserSession {
  return new BrowserSession(options);
}
