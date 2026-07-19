export type MemoryKind =
  | "fact"
  | "preference"
  | "instruction"
  | "conversation"
  | "task"
  | "document"
  | "system";

export interface MemoryRecord {
  readonly id: string;
  readonly userId: string;
  readonly kind: MemoryKind;
  readonly title: string;
  readonly content: string;
  readonly tags: ReadonlyArray<string>;
  readonly importance: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAccessedAt?: string;
  readonly accessCount: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateMemoryInput {
  readonly userId: string;
  readonly kind: MemoryKind;
  readonly title: string;
  readonly content: string;
  readonly tags?: ReadonlyArray<string>;
  readonly importance?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UpdateMemoryInput {
  readonly title?: string;
  readonly content?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly importance?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SearchMemoryInput {
  readonly userId: string;
  readonly query: string;
  readonly kinds?: ReadonlyArray<MemoryKind>;
  readonly tags?: ReadonlyArray<string>;
  readonly limit?: number;
  readonly minimumScore?: number;
}

export interface MemorySearchResult {
  readonly memory: MemoryRecord;
  readonly score: number;
  readonly matchedTerms: ReadonlyArray<string>;
}

export interface MemoryStoreData {
  readonly version: 1;
  readonly memories: ReadonlyArray<MemoryRecord>;
}
