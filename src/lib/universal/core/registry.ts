import { UniversalError } from "./errors";

export interface UniversalRegistryEntry<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly registeredAt: Date;
}

export class UniversalRegistry<TValue> {
  private readonly entries =
    new Map<string, UniversalRegistryEntry<TValue>>();

  public register(
    id: string,
    value: TValue,
    options?: {
      readonly replace?: boolean;
    },
  ): UniversalRegistryEntry<TValue> {
    const normalizedId = id.trim();

    if (!normalizedId) {
      throw new UniversalError({
        code: "VALIDATION_ERROR",
        message: "Registry entry ID cannot be empty.",
        statusCode: 400,
      });
    }

    if (
      this.entries.has(normalizedId) &&
      !options?.replace
    ) {
      throw new UniversalError({
        code: "CONFLICT",
        message:
          `Registry entry "${normalizedId}" already exists.`,
        statusCode: 409,
      });
    }

    const entry: UniversalRegistryEntry<TValue> = {
      id: normalizedId,
      value,
      registeredAt: new Date(),
    };

    this.entries.set(normalizedId, entry);

    return entry;
  }

  public get(id: string): TValue | undefined {
    return this.entries.get(id)?.value;
  }

  public require(id: string): TValue {
    const value = this.get(id);

    if (value === undefined) {
      throw new UniversalError({
        code: "NOT_FOUND",
        message:
          `Registry entry "${id}" was not found.`,
        statusCode: 404,
      });
    }

    return value;
  }

  public has(id: string): boolean {
    return this.entries.has(id);
  }

  public remove(id: string): boolean {
    return this.entries.delete(id);
  }

  public list(): ReadonlyArray<
    UniversalRegistryEntry<TValue>
  > {
    return Array.from(this.entries.values());
  }

  public size(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }
}
