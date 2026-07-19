import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type {
  CreateMemoryInput,
  MemoryRecord,
  MemorySearchResult,
  MemoryStoreData,
  SearchMemoryInput,
  UpdateMemoryInput,
} from "./types";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function getMemoryFilePath(): string {
  const configuredPath =
    process.env.UNIVERSAL_MEMORY_FILE?.trim();

  if (configuredPath) {
    return path.resolve(configuredPath);
  }

  return path.join(
    process.cwd(),
    ".data",
    "universal-memory.json",
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(" ")
        .filter((token) => token.length >= 2),
    ),
  );
}

function normalizeTags(
  tags: ReadonlyArray<string> | undefined,
): string[] {
  if (!tags) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .map((tag) => normalizeText(tag))
        .filter(Boolean),
    ),
  );
}

function clampImportance(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.min(
    1,
    Math.max(0, value as number),
  );
}

function normalizeLimit(
  value: number | undefined,
): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(value as number)),
  );
}

function createEmptyStore(): MemoryStoreData {
  return {
    version: 1,
    memories: [],
  };
}

async function ensureStoreDirectory(): Promise<void> {
  await mkdir(
    path.dirname(getMemoryFilePath()),
    {
      recursive: true,
    },
  );
}

async function readStore(): Promise<MemoryStoreData> {
  const filePath = getMemoryFilePath();

  try {
    const raw = await readFile(
      filePath,
      "utf8",
    );

    const parsed =
      JSON.parse(raw) as Partial<MemoryStoreData>;

    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.memories)
    ) {
      throw new Error(
        "Format de mémoire invalide.",
      );
    }

    return {
      version: 1,
      memories: parsed.memories,
    };
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error
        ? String(error.code)
        : "";

    if (code === "ENOENT") {
      return createEmptyStore();
    }

    throw error;
  }
}

async function writeStore(
  data: MemoryStoreData,
): Promise<void> {
  await ensureStoreDirectory();

  const filePath = getMemoryFilePath();
  const temporaryPath =
    `${filePath}.${randomUUID()}.tmp`;

  await writeFile(
    temporaryPath,
    JSON.stringify(data, null, 2),
    "utf8",
  );

  await rename(
    temporaryPath,
    filePath,
  );
}

function calculateSearchScore(
  memory: MemoryRecord,
  queryTokens: ReadonlyArray<string>,
): {
  score: number;
  matchedTerms: string[];
} {
  const titleTokens =
    new Set(tokenize(memory.title));

  const contentTokens =
    new Set(tokenize(memory.content));

  const tagTokens =
    new Set(
      memory.tags.flatMap((tag) =>
        tokenize(tag),
      ),
    );

  const matchedTerms =
    queryTokens.filter(
      (token) =>
        titleTokens.has(token) ||
        contentTokens.has(token) ||
        tagTokens.has(token),
    );

  if (queryTokens.length === 0) {
    return {
      score: memory.importance,
      matchedTerms: [],
    };
  }

  let weightedMatches = 0;

  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      weightedMatches += 3;
      continue;
    }

    if (tagTokens.has(token)) {
      weightedMatches += 2;
      continue;
    }

    if (contentTokens.has(token)) {
      weightedMatches += 1;
    }
  }

  const maximumScore =
    queryTokens.length * 3;

  const relevance =
    maximumScore > 0
      ? weightedMatches / maximumScore
      : 0;

  const importanceBoost =
    memory.importance * 0.15;

  const accessBoost =
    Math.min(memory.accessCount, 20) *
    0.005;

  return {
    score: Math.min(
      1,
      relevance +
        importanceBoost +
        accessBoost,
    ),
    matchedTerms,
  };
}

export async function createMemory(
  input: CreateMemoryInput,
): Promise<MemoryRecord> {
  const userId = input.userId.trim();
  const title = input.title.trim();
  const content = input.content.trim();

  if (!userId) {
    throw new Error(
      "L'identifiant utilisateur est obligatoire.",
    );
  }

  if (title.length < 2) {
    throw new Error(
      "Le titre de la mémoire est trop court.",
    );
  }

  if (content.length < 2) {
    throw new Error(
      "Le contenu de la mémoire est trop court.",
    );
  }

  const store = await readStore();
  const now = new Date().toISOString();

  const memory: MemoryRecord = {
    id: randomUUID(),
    userId,
    kind: input.kind,
    title,
    content,
    tags: normalizeTags(input.tags),
    importance:
      clampImportance(input.importance),
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    metadata: input.metadata,
  };

  await writeStore({
    version: 1,
    memories: [
      ...store.memories,
      memory,
    ],
  });

  return memory;
}

