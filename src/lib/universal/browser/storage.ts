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
  Page,
} from "playwright";

import type {
  BrowserSession,
} from "./session";

const MAX_HISTORY_ENTRIES = 500;

export type BrowserStorageKind =
  | "localStorage"
  | "sessionStorage";

export type BrowserStorageOperation =
  | "list"
  | "get"
  | "set"
  | "remove"
  | "clear"
  | "search"
  | "indexeddb-list"
  | "indexeddb-export"
  | "indexeddb-clear"
  | "export"
  | "import";

export interface BrowserStorageEntry {
  readonly key: string;
  readonly value: string;
}

export interface BrowserStorageSearchOptions {
  readonly kind?: BrowserStorageKind;
  readonly query: string;
  readonly searchKeys?: boolean;
  readonly searchValues?: boolean;
  readonly caseSensitive?: boolean;
}

export interface BrowserStorageSearchResult
  extends BrowserStorageEntry {
  readonly kind: BrowserStorageKind;
  readonly keyMatched: boolean;
  readonly valueMatched: boolean;
}

export interface BrowserStorageHistoryEntry {
  readonly id: string;
  readonly operation: BrowserStorageOperation;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly success: boolean;
  readonly affectedCount: number;
  readonly message: string;
}

export interface BrowserIndexedDbDatabaseInfo {
  readonly name: string;
  readonly version: number;
}

export interface BrowserIndexedDbRecord {
  readonly key: unknown;
  readonly value: unknown;
}

export interface BrowserIndexedDbStoreSnapshot {
  readonly name: string;
  readonly keyPath:
    | string
    | ReadonlyArray<string>
    | null;
  readonly autoIncrement: boolean;
  readonly indexes: ReadonlyArray<{
    readonly name: string;
    readonly keyPath:
      | string
      | ReadonlyArray<string>;
    readonly unique: boolean;
    readonly multiEntry: boolean;
  }>;
  readonly records:
    ReadonlyArray<BrowserIndexedDbRecord>;
}

export interface BrowserIndexedDbSnapshot {
  readonly name: string;
  readonly version: number;
  readonly stores:
    ReadonlyArray<BrowserIndexedDbStoreSnapshot>;
}

export interface BrowserStorageSnapshot {
  readonly version: 1;
  readonly exportedAt: string;
  readonly url: string;
  readonly origin: string;
  readonly localStorage:
    Readonly<Record<string, string>>;
  readonly sessionStorage:
    Readonly<Record<string, string>>;
  readonly indexedDB:
    ReadonlyArray<BrowserIndexedDbSnapshot>;
}

export interface BrowserStorageExportOptions {
  readonly includeLocalStorage?: boolean;
  readonly includeSessionStorage?: boolean;
  readonly includeIndexedDB?: boolean;
}

export interface BrowserStorageImportOptions {
  readonly importLocalStorage?: boolean;
  readonly importSessionStorage?: boolean;
  readonly importIndexedDB?: boolean;
  readonly clearExisting?: boolean;
}

export interface BrowserStorageImportResult {
  readonly localStorageImported: number;
  readonly sessionStorageImported: number;
  readonly indexedDbDatabasesImported: number;
  readonly indexedDbRecordsImported: number;
}

