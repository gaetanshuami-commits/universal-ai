import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import type {
  BrowserContext,
  Cookie,
} from "playwright";

type SetCookieParam =
  Parameters<BrowserContext["addCookies"]>[0][number];

import type {
  BrowserSession,
} from "./session";

const MAX_HISTORY_ENTRIES = 500;

export type BrowserCookieSameSite =
  | "Strict"
  | "Lax"
  | "None";

export interface BrowserCookieInput {
  readonly name: string;
  readonly value: string;
  readonly url?: string;
  readonly domain?: string;
  readonly path?: string;
  readonly expires?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: BrowserCookieSameSite;
}

export interface BrowserCookieFilter {
  readonly urls?: ReadonlyArray<string>;
  readonly domain?: string;
  readonly name?: string;
  readonly path?: string;
  readonly secure?: boolean;
  readonly httpOnly?: boolean;
}

export type BrowserCookieOperation =
  | "list"
  | "add"
  | "add-many"
  | "remove"
  | "remove-domain"
  | "clear"
  | "export"
  | "import";

export interface BrowserCookieHistoryEntry {
  readonly id: string;
  readonly operation: BrowserCookieOperation;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly affectedCount: number;
  readonly success: boolean;
  readonly message: string;
}

export interface BrowserCookieExport {
  readonly version: 1;
  readonly exportedAt: string;
  readonly cookies: ReadonlyArray<Cookie>;
}

export interface BrowserCookieImportOptions {
  readonly replaceExisting?: boolean;
  readonly domain?: string;
}

export interface BrowserCookieImportResult {
  readonly importedCount: number;
  readonly skippedCount: number;
  readonly replacedExisting: boolean;
}

export interface BrowserCookieRemoveResult {
  readonly removedCount: number;
  readonly remainingCount: number;
}

