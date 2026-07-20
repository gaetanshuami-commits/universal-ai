import type { Page } from "playwright";

const DEFAULT_EXTRACTION_TIMEOUT_MS = 30_000;
const MAX_EXTRACTED_ITEMS = 5_000;
const MAX_TEXT_LENGTH = 2_000_000;
const MAX_HTML_LENGTH = 5_000_000;

export interface BrowserExtractionOptions {
  readonly timeoutMs?: number;
  readonly selector?: string;
  readonly maxItems?: number;
  readonly includeHidden?: boolean;
}

export interface BrowserTextExtractionOptions
  extends BrowserExtractionOptions {
  readonly preserveWhitespace?: boolean;
  readonly maxLength?: number;
}

export interface BrowserHtmlExtractionOptions
  extends BrowserExtractionOptions {
  readonly outerHtml?: boolean;
  readonly maxLength?: number;
}

export interface BrowserLink {
  readonly text: string;
  readonly href: string;
  readonly title: string | null;
  readonly target: string | null;
  readonly rel: string | null;
  readonly download: string | null;
  readonly ariaLabel: string | null;
  readonly visible: boolean;
}

export interface BrowserImage {
  readonly src: string;
  readonly currentSrc: string;
  readonly alt: string;
  readonly title: string | null;
  readonly width: number;
  readonly height: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly loading: string | null;
  readonly visible: boolean;
}

export interface BrowserFormField {
  readonly tagName: string;
  readonly type: string;
  readonly name: string;
  readonly id: string;
  readonly value: string;
  readonly placeholder: string | null;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly checked: boolean | null;
  readonly multiple: boolean;
  readonly autocomplete: string | null;
  readonly ariaLabel: string | null;
  readonly options: readonly BrowserSelectOption[];
}

export interface BrowserSelectOption {
  readonly text: string;
  readonly value: string;
  readonly selected: boolean;
  readonly disabled: boolean;
}

export interface BrowserForm {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly action: string;
  readonly method: string;
  readonly enctype: string;
  readonly target: string;
  readonly fields: readonly BrowserFormField[];
}

export interface BrowserHeading {
  readonly level: number;
  readonly text: string;
  readonly id: string | null;
}

export interface BrowserMetaTag {
  readonly name: string | null;
  readonly property: string | null;
  readonly httpEquiv: string | null;
  readonly content: string;
}

export interface BrowserPageMetadata {
  readonly url: string;
  readonly title: string;
  readonly description: string | null;
  readonly language: string | null;
  readonly charset: string | null;
  readonly canonicalUrl: string | null;
  readonly faviconUrl: string | null;
  readonly author: string | null;
  readonly robots: string | null;
  readonly viewport: string | null;
  readonly themeColor: string | null;
  readonly openGraph: Readonly<Record<string, string>>;
  readonly twitter: Readonly<Record<string, string>>;
  readonly metaTags: readonly BrowserMetaTag[];
}

export interface BrowserStructuredData {
  readonly type: string | null;
  readonly raw: unknown;
}

export interface BrowserPageSnapshot {
  readonly metadata: BrowserPageMetadata;
  readonly text: string;
  readonly headings: readonly BrowserHeading[];
  readonly links: readonly BrowserLink[];
  readonly images: readonly BrowserImage[];
  readonly forms: readonly BrowserForm[];
  readonly structuredData: readonly BrowserStructuredData[];
}

export interface BrowserExtractionResult<T> {
  readonly success: boolean;
  readonly type: string;
  readonly url: string;
  readonly title: string;
  readonly durationMs: number;
  readonly count?: number;
  readonly truncated?: boolean;
  readonly data: T;
}

function normalizeTimeout(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_EXTRACTION_TIMEOUT_MS;
  }

  return Math.max(
    0,
    Math.min(
      300_000,
      Math.floor(value),
    ),
  );
}

function normalizeLimit(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return MAX_EXTRACTED_ITEMS;
  }

  return Math.max(
    1,
    Math.min(
      MAX_EXTRACTED_ITEMS,
      Math.floor(value),
    ),
  );
}