type IndexedDbFactoryWithDatabases = IDBFactory;

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
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} est obligatoire.`,
    );
  }

  return normalized;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(
    value,
  ).every(
    (entry) =>
      typeof entry === "string",
  );
}

function isIndexedDbRecord(
  value: unknown,
): value is BrowserIndexedDbRecord {
  return (
    isRecord(value) &&
    "key" in value &&
    "value" in value
  );
}

function isIndexedDbStoreSnapshot(
  value: unknown,
): value is BrowserIndexedDbStoreSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.autoIncrement ===
      "boolean" &&
    Array.isArray(value.indexes) &&
    Array.isArray(value.records) &&
    value.records.every(
      isIndexedDbRecord,
    )
  );
}

function isIndexedDbSnapshot(
  value: unknown,
): value is BrowserIndexedDbSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.name === "string" &&
    typeof value.version ===
      "number" &&
    Array.isArray(value.stores) &&
    value.stores.every(
      isIndexedDbStoreSnapshot,
    )
  );
}

function parseStorageSnapshot(
  content: string,
): BrowserStorageSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      content.replace(
        /^\uFEFF/,
        "",
      ),
    );
  } catch {
    throw new Error(
      "Le fichier JSON de stockage est invalide.",
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Le fichier ne contient pas une sauvegarde de stockage valide.",
    );
  }

  if (parsed.version !== 1) {
    throw new Error(
      "Version de sauvegarde non prise en charge.",
    );
  }

  if (
    !isStringRecord(
      parsed.localStorage,
    ) ||
    !isStringRecord(
      parsed.sessionStorage,
    ) ||
    !Array.isArray(
      parsed.indexedDB,
    ) ||
    !parsed.indexedDB.every(
      isIndexedDbSnapshot,
    )
  ) {
    throw new Error(
      "Le contenu de la sauvegarde est incomplet ou invalide.",
    );
  }

  return {
    version: 1,
    exportedAt:
      typeof parsed.exportedAt ===
      "string"
        ? parsed.exportedAt
        : new Date().toISOString(),
    url:
      typeof parsed.url === "string"
        ? parsed.url
        : "",
    origin:
      typeof parsed.origin === "string"
        ? parsed.origin
        : "",
    localStorage:
      parsed.localStorage,
    sessionStorage:
      parsed.sessionStorage,
    indexedDB:
      parsed.indexedDB,
  };
}

export class BrowserStorageManager {
  private readonly history:
    BrowserStorageHistoryEntry[] = [];

  public constructor(
    private readonly session: BrowserSession,
  ) {}

  private async getPage(): Promise<Page> {
    return this.session.getPage();
  }

  private addHistory(
    operation: BrowserStorageOperation,
    startedAt: Date,
    success: boolean,
    affectedCount: number,
    message: string,
  ): void {
    this.history.push({
      id: createHistoryId(),
      operation,
      startedAt:
        startedAt.toISOString(),
      completedAt:
        new Date().toISOString(),
      success,
      affectedCount,
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

  public async list(
    kind: BrowserStorageKind,
  ): Promise<
    ReadonlyArray<BrowserStorageEntry>
  > {
    const startedAt =
      new Date();

    try {
      const page =
        await this.getPage();

      const entries =
        await page.evaluate(
          (storageKind) => {
            const storage =
              storageKind ===
              "localStorage"
                ? window.localStorage
                : window.sessionStorage;

            const result: Array<{
              key: string;
              value: string;
            }> = [];

            for (
              let index = 0;
              index < storage.length;
              index += 1
            ) {
              const key =
                storage.key(index);

              if (key === null) {
                continue;
              }

              result.push({
                key,
                value:
                  storage.getItem(key) ??
                  "",
              });
            }

            return result.sort(
              (first, second) =>
                first.key.localeCompare(
                  second.key,
                ),
            );
          },
          kind,
        );

      this.addHistory(
        "list",
        startedAt,
        true,
        entries.length,
        `${entries.length} élément(s) trouvé(s) dans ${kind}.`,
      );

      return entries;
    } catch (error) {
      this.addHistory(
        "list",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async getItem(
    kind: BrowserStorageKind,
    key: string,
  ): Promise<string | null> {
    const startedAt =
      new Date();

    const normalizedKey =
      normalizeRequiredText(
        key,
        "La clé",
      );

    try {
      const page =
        await this.getPage();

      const value =
        await page.evaluate(
          ({
            storageKind,
            storageKey,
          }) => {
            const storage =
              storageKind ===
              "localStorage"
                ? window.localStorage
                : window.sessionStorage;

            return storage.getItem(
              storageKey,
            );
          },
          {
            storageKind: kind,
            storageKey:
              normalizedKey,
          },
        );

      this.addHistory(
        "get",
        startedAt,
        true,
        value === null ? 0 : 1,
        value === null
          ? `Clé "${normalizedKey}" absente de ${kind}.`
          : `Clé "${normalizedKey}" trouvée dans ${kind}.`,
      );

      return value;
    } catch (error) {
      this.addHistory(
        "get",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async setItem(
    kind: BrowserStorageKind,
    key: string,
    value: string,
  ): Promise<void> {
    const startedAt =
      new Date();

    const normalizedKey =
      normalizeRequiredText(
        key,
        "La clé",
      );

    try {
      const page =
        await this.getPage();

      await page.evaluate(
        ({
          storageKind,
          storageKey,
          storageValue,
        }) => {
          const storage =
            storageKind ===
            "localStorage"
              ? window.localStorage
              : window.sessionStorage;

          storage.setItem(
            storageKey,
            storageValue,
          );
        },
        {
          storageKind: kind,
          storageKey:
            normalizedKey,
          storageValue: value,
        },
      );

      this.addHistory(
        "set",
        startedAt,
        true,
        1,
        `Clé "${normalizedKey}" enregistrée dans ${kind}.`,
      );
    } catch (error) {
      this.addHistory(
        "set",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async setItems(
    kind: BrowserStorageKind,
    entries:
      Readonly<Record<string, string>>,
  ): Promise<number> {
    const startedAt =
      new Date();

    const normalizedEntries =
      Object.entries(entries).filter(
        ([key]) =>
          key.trim().length > 0,
      );

    try {
      const page =
        await this.getPage();

      await page.evaluate(
        ({
          storageKind,
          items,
        }) => {
          const storage =
            storageKind ===
            "localStorage"
              ? window.localStorage
              : window.sessionStorage;

          for (
            const [key, value]
            of items
          ) {
            storage.setItem(
              key,
              value,
            );
          }
        },
        {
          storageKind: kind,
          items:
            normalizedEntries,
        },
      );

      this.addHistory(
        "set",
        startedAt,
        true,
        normalizedEntries.length,
        `${normalizedEntries.length} élément(s) enregistré(s) dans ${kind}.`,
      );

      return normalizedEntries.length;
    } catch (error) {
      this.addHistory(
        "set",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async removeItem(
    kind: BrowserStorageKind,
    key: string,
  ): Promise<boolean> {
    const startedAt =
      new Date();

    const normalizedKey =
      normalizeRequiredText(
        key,
        "La clé",
      );

    try {
      const page =
        await this.getPage();

      const existed =
        await page.evaluate(
          ({
            storageKind,
            storageKey,
          }) => {
            const storage =
              storageKind ===
              "localStorage"
                ? window.localStorage
                : window.sessionStorage;

            const hadItem =
              storage.getItem(
                storageKey,
              ) !== null;

            storage.removeItem(
              storageKey,
            );

            return hadItem;
          },
          {
            storageKind: kind,
            storageKey:
              normalizedKey,
          },
        );

      this.addHistory(
        "remove",
        startedAt,
        true,
        existed ? 1 : 0,
        existed
          ? `Clé "${normalizedKey}" supprimée de ${kind}.`
          : `Clé "${normalizedKey}" absente de ${kind}.`,
      );

      return existed;
    } catch (error) {
      this.addHistory(
        "remove",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async clear(
    kind: BrowserStorageKind,
  ): Promise<number> {
    const startedAt =
      new Date();

    try {
      const page =
        await this.getPage();

      const removedCount =
        await page.evaluate(
          (storageKind) => {
            const storage =
              storageKind ===
              "localStorage"
                ? window.localStorage
                : window.sessionStorage;

            const count =
              storage.length;

            storage.clear();

            return count;
          },
          kind,
        );

      this.addHistory(
        "clear",
        startedAt,
        true,
        removedCount,
        `${removedCount} élément(s) supprimé(s) de ${kind}.`,
      );

      return removedCount;
    } catch (error) {
      this.addHistory(
        "clear",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async search(
    options: BrowserStorageSearchOptions,
  ): Promise<
    ReadonlyArray<BrowserStorageSearchResult>
  > {
    const startedAt =
      new Date();

    const query =
      normalizeRequiredText(
        options.query,
        "La recherche",
      );

    const kinds:
      ReadonlyArray<BrowserStorageKind> =
      options.kind
        ? [options.kind]
        : [
            "localStorage",
            "sessionStorage",
          ];

    const searchKeys =
      options.searchKeys ?? true;

    const searchValues =
      options.searchValues ?? true;

    if (
      !searchKeys &&
      !searchValues
    ) {
      throw new Error(
        "La recherche doit porter sur les clés, les valeurs ou les deux.",
      );
    }

    try {
      const results:
        BrowserStorageSearchResult[] = [];

      const comparableQuery =
        options.caseSensitive
          ? query
          : query.toLowerCase();

      for (const kind of kinds) {
        const entries =
          await this.list(kind);

        for (const entry of entries) {
          const comparableKey =
            options.caseSensitive
              ? entry.key
              : entry.key.toLowerCase();

          const comparableValue =
            options.caseSensitive
              ? entry.value
              : entry.value.toLowerCase();

          const keyMatched =
            searchKeys &&
            comparableKey.includes(
              comparableQuery,
            );

          const valueMatched =
            searchValues &&
            comparableValue.includes(
              comparableQuery,
            );

          if (
            keyMatched ||
            valueMatched
          ) {
            results.push({
              kind,
              key: entry.key,
              value: entry.value,
              keyMatched,
              valueMatched,
            });
          }
        }
      }

      this.addHistory(
        "search",
        startedAt,
        true,
        results.length,
        `${results.length} résultat(s) trouvé(s).`,
      );

      return results;
    } catch (error) {
      this.addHistory(
        "search",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async listIndexedDatabases(): Promise<
    ReadonlyArray<BrowserIndexedDbDatabaseInfo>
  > {
    const startedAt =
      new Date();

    try {
      const page =
        await this.getPage();

      const databases =
        await page.evaluate(
          async () => {
            const factory =
              indexedDB as
                IndexedDbFactoryWithDatabases;

            if (
              typeof factory.databases !==
              "function"
            ) {
              return [];
            }

            const databaseList =
              await factory.databases();

            return databaseList
              .filter(
                (
                  database,
                ): database is {
                  name: string;
                  version?: number;
                } =>
                  typeof database.name ===
                    "string" &&
                  database.name.length > 0,
              )
              .map(
                (database) => ({
                  name: database.name,
                  version:
                    database.version ??
                    1,
                }),
              );
          },
        );

      this.addHistory(
        "indexeddb-list",
        startedAt,
        true,
        databases.length,
        `${databases.length} base(s) IndexedDB trouvée(s).`,
      );

      return databases;
    } catch (error) {
      this.addHistory(
        "indexeddb-list",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async exportIndexedDatabase(
    databaseName: string,
  ): Promise<BrowserIndexedDbSnapshot> {
    const startedAt =
      new Date();

    const normalizedName =
      normalizeRequiredText(
        databaseName,
        "Le nom de la base IndexedDB",
      );

    try {
      const page =
        await this.getPage();

      const snapshot =
        await page.evaluate(
          async (name) => {
            function openDatabase(
              databaseNameValue: string,
            ): Promise<IDBDatabase> {
              return new Promise(
                (
                  resolvePromise,
                  rejectPromise,
                ) => {
                  const request =
                    indexedDB.open(
                      databaseNameValue,
                    );

                  request.onerror =
                    () => {
                      rejectPromise(
                        request.error ??
                          new Error(
                            "Impossible d'ouvrir IndexedDB.",
                          ),
                      );
                    };

                  request.onsuccess =
                    () => {
                      resolvePromise(
                        request.result,
                      );
                    };

                  request.onupgradeneeded =
                    () => {
                      request.transaction
                        ?.abort();
                    };
                },
              );
            }

            function readStore(
              database:
                IDBDatabase,
              storeName:
                string,
            ): Promise<{
              name: string;
              keyPath:
                | string
                | string[]
                | null;
              autoIncrement:
                boolean;
              indexes: Array<{
                name: string;
                keyPath:
                  | string
                  | string[];
                unique: boolean;
                multiEntry: boolean;
              }>;
              records: Array<{
                key: unknown;
                value: unknown;
              }>;
            }> {
              return new Promise(
                (
                  resolvePromise,
                  rejectPromise,
                ) => {
                  const transaction =
                    database.transaction(
                      storeName,
                      "readonly",
                    );

                  const store =
                    transaction.objectStore(
                      storeName,
                    );

                  const keysRequest =
                    store.getAllKeys();

                  const valuesRequest =
                    store.getAll();

                  transaction.onerror =
                    () => {
                      rejectPromise(
                        transaction.error ??
                          new Error(
                            `Impossible de lire ${storeName}.`,
                          ),
                      );
                    };

                  transaction.oncomplete =
                    () => {
                      const keys =
                        keysRequest.result;

                      const values =
                        valuesRequest.result;

                      const indexes =
                        Array.from(
                          store.indexNames,
                        ).map(
                          (indexName) => {
                            const index =
                              store.index(
                                indexName,
                              );

                            return {
                              name:
                                index.name,
                              keyPath:
                                index.keyPath,
                              unique:
                                index.unique,
                              multiEntry:
                                index.multiEntry,
                            };
                          },
                        );

                      resolvePromise({
                        name:
                          store.name,
                        keyPath:
                          store.keyPath,
                        autoIncrement:
                          store.autoIncrement,
                        indexes,
                        records:
                          values.map(
                            (
                              value,
                              index,
                            ) => ({
                              key:
                                keys[index],
                              value,
                            }),
                          ),
                      });
                    };
                },
              );
            }

            const database =
              await openDatabase(
                name,
              );

            try {
              const stores =
                await Promise.all(
                  Array.from(
                    database.objectStoreNames,
                  ).map(
                    (storeName) =>
                      readStore(
                        database,
                        storeName,
                      ),
                  ),
                );

              return {
                name:
                  database.name,
                version:
                  database.version,
                stores,
              };
            } finally {
              database.close();
            }
          },
          normalizedName,
        );

      const recordCount =
        snapshot.stores.reduce(
          (
            total,
            store,
          ) =>
            total +
            store.records.length,
          0,
        );

      this.addHistory(
        "indexeddb-export",
        startedAt,
        true,
        recordCount,
        `${recordCount} enregistrement(s) exporté(s) depuis ${normalizedName}.`,
      );

      return snapshot;
    } catch (error) {
      this.addHistory(
        "indexeddb-export",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async exportAllIndexedDatabases(): Promise<
    ReadonlyArray<BrowserIndexedDbSnapshot>
  > {
    const databases =
      await this.listIndexedDatabases();

    const snapshots:
      BrowserIndexedDbSnapshot[] = [];

    for (
      const database
      of databases
    ) {
      snapshots.push(
        await this.exportIndexedDatabase(
          database.name,
        ),
      );
    }

    return snapshots;
  }

  public async clearIndexedDatabase(
    databaseName: string,
  ): Promise<number> {
    const startedAt =
      new Date();

    const normalizedName =
      normalizeRequiredText(
        databaseName,
        "Le nom de la base IndexedDB",
      );

    try {
      const page =
        await this.getPage();

      const removedCount =
        await page.evaluate(
          async (name) => {
            function openDatabase(
              databaseNameValue: string,
            ): Promise<IDBDatabase> {
              return new Promise(
                (
                  resolvePromise,
                  rejectPromise,
                ) => {
                  const request =
                    indexedDB.open(
                      databaseNameValue,
                    );

                  request.onerror =
                    () => {
                      rejectPromise(
                        request.error,
                      );
                    };

                  request.onsuccess =
                    () => {
                      resolvePromise(
                        request.result,
                      );
                    };
                },
              );
            }

            const database =
              await openDatabase(
                name,
              );

            try {
              const storeNames =
                Array.from(
                  database.objectStoreNames,
                );

              if (
                storeNames.length === 0
              ) {
                return 0;
              }

              const counts =
                await Promise.all(
                  storeNames.map(
                    (storeName) =>
                      new Promise<number>(
                        (
                          resolvePromise,
                          rejectPromise,
                        ) => {
                          const transaction =
                            database.transaction(
                              storeName,
                              "readwrite",
                            );

                          const store =
                            transaction.objectStore(
                              storeName,
                            );

                          const countRequest =
                            store.count();

                          countRequest.onerror =
                            () => {
                              rejectPromise(
                                countRequest.error,
                              );
                            };

                          countRequest.onsuccess =
                            () => {
                              const count =
                                countRequest.result;

                              const clearRequest =
                                store.clear();

                              clearRequest.onerror =
                                () => {
                                  rejectPromise(
                                    clearRequest.error,
                                  );
                                };

                              clearRequest.onsuccess =
                                () => {
                                  resolvePromise(
                                    count,
                                  );
                                };
                            };
                        },
                      ),
                  ),
                );

              return counts.reduce(
                (
                  total,
                  count,
                ) =>
                  total +
                  count,
                0,
              );
            } finally {
              database.close();
            }
          },
          normalizedName,
        );

      this.addHistory(
        "indexeddb-clear",
        startedAt,
        true,
        removedCount,
        `${removedCount} enregistrement(s) supprimé(s) de ${normalizedName}.`,
      );

      return removedCount;
    } catch (error) {
      this.addHistory(
        "indexeddb-clear",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async exportStorage(
    filePath: string,
    options:
      BrowserStorageExportOptions = {},
  ): Promise<BrowserStorageSnapshot> {
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

      const page =
        await this.getPage();

      const includeLocalStorage =
        options.includeLocalStorage ??
        true;

      const includeSessionStorage =
        options.includeSessionStorage ??
        true;

      const includeIndexedDB =
        options.includeIndexedDB ??
        true;

      const basicSnapshot =
        await page.evaluate(
          ({
            localEnabled,
            sessionEnabled,
          }) => {
            function storageToRecord(
              storage: Storage,
            ): Record<string, string> {
              const result:
                Record<string, string> =
                {};

              for (
                let index = 0;
                index < storage.length;
                index += 1
              ) {
                const key =
                  storage.key(index);

                if (key === null) {
                  continue;
                }

                result[key] =
                  storage.getItem(key) ??
                  "";
              }

              return result;
            }

            return {
              url:
                window.location.href,
              origin:
                window.location.origin,
              localStorage:
                localEnabled
                  ? storageToRecord(
                      window.localStorage,
                    )
                  : {},
              sessionStorage:
                sessionEnabled
                  ? storageToRecord(
                      window.sessionStorage,
                    )
                  : {},
            };
          },
          {
            localEnabled:
              includeLocalStorage,
            sessionEnabled:
              includeSessionStorage,
          },
        );

      const indexedDB =
        includeIndexedDB
          ? await this.exportAllIndexedDatabases()
          : [];

      const snapshot:
        BrowserStorageSnapshot = {
          version: 1,
          exportedAt:
            new Date().toISOString(),
          url:
            basicSnapshot.url,
          origin:
            basicSnapshot.origin,
          localStorage:
            basicSnapshot.localStorage,
          sessionStorage:
            basicSnapshot.sessionStorage,
          indexedDB,
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
          snapshot,
          null,
          2,
        )}\n`,
        "utf8",
      );

      const affectedCount =
        Object.keys(
          snapshot.localStorage,
        ).length +
        Object.keys(
          snapshot.sessionStorage,
        ).length +
        snapshot.indexedDB.reduce(
          (
            total,
            database,
          ) =>
            total +
            database.stores.reduce(
              (
                storeTotal,
                store,
              ) =>
                storeTotal +
                store.records.length,
              0,
            ),
          0,
        );

      this.addHistory(
        "export",
        startedAt,
        true,
        affectedCount,
        `Stockage exporté vers ${normalizedPath}.`,
      );

      return snapshot;
    } catch (error) {
      this.addHistory(
        "export",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public async importStorage(
    filePath: string,
    options:
      BrowserStorageImportOptions = {},
  ): Promise<BrowserStorageImportResult> {
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

      const content =
        await readFile(
          normalizedPath,
          "utf8",
        );

      const snapshot =
        parseStorageSnapshot(
          content,
        );

      const importLocalStorage =
        options.importLocalStorage ??
        true;

      const importSessionStorage =
        options.importSessionStorage ??
        true;

      const importIndexedDB =
        options.importIndexedDB ??
        true;

      const clearExisting =
        options.clearExisting ??
        false;

      const page =
        await this.getPage();

      const webStorageResult =
        await page.evaluate(
          ({
            localEntries,
            sessionEntries,
            localEnabled,
            sessionEnabled,
            shouldClear,
          }) => {
            if (localEnabled) {
              if (shouldClear) {
                window.localStorage.clear();
              }

              for (
                const [
                  key,
                  value,
                ] of localEntries
              ) {
                window.localStorage.setItem(
                  key,
                  value,
                );
              }
            }

            if (sessionEnabled) {
              if (shouldClear) {
                window.sessionStorage.clear();
              }

              for (
                const [
                  key,
                  value,
                ] of sessionEntries
              ) {
                window.sessionStorage.setItem(
                  key,
                  value,
                );
              }
            }

            return {
              localCount:
                localEnabled
                  ? localEntries.length
                  : 0,
              sessionCount:
                sessionEnabled
                  ? sessionEntries.length
                  : 0,
            };
          },
          {
            localEntries:
              Object.entries(
                snapshot.localStorage,
              ),
            sessionEntries:
              Object.entries(
                snapshot.sessionStorage,
              ),
            localEnabled:
              importLocalStorage,
            sessionEnabled:
              importSessionStorage,
            shouldClear:
              clearExisting,
          },
        );

      let indexedDbDatabasesImported =
        0;

      let indexedDbRecordsImported =
        0;

      if (importIndexedDB) {
        for (
          const databaseSnapshot
          of snapshot.indexedDB
        ) {
          const importResult =
            await page.evaluate(
              async ({
                snapshotData,
                shouldClear,
              }) => {
                function openDatabase(
                  databaseName:
                    string,
                  version:
                    number,
                  stores:
                    Array<{
                      name:
                        string;
                      keyPath:
                        | string
                        | string[]
                        | null;
                      autoIncrement:
                        boolean;
                      indexes:
                        Array<{
                          name:
                            string;
                          keyPath:
                            | string
                            | string[];
                          unique:
                            boolean;
                          multiEntry:
                            boolean;
                        }>;
                    }>,
                ): Promise<IDBDatabase> {
                  return new Promise(
                    (
                      resolvePromise,
                      rejectPromise,
                    ) => {
                      const request =
                        indexedDB.open(
                          databaseName,
                          Math.max(
                            version,
                            1,
                          ),
                        );

                      request.onerror =
                        () => {
                          rejectPromise(
                            request.error ??
                              new Error(
                                "Impossible d'ouvrir IndexedDB.",
                              ),
                          );
                        };

                      request.onupgradeneeded =
                        () => {
                          const database =
                            request.result;

                          for (
                            const storeSnapshot
                            of stores
                          ) {
                            let store:
                              IDBObjectStore;

                            if (
                              database.objectStoreNames.contains(
                                storeSnapshot.name,
                              )
                            ) {
                              store =
                                request.transaction
                                  ?.objectStore(
                                    storeSnapshot.name,
                                  ) as IDBObjectStore;
                            } else {
                              store =
                                database.createObjectStore(
                                  storeSnapshot.name,
                                  {
                                    keyPath:
                                      storeSnapshot.keyPath,
                                    autoIncrement:
                                      storeSnapshot.autoIncrement,
                                  },
                                );
                            }

                            for (
                              const indexSnapshot
                              of storeSnapshot.indexes
                            ) {
                              if (
                                !store.indexNames.contains(
                                  indexSnapshot.name,
                                )
                              ) {
                                store.createIndex(
                                  indexSnapshot.name,
                                  indexSnapshot.keyPath,
                                  {
                                    unique:
                                      indexSnapshot.unique,
                                    multiEntry:
                                      indexSnapshot.multiEntry,
                                  },
                                );
                              }
                            }
                          }
                        };

                      request.onsuccess =
                        () => {
                          resolvePromise(
                            request.result,
                          );
                        };
                    },
                  );
                }

                const database =
                  await openDatabase(
                    snapshotData.name,
                    snapshotData.version,
                    snapshotData.stores.map(
                      (storeSnapshot) => ({
                        name: storeSnapshot.name,
                        keyPath:
                          typeof storeSnapshot.keyPath === "string"
                            ? storeSnapshot.keyPath
                            : Array.isArray(storeSnapshot.keyPath)
                              ? Array.from(storeSnapshot.keyPath)
                              : null,
                        autoIncrement:
                          storeSnapshot.autoIncrement,
                        indexes:
                          storeSnapshot.indexes.map(
                            (indexSnapshot) => ({
                              name:
                                indexSnapshot.name,
                              keyPath:
                                typeof indexSnapshot.keyPath === "string"
                                  ? indexSnapshot.keyPath
                                  : Array.from(indexSnapshot.keyPath),
                              unique:
                                indexSnapshot.unique,
                              multiEntry:
                                indexSnapshot.multiEntry,
                            }),
                          ),
                      }),
                    ),
                  );

                let importedCount =
                  0;

                try {
                  for (
                    const storeSnapshot
                    of snapshotData.stores
                  ) {
                    if (
                      !database.objectStoreNames.contains(
                        storeSnapshot.name,
                      )
                    ) {
                      continue;
                    }

                    await new Promise<void>(
                      (
                        resolvePromise,
                        rejectPromise,
                      ) => {
                        const transaction =
                          database.transaction(
                            storeSnapshot.name,
                            "readwrite",
                          );

                        const store =
                          transaction.objectStore(
                            storeSnapshot.name,
                          );

                        transaction.onerror =
                          () => {
                            rejectPromise(
                              transaction.error,
                            );
                          };

                        transaction.oncomplete =
                          () => {
                            resolvePromise();
                          };

                        if (shouldClear) {
                          store.clear();
                        }

                        for (
                          const record
                          of storeSnapshot.records
                        ) {
                          if (
                            store.keyPath ===
                              null &&
                            record.key !==
                              undefined &&
                            record.key !==
                              null
                          ) {
                            store.put(
                              record.value,
                              record.key as
                                IDBValidKey,
                            );
                          } else {
                            store.put(
                              record.value,
                            );
                          }

                          importedCount +=
                            1;
                        }
                      },
                    );
                  }

                  return {
                    importedCount,
                  };
                } finally {
                  database.close();
                }
              },
              {
                snapshotData:
                  databaseSnapshot,
                shouldClear:
                  clearExisting,
              },
            );

          indexedDbDatabasesImported +=
            1;

          indexedDbRecordsImported +=
            importResult.importedCount;
        }
      }

      const result:
        BrowserStorageImportResult = {
          localStorageImported:
            webStorageResult.localCount,
          sessionStorageImported:
            webStorageResult.sessionCount,
          indexedDbDatabasesImported,
          indexedDbRecordsImported,
        };

      const affectedCount =
        result.localStorageImported +
        result.sessionStorageImported +
        result.indexedDbRecordsImported;

      this.addHistory(
        "import",
        startedAt,
        true,
        affectedCount,
        `${affectedCount} élément(s) de stockage importé(s).`,
      );

      return result;
    } catch (error) {
      this.addHistory(
        "import",
        startedAt,
        false,
        0,
        error instanceof Error
          ? error.message
          : String(error),
      );

      throw error;
    }
  }

  public getHistory(): ReadonlyArray<
    BrowserStorageHistoryEntry
  > {
    return [
      ...this.history,
    ];
  }

  public clearHistory(): void {
    this.history.length = 0;
  }
}

export function createBrowserStorageManager(
  session: BrowserSession,
): BrowserStorageManager {
  return new BrowserStorageManager(
    session,
  );
}