function createHistoryId(): string {
  return [
    Date.now().toString(36),
    Math.random()
      .toString(36)
      .slice(2, 10),
  ].join("-");
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} est obligatoire.`,
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();

  return normalized
    ? normalized
    : undefined;
}

function normalizeDomain(
  domain: string,
): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

function cookieMatchesDomain(
  cookie: Cookie,
  requestedDomain: string,
): boolean {
  const cookieDomain =
    normalizeDomain(cookie.domain);

  const targetDomain =
    normalizeDomain(requestedDomain);

  return (
    cookieDomain === targetDomain ||
    cookieDomain.endsWith(
      `.${targetDomain}`,
    )
  );
}

function cookieMatchesFilter(
  cookie: Cookie,
  filter: BrowserCookieFilter,
): boolean {
  if (
    filter.domain &&
    !cookieMatchesDomain(
      cookie,
      filter.domain,
    )
  ) {
    return false;
  }

  if (
    filter.name &&
    cookie.name !== filter.name
  ) {
    return false;
  }

  if (
    filter.path &&
    cookie.path !== filter.path
  ) {
    return false;
  }

  if (
    filter.secure !== undefined &&
    cookie.secure !== filter.secure
  ) {
    return false;
  }

  if (
    filter.httpOnly !== undefined &&
    cookie.httpOnly !== filter.httpOnly
  ) {
    return false;
  }

  return true;
}

function cookieToSetCookieParam(
  cookie: Cookie,
): SetCookieParam {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  };
}

function inputToSetCookieParam(
  input: BrowserCookieInput,
): SetCookieParam {
  const name =
    normalizeRequiredText(
      input.name,
      "Le nom du cookie",
    );

  const value =
    input.value ?? "";

  const url =
    normalizeOptionalText(
      input.url,
    );

  const domain =
    normalizeOptionalText(
      input.domain,
    );

  if (!url && !domain) {
    throw new Error(
      `Le cookie "${name}" doit contenir une URL ou un domaine.`,
    );
  }

  if (url) {
    let parsedUrl: URL;

    try {
      parsedUrl =
        new URL(url);
    } catch {
      throw new Error(
        `URL invalide pour le cookie "${name}" : ${url}`,
      );
    }

    if (
      parsedUrl.protocol !== "http:" &&
      parsedUrl.protocol !== "https:"
    ) {
      throw new Error(
        `Le cookie "${name}" utilise un protocole non autorisÃ©.`,
      );
    }
  }

  const path =
    normalizeOptionalText(
      input.path,
    ) ?? "/";

  const result: SetCookieParam = {
    name,
    value,
    path,
    httpOnly:
      input.httpOnly ?? false,
    secure:
      input.secure ?? false,
    sameSite:
      input.sameSite ?? "Lax",
  };

  if (url) {
    result.url = url;
  } else if (domain) {
    result.domain = domain;
  }

  if (
    input.expires !== undefined &&
    Number.isFinite(input.expires)
  ) {
    result.expires =
      Math.floor(input.expires);
  }

  return result;
}

function isCookieLike(
  value: unknown,
): value is Cookie {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const candidate =
    value as Partial<Cookie>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.value === "string" &&
    typeof candidate.domain === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.expires === "number" &&
    typeof candidate.httpOnly === "boolean" &&
    typeof candidate.secure === "boolean" &&
    (
      candidate.sameSite === "Strict" ||
      candidate.sameSite === "Lax" ||
      candidate.sameSite === "None"
    )
  );
}

function parseCookieExport(
  rawContent: string,
): BrowserCookieExport {
  let parsed: unknown;

  try {
    parsed =
      JSON.parse(rawContent);
  } catch {
    throw new Error(
      "Le fichier JSON des cookies est invalide.",
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object"
  ) {
    throw new Error(
      "Le fichier ne contient pas un export de cookies valide.",
    );
  }

  const candidate =
    parsed as Partial<BrowserCookieExport>;

  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.cookies)
  ) {
    throw new Error(
      "Format d'export des cookies non pris en charge.",
    );
  }

  const cookies =
    candidate.cookies.filter(
      isCookieLike,
    );

  if (
    cookies.length !==
    candidate.cookies.length
  ) {
    throw new Error(
      "Un ou plusieurs cookies du fichier sont invalides.",
    );
  }

  return {
    version: 1,
    exportedAt:
      typeof candidate.exportedAt ===
      "string"
        ? candidate.exportedAt
        : new Date().toISOString(),
    cookies,
  };
}

export class BrowserCookiesManager {
  private readonly history:
    BrowserCookieHistoryEntry[] = [];

  public constructor(
    private readonly session: BrowserSession,
  ) {}

  private async getContext(): Promise<BrowserContext> {
    const page =
      await this.session.getPage();

    return page.context();
  }

  private addHistory(
    operation: BrowserCookieOperation,
    startedAt: Date,
    affectedCount: number,
    success: boolean,
    message: string,
  ): void {
    this.history.push({
      id: createHistoryId(),
      operation,
      startedAt:
        startedAt.toISOString(),
      completedAt:
        new Date().toISOString(),
      affectedCount,
      success,
      message,
    });

    if (
      this.history.length >
      MAX_HISTORY_ENTRIES
    ) {
      this.history.splice(
        0,
        this.history.length -
          MAX_HISTORY_ENTRIES,
      );
    }
  }

  public async getCookies(
    filter: BrowserCookieFilter = {},
  ): Promise<ReadonlyArray<Cookie>> {
    const startedAt =
      new Date();

    try {
      const context =
        await this.getContext();

      const urls =
        filter.urls
          ?.map((url) => url.trim())
          .filter(Boolean);

      const cookies =
        urls && urls.length > 0
          ? await context.cookies(
              urls,
            )
          : await context.cookies();

      const filteredCookies =
        cookies.filter(
          (cookie) =>
            cookieMatchesFilter(
              cookie,
              filter,
            ),
        );

      this.addHistory(
        "list",
        startedAt,
        filteredCookies.length,
        true,
        `${filteredCookies.length} cookie(s) trouvÃ©(s).`,
      );

      return filteredCookies;
    } catch (error) {
      this.addHistory(
        "list",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async getCookiesByDomain(
    domain: string,
  ): Promise<ReadonlyArray<Cookie>> {
    return this.getCookies({
      domain:
        normalizeRequiredText(
          domain,
          "Le domaine",
        ),
    });
  }

  public async addCookie(
    cookie: BrowserCookieInput,
  ): Promise<Cookie> {
    const startedAt =
      new Date();

    try {
      const context =
        await this.getContext();

      const normalizedCookie =
        inputToSetCookieParam(
          cookie,
        );

      await context.addCookies([
        normalizedCookie,
      ]);

      const allCookies =
        await context.cookies();

      const addedCookie =
        allCookies.find(
          (candidate) => {
            if (
              candidate.name !==
              normalizedCookie.name
            ) {
              return false;
            }

            if (
              normalizedCookie.domain &&
              !cookieMatchesDomain(
                candidate,
                normalizedCookie.domain,
              )
            ) {
              return false;
            }

            return true;
          },
        );

      if (!addedCookie) {
        throw new Error(
          `Le cookie "${normalizedCookie.name}" n'a pas pu Ãªtre vÃ©rifiÃ© aprÃ¨s son ajout.`,
        );
      }

      this.addHistory(
        "add",
        startedAt,
        1,
        true,
        `Cookie "${addedCookie.name}" ajoutÃ©.`,
      );

      return addedCookie;
    } catch (error) {
      this.addHistory(
        "add",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async addCookies(
    cookies: ReadonlyArray<BrowserCookieInput>,
  ): Promise<number> {
    const startedAt =
      new Date();

    if (cookies.length === 0) {
      this.addHistory(
        "add-many",
        startedAt,
        0,
        true,
        "Aucun cookie Ã  ajouter.",
      );

      return 0;
    }

    try {
      const context =
        await this.getContext();

      const normalizedCookies =
        cookies.map(
          inputToSetCookieParam,
        );

      await context.addCookies(
        normalizedCookies,
      );

      this.addHistory(
        "add-many",
        startedAt,
        normalizedCookies.length,
        true,
        `${normalizedCookies.length} cookie(s) ajoutÃ©(s).`,
      );

      return normalizedCookies.length;
    } catch (error) {
      this.addHistory(
        "add-many",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  private async removeMatchingCookies(
    filter: BrowserCookieFilter,
    operation:
      | "remove"
      | "remove-domain",
  ): Promise<BrowserCookieRemoveResult> {
    const startedAt =
      new Date();

    try {
      const context =
        await this.getContext();

      const existingCookies =
        await context.cookies();

      const cookiesToRemove =
        existingCookies.filter(
          (cookie) =>
            cookieMatchesFilter(
              cookie,
              filter,
            ),
        );

      if (
        cookiesToRemove.length === 0
      ) {
        this.addHistory(
          operation,
          startedAt,
          0,
          true,
          "Aucun cookie correspondant trouvÃ©.",
        );

        return {
          removedCount: 0,
          remainingCount:
            existingCookies.length,
        };
      }

      const cookiesToKeep =
        existingCookies.filter(
          (cookie) =>
            !cookieMatchesFilter(
              cookie,
              filter,
            ),
        );

      await context.clearCookies();

      if (
        cookiesToKeep.length > 0
      ) {
        await context.addCookies(
          cookiesToKeep.map(
            cookieToSetCookieParam,
          ),
        );
      }

      this.addHistory(
        operation,
        startedAt,
        cookiesToRemove.length,
        true,
        `${cookiesToRemove.length} cookie(s) supprimÃ©(s).`,
      );

      return {
        removedCount:
          cookiesToRemove.length,
        remainingCount:
          cookiesToKeep.length,
      };
    } catch (error) {
      this.addHistory(
        operation,
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async removeCookies(
    filter: BrowserCookieFilter,
  ): Promise<BrowserCookieRemoveResult> {
    if (
      !filter.domain &&
      !filter.name &&
      !filter.path &&
      filter.secure === undefined &&
      filter.httpOnly === undefined
    ) {
      throw new Error(
        "Un filtre est obligatoire pour supprimer des cookies. Utilisez clearCookies() pour tout supprimer.",
      );
    }

    return this.removeMatchingCookies(
      filter,
      "remove",
    );
  }

  public async removeCookiesByDomain(
    domain: string,
  ): Promise<BrowserCookieRemoveResult> {
    return this.removeMatchingCookies(
      {
        domain:
          normalizeRequiredText(
            domain,
            "Le domaine",
          ),
      },
      "remove-domain",
    );
  }

  public async clearCookies(): Promise<number> {
    const startedAt =
      new Date();

    try {
      const context =
        await this.getContext();

      const existingCookies =
        await context.cookies();

      await context.clearCookies();

      this.addHistory(
        "clear",
        startedAt,
        existingCookies.length,
        true,
        `${existingCookies.length} cookie(s) supprimÃ©(s).`,
      );

      return existingCookies.length;
    } catch (error) {
      this.addHistory(
        "clear",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async exportCookies(
    filePath: string,
    filter: BrowserCookieFilter = {},
  ): Promise<BrowserCookieExport> {
    const startedAt =
      new Date();

    try {
      const normalizedPath =
        resolve(
          normalizeRequiredText(
            filePath,
            "Le chemin d'export",
          ),
        );

      const cookies =
        await this.getCookies(
          filter,
        );

      const exportData:
        BrowserCookieExport = {
          version: 1,
          exportedAt:
            new Date().toISOString(),
          cookies,
        };

      await mkdir(
        dirname(normalizedPath),
        {
          recursive: true,
        },
      );

      await writeFile(
        normalizedPath,
        `${JSON.stringify(
          exportData,
          null,
          2,
        )}\n`,
        "utf8",
      );

      this.addHistory(
        "export",
        startedAt,
        cookies.length,
        true,
        `${cookies.length} cookie(s) exportÃ©(s) vers ${normalizedPath}.`,
      );

      return exportData;
    } catch (error) {
      this.addHistory(
        "export",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async importCookies(
    filePath: string,
    options: BrowserCookieImportOptions = {},
  ): Promise<BrowserCookieImportResult> {
    const startedAt =
      new Date();

    try {
      const normalizedPath =
        resolve(
          normalizeRequiredText(
            filePath,
            "Le chemin d'import",
          ),
        );

      const rawContent =
        await readFile(
          normalizedPath,
          "utf8",
        );

      const exportData =
        parseCookieExport(
          rawContent.replace(
            /^\uFEFF/,
            "",
          ),
        );

      const selectedCookies =
        options.domain
          ? exportData.cookies.filter(
              (cookie) =>
                cookieMatchesDomain(
                  cookie,
                  options.domain as string,
                ),
            )
          : [...exportData.cookies];

      const context =
        await this.getContext();

      if (
        options.replaceExisting
      ) {
        await context.clearCookies();
      }

      if (
        selectedCookies.length > 0
      ) {
        await context.addCookies(
          selectedCookies.map(
            cookieToSetCookieParam,
          ),
        );
      }

      const result:
        BrowserCookieImportResult = {
          importedCount:
            selectedCookies.length,
          skippedCount:
            exportData.cookies.length -
            selectedCookies.length,
          replacedExisting:
            options.replaceExisting ??
            false,
        };

      this.addHistory(
        "import",
        startedAt,
        result.importedCount,
        true,
        `${result.importedCount} cookie(s) importÃ©(s).`,
      );

      return result;
    } catch (error) {
      this.addHistory(
        "import",
        startedAt,
        0,
        false,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public getHistory(): ReadonlyArray<
    BrowserCookieHistoryEntry
  > {
    return [
      ...this.history,
    ];
  }

  public clearHistory(): void {
    this.history.length = 0;
  }
}

export function createBrowserCookiesManager(
  session: BrowserSession,
): BrowserCookiesManager {
  return new BrowserCookiesManager(
    session,
  );
}