function normalizeMaximumLength(
  value: number | undefined,
  fallback: number,
  absoluteMaximum: number,
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      absoluteMaximum,
      Math.floor(value),
    ),
  );
}

function normalizeSelector(
  selector: string | undefined,
): string {
  const normalized = selector?.trim();

  return normalized || "body";
}

function truncateValue(
  value: string,
  maxLength: number,
): {
  readonly value: string;
  readonly truncated: boolean;
} {
  if (value.length <= maxLength) {
    return {
      value,
      truncated: false,
    };
  }

  return {
    value: value.slice(0, maxLength),
    truncated: true,
  };
}

async function createResult<T>(
  page: Page,
  type: string,
  startedAt: number,
  data: T,
  extras?: {
    readonly count?: number;
    readonly truncated?: boolean;
  },
): Promise<BrowserExtractionResult<T>> {
  return {
    success: true,
    type,
    url: page.url(),
    title: await page.title(),
    durationMs: Date.now() - startedAt,
    count: extras?.count,
    truncated: extras?.truncated,
    data,
  };
}

export class BrowserExtractor {
  public constructor(
    private readonly page: Page,
  ) {}

  public async extractText(
    options: BrowserTextExtractionOptions = {},
  ): Promise<BrowserExtractionResult<string>> {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const maxLength = normalizeMaximumLength(
      options.maxLength,
      MAX_TEXT_LENGTH,
      MAX_TEXT_LENGTH,
    );

    const locator = this.page.locator(
      selector,
    ).first();

    await locator.waitFor({
      state: options.includeHidden
        ? "attached"
        : "visible",
      timeout,
    });

    const rawText = await locator.evaluate(
      (
        element,
        extractionOptions,
      ) => {
        const target = element as HTMLElement;

        if (
          extractionOptions.includeHidden
        ) {
          return (
            target.textContent ??
            ""
          );
        }

        return (
          target.innerText ??
          target.textContent ??
          ""
        );
      },
      {
        includeHidden:
          options.includeHidden === true,
      },
    );

    const normalizedText =
      options.preserveWhitespace
        ? rawText
        : rawText
            .replace(/\u00a0/g, " ")
            .replace(/[ \t]+/g, " ")
            .replace(/\n[ \t]+/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

    const truncated = truncateValue(
      normalizedText,
      maxLength,
    );

    return createResult(
      this.page,
      "text",
      startedAt,
      truncated.value,
      {
        truncated: truncated.truncated,
      },
    );
  }

  public async extractHtml(
    options: BrowserHtmlExtractionOptions = {},
  ): Promise<BrowserExtractionResult<string>> {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const maxLength = normalizeMaximumLength(
      options.maxLength,
      MAX_HTML_LENGTH,
      MAX_HTML_LENGTH,
    );

    const locator = this.page.locator(
      selector,
    ).first();

    await locator.waitFor({
      state: "attached",
      timeout,
    });

    const html = await locator.evaluate(
      (
        element,
        outerHtml,
      ) => {
        const target = element as HTMLElement;

        return outerHtml
          ? target.outerHTML
          : target.innerHTML;
      },
      options.outerHtml === true,
    );

    const truncated = truncateValue(
      html,
      maxLength,
    );

    return createResult(
      this.page,
      "html",
      startedAt,
      truncated.value,
      {
        truncated: truncated.truncated,
      },
    );
  }

  public async extractLinks(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      readonly BrowserLink[]
    >
  > {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const limit = normalizeLimit(
      options.maxItems,
    );

    const root = this.page.locator(
      selector,
    ).first();

    await root.waitFor({
      state: "attached",
      timeout,
    });

    const links = await root.locator(
      "a[href]",
    ).evaluateAll(
      (
        elements,
        extractionOptions,
      ) => {
        const isVisible = (
          element: Element,
        ): boolean => {
          const htmlElement =
            element as HTMLElement;
          const style =
            window.getComputedStyle(
              htmlElement,
            );
          const rectangle =
            htmlElement.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rectangle.width > 0 &&
            rectangle.height > 0
          );
        };

        return elements
          .map((element) => {
            const anchor =
              element as HTMLAnchorElement;
            const visible =
              isVisible(anchor);

            if (
              !extractionOptions.includeHidden &&
              !visible
            ) {
              return null;
            }

            return {
              text: (
                anchor.innerText ||
                anchor.textContent ||
                ""
              )
                .replace(/\s+/g, " ")
                .trim(),
              href: anchor.href,
              title:
                anchor.getAttribute(
                  "title",
                ),
              target:
                anchor.getAttribute(
                  "target",
                ),
              rel:
                anchor.getAttribute("rel"),
              download:
                anchor.getAttribute(
                  "download",
                ),
              ariaLabel:
                anchor.getAttribute(
                  "aria-label",
                ),
              visible,
            };
          })
          .filter(
            (
              item,
            ): item is NonNullable<
              typeof item
            > => item !== null,
          )
          .slice(
            0,
            extractionOptions.limit,
          );
      },
      {
        limit,
        includeHidden:
          options.includeHidden === true,
      },
    );

    return createResult(
      this.page,
      "links",
      startedAt,
      links,
      {
        count: links.length,
      },
    );
  }

  public async extractImages(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      readonly BrowserImage[]
    >
  > {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const limit = normalizeLimit(
      options.maxItems,
    );

    const root = this.page.locator(
      selector,
    ).first();

    await root.waitFor({
      state: "attached",
      timeout,
    });

    const images = await root.locator(
      "img",
    ).evaluateAll(
      (
        elements,
        extractionOptions,
      ) => {
        const isVisible = (
          element: Element,
        ): boolean => {
          const htmlElement =
            element as HTMLElement;
          const style =
            window.getComputedStyle(
              htmlElement,
            );
          const rectangle =
            htmlElement.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rectangle.width > 0 &&
            rectangle.height > 0
          );
        };

        return elements
          .map((element) => {
            const image =
              element as HTMLImageElement;
            const visible =
              isVisible(image);

            if (
              !extractionOptions.includeHidden &&
              !visible
            ) {
              return null;
            }

            return {
              src: image.src,
              currentSrc:
                image.currentSrc,
              alt: image.alt,
              title:
                image.getAttribute(
                  "title",
                ),
              width: image.width,
              height: image.height,
              naturalWidth:
                image.naturalWidth,
              naturalHeight:
                image.naturalHeight,
              loading:
                image.getAttribute(
                  "loading",
                ),
              visible,
            };
          })
          .filter(
            (
              item,
            ): item is NonNullable<
              typeof item
            > => item !== null,
          )
          .slice(
            0,
            extractionOptions.limit,
          );
      },
      {
        limit,
        includeHidden:
          options.includeHidden === true,
      },
    );

    return createResult(
      this.page,
      "images",
      startedAt,
      images,
      {
        count: images.length,
      },
    );
  }

  public async extractForms(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      readonly BrowserForm[]
    >
  > {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const limit = normalizeLimit(
      options.maxItems,
    );

    const root = this.page.locator(
      selector,
    ).first();

    await root.waitFor({
      state: "attached",
      timeout,
    });

    const forms = await root.locator(
      "form",
    ).evaluateAll(
      (
        elements,
        maximumForms,
      ) => {
        return elements
          .slice(0, maximumForms)
          .map((element, index) => {
            const form =
              element as HTMLFormElement;

            const controls = Array.from(
              form.querySelectorAll<
                HTMLInputElement |
                HTMLTextAreaElement |
                HTMLSelectElement |
                HTMLButtonElement
              >(
                "input, textarea, select, button",
              ),
            );

            return {
              index,
              id: form.id,
              name:
                form.getAttribute(
                  "name",
                ) ?? "",
              action: form.action,
              method: (
                form.method || "get"
              ).toUpperCase(),
              enctype:
                form.enctype,
              target: form.target,
              fields: controls.map(
                (control) => {
                  const tagName =
                    control.tagName.toLowerCase();

                  const selectOptions =
                    control instanceof
                    HTMLSelectElement
                      ? Array.from(
                          control.options,
                        ).map(
                          (option) => ({
                            text:
                              option.text,
                            value:
                              option.value,
                            selected:
                              option.selected,
                            disabled:
                              option.disabled,
                          }),
                        )
                      : [];

                  const checkable =
                    control instanceof
                      HTMLInputElement &&
                    (
                      control.type ===
                        "checkbox" ||
                      control.type ===
                        "radio"
                    );

                  return {
                    tagName,
                    type:
                      control.getAttribute(
                        "type",
                      ) ??
                      (
                        tagName ===
                        "textarea"
                          ? "textarea"
                          : tagName ===
                              "select"
                            ? "select"
                            : tagName ===
                                "button"
                              ? "button"
                              : "text"
                      ),
                    name:
                      control.getAttribute(
                        "name",
                      ) ?? "",
                    id: control.id,
                    value:
                      "value" in control
                        ? String(
                            control.value,
                          )
                        : "",
                    placeholder:
                      control.getAttribute(
                        "placeholder",
                      ),
                    required:
                      "required" in
                      control
                        ? control.required
                        : false,
                    disabled:
                      control.disabled,
                    readOnly:
                      "readOnly" in
                      control
                        ? control.readOnly
                        : false,
                    checked:
                      checkable &&
                      control instanceof
                        HTMLInputElement
                        ? control.checked
                        : null,
                    multiple:
                      control instanceof
                        HTMLSelectElement
                        ? control.multiple
                        : false,
                    autocomplete:
                      control.getAttribute(
                        "autocomplete",
                      ),
                    ariaLabel:
                      control.getAttribute(
                        "aria-label",
                      ),
                    options:
                      selectOptions,
                  };
                },
              ),
            };
          });
      },
      limit,
    );

    return createResult(
      this.page,
      "forms",
      startedAt,
      forms,
      {
        count: forms.length,
      },
    );
  }

  public async extractHeadings(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      readonly BrowserHeading[]
    >
  > {
    const startedAt = Date.now();
    const selector = normalizeSelector(
      options.selector,
    );
    const timeout = normalizeTimeout(
      options.timeoutMs,
    );
    const limit = normalizeLimit(
      options.maxItems,
    );

    const root = this.page.locator(
      selector,
    ).first();

    await root.waitFor({
      state: "attached",
      timeout,
    });

    const headings = await root.locator(
      "h1, h2, h3, h4, h5, h6",
    ).evaluateAll(
      (
        elements,
        extractionOptions,
      ) => {
        const isVisible = (
          element: Element,
        ): boolean => {
          const htmlElement =
            element as HTMLElement;
          const style =
            window.getComputedStyle(
              htmlElement,
            );
          const rectangle =
            htmlElement.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rectangle.width > 0 &&
            rectangle.height > 0
          );
        };

        return elements
          .filter(
            (element) =>
              extractionOptions
                .includeHidden ||
              isVisible(element),
          )
          .slice(
            0,
            extractionOptions.limit,
          )
          .map((element) => ({
            level: Number(
              element.tagName.slice(1),
            ),
            text: (
              element.textContent ?? ""
            )
              .replace(/\s+/g, " ")
              .trim(),
            id:
              element.getAttribute("id"),
          }));
      },
      {
        limit,
        includeHidden:
          options.includeHidden === true,
      },
    );

    return createResult(
      this.page,
      "headings",
      startedAt,
      headings,
      {
        count: headings.length,
      },
    );
  }

  public async extractMetadata(): Promise<
    BrowserExtractionResult<
      BrowserPageMetadata
    >
  > {
    const startedAt = Date.now();

    const metadata =
      await this.page.evaluate(() => {
        const getMetaContent = (
          selector: string,
        ): string | null => {
          return (
            document
              .querySelector<
                HTMLMetaElement
              >(selector)
              ?.content.trim() || null
          );
        };

        const getLinkHref = (
          selector: string,
        ): string | null => {
          return (
            document
              .querySelector<
                HTMLLinkElement
              >(selector)
              ?.href || null
          );
        };

        const openGraph: Record<
          string,
          string
        > = {};

        const twitter: Record<
          string,
          string
        > = {};

        const metaTags =
          Array.from(
            document.querySelectorAll<
              HTMLMetaElement
            >("meta"),
          ).map((meta) => {
            const name =
              meta.getAttribute("name");
            const property =
              meta.getAttribute(
                "property",
              );
            const httpEquiv =
              meta.getAttribute(
                "http-equiv",
              );
            const content =
              meta.getAttribute(
                "content",
              ) ?? "";

            if (
              property?.startsWith("og:") &&
              content
            ) {
              openGraph[
                property.slice(3)
              ] = content;
            }

            const twitterKey =
              name?.startsWith(
                "twitter:",
              )
                ? name.slice(8)
                : property?.startsWith(
                      "twitter:",
                    )
                  ? property.slice(8)
                  : null;

            if (
              twitterKey &&
              content
            ) {
              twitter[twitterKey] =
                content;
            }

            return {
              name,
              property,
              httpEquiv,
              content,
            };
          });

        return {
          url: window.location.href,
          title: document.title,
          description:
            getMetaContent(
              'meta[name="description"]',
            ),
          language:
            document.documentElement.lang ||
            null,
          charset:
            document.characterSet || null,
          canonicalUrl:
            getLinkHref(
              'link[rel="canonical"]',
            ),
          faviconUrl:
            getLinkHref(
              'link[rel~="icon"]',
            ),
          author:
            getMetaContent(
              'meta[name="author"]',
            ),
          robots:
            getMetaContent(
              'meta[name="robots"]',
            ),
          viewport:
            getMetaContent(
              'meta[name="viewport"]',
            ),
          themeColor:
            getMetaContent(
              'meta[name="theme-color"]',
            ),
          openGraph,
          twitter,
          metaTags,
        };
      });

    return createResult(
      this.page,
      "metadata",
      startedAt,
      metadata,
    );
  }

  public async extractStructuredData(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      readonly BrowserStructuredData[]
    >
  > {
    const startedAt = Date.now();
    const limit = normalizeLimit(
      options.maxItems,
    );

    const structuredData =
      await this.page.locator(
        'script[type="application/ld+json"]',
      ).evaluateAll(
        (
          scripts,
          maximumItems,
        ) => {
          return scripts
            .slice(0, maximumItems)
            .map((script) => {
              const rawText =
                script.textContent?.trim() ??
                "";

              try {
                const parsed =
                  JSON.parse(rawText);

                const typeValue =
                  parsed &&
                  typeof parsed ===
                    "object" &&
                  "@type" in parsed
                    ? String(
                        parsed["@type"],
                      )
                    : null;

                return {
                  type: typeValue,
                  raw: parsed,
                };
              } catch {
                return {
                  type: null,
                  raw: rawText,
                };
              }
            });
        },
        limit,
      );

    return createResult(
      this.page,
      "structured-data",
      startedAt,
      structuredData,
      {
        count:
          structuredData.length,
      },
    );
  }

  public async snapshot(
    options: BrowserExtractionOptions = {},
  ): Promise<
    BrowserExtractionResult<
      BrowserPageSnapshot
    >
  > {
    const startedAt = Date.now();

    const [
      metadataResult,
      textResult,
      headingsResult,
      linksResult,
      imagesResult,
      formsResult,
      structuredDataResult,
    ] = await Promise.all([
      this.extractMetadata(),
      this.extractText({
        ...options,
        maxLength:
          MAX_TEXT_LENGTH,
      }),
      this.extractHeadings(options),
      this.extractLinks(options),
      this.extractImages(options),
      this.extractForms(options),
      this.extractStructuredData(
        options,
      ),
    ]);

    const snapshot: BrowserPageSnapshot = {
      metadata:
        metadataResult.data,
      text: textResult.data,
      headings:
        headingsResult.data,
      links: linksResult.data,
      images: imagesResult.data,
      forms: formsResult.data,
      structuredData:
        structuredDataResult.data,
    };

    return createResult(
      this.page,
      "snapshot",
      startedAt,
      snapshot,
    );
  }
}

export function createBrowserExtractor(
  page: Page,
): BrowserExtractor {
  return new BrowserExtractor(page);
}