export async function getMemory(
  memoryId: string,
  userId?: string,
): Promise<MemoryRecord | null> {
  const store = await readStore();

  const memory =
    store.memories.find(
      (candidate) =>
        candidate.id === memoryId &&
        (
          !userId ||
          candidate.userId === userId
        ),
    ) ?? null;

  return memory;
}

export async function listMemories(
  userId: string,
  limit = DEFAULT_LIMIT,
): Promise<ReadonlyArray<MemoryRecord>> {
  const normalizedUserId =
    userId.trim();

  if (!normalizedUserId) {
    return [];
  }

  return (await readStore())
    .memories
    .filter(
      (memory) =>
        memory.userId ===
        normalizedUserId,
    )
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(
          left.updatedAt,
        ),
    )
    .slice(0, normalizeLimit(limit));
}

export async function searchMemories(
  input: SearchMemoryInput,
): Promise<ReadonlyArray<MemorySearchResult>> {
  const userId = input.userId.trim();
  const queryTokens =
    tokenize(input.query);

  if (!userId) {
    return [];
  }

  const requestedKinds =
    input.kinds
      ? new Set(input.kinds)
      : null;

  const requestedTags =
    normalizeTags(input.tags);

  const minimumScore =
    Number.isFinite(input.minimumScore)
      ? Math.min(
          1,
          Math.max(
            0,
            input.minimumScore as number,
          ),
        )
      : 0.05;

  const store = await readStore();

  const results = store.memories
    .filter(
      (memory) =>
        memory.userId === userId,
    )
    .filter(
      (memory) =>
        !requestedKinds ||
        requestedKinds.has(memory.kind),
    )
    .filter(
      (memory) =>
        requestedTags.length === 0 ||
        requestedTags.every((tag) =>
          memory.tags.includes(tag),
        ),
    )
    .map((memory) => {
      const evaluation =
        calculateSearchScore(
          memory,
          queryTokens,
        );

      return {
        memory,
        score: evaluation.score,
        matchedTerms:
          evaluation.matchedTerms,
      };
    })
    .filter(
      (result) =>
        result.score >= minimumScore,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.memory.updatedAt.localeCompare(
          left.memory.updatedAt,
        ),
    )
    .slice(
      0,
      normalizeLimit(input.limit),
    );

  if (results.length > 0) {
    const accessedIds =
      new Set(
        results.map(
          (result) =>
            result.memory.id,
        ),
      );

    const accessedAt =
      new Date().toISOString();

    await writeStore({
      version: 1,
      memories: store.memories.map(
        (memory) =>
          accessedIds.has(memory.id)
            ? {
                ...memory,
                lastAccessedAt:
                  accessedAt,
                accessCount:
                  memory.accessCount + 1,
              }
            : memory,
      ),
    });
  }

  return results;
}

export async function updateMemory(
  memoryId: string,
  userId: string,
  input: UpdateMemoryInput,
): Promise<MemoryRecord | null> {
  const store = await readStore();

  const existing =
    store.memories.find(
      (memory) =>
        memory.id === memoryId &&
        memory.userId === userId,
    );

  if (!existing) {
    return null;
  }

  const updated: MemoryRecord = {
    ...existing,
    title:
      input.title !== undefined
        ? input.title.trim()
        : existing.title,
    content:
      input.content !== undefined
        ? input.content.trim()
        : existing.content,
    tags:
      input.tags !== undefined
        ? normalizeTags(input.tags)
        : existing.tags,
    importance:
      input.importance !== undefined
        ? clampImportance(
            input.importance,
          )
        : existing.importance,
    metadata:
      input.metadata !== undefined
        ? input.metadata
        : existing.metadata,
    updatedAt:
      new Date().toISOString(),
  };

  await writeStore({
    version: 1,
    memories: store.memories.map(
      (memory) =>
        memory.id === memoryId &&
        memory.userId === userId
          ? updated
          : memory,
    ),
  });

  return updated;
}

export async function deleteMemory(
  memoryId: string,
  userId: string,
): Promise<boolean> {
  const store = await readStore();

  const remaining =
    store.memories.filter(
      (memory) =>
        !(
          memory.id === memoryId &&
          memory.userId === userId
        ),
    );

  if (
    remaining.length ===
    store.memories.length
  ) {
    return false;
  }

  await writeStore({
    version: 1,
    memories: remaining,
  });

  return true;
}

export async function clearUserMemories(
  userId: string,
): Promise<number> {
  const store = await readStore();

  const remaining =
    store.memories.filter(
      (memory) =>
        memory.userId !== userId,
    );

  const deletedCount =
    store.memories.length -
    remaining.length;

  if (deletedCount > 0) {
    await writeStore({
      version: 1,
      memories: remaining,
    });
  }

  return deletedCount;
}
