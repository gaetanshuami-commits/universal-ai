import { createUniversalLogger } from "./logger";

import type { UniversalMetadata } from "./types";

export interface UniversalEvent<
  TPayload = UniversalMetadata,
> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
  readonly source: string;
}

export type UniversalEventHandler<
  TPayload = UniversalMetadata,
> = (
  event: UniversalEvent<TPayload>,
) => void | Promise<void>;

interface UniversalSubscription {
  readonly unsubscribe: () => void;
}

const logger = createUniversalLogger(
  "universal-event-bus",
);

export class UniversalEventBus {
  private readonly handlers = new Map<
    string,
    Set<UniversalEventHandler<unknown>>
  >();

  public subscribe<TPayload>(
    eventType: string,
    handler: UniversalEventHandler<TPayload>,
  ): UniversalSubscription {
    const currentHandlers =
      this.handlers.get(eventType) ??
      new Set<UniversalEventHandler<unknown>>();

    currentHandlers.add(
      handler as UniversalEventHandler<unknown>,
    );

    this.handlers.set(eventType, currentHandlers);

    return {
      unsubscribe: () => {
        currentHandlers.delete(
          handler as UniversalEventHandler<unknown>,
        );

        if (currentHandlers.size === 0) {
          this.handlers.delete(eventType);
        }
      },
    };
  }

  public async publish<TPayload>(
    event: UniversalEvent<TPayload>,
  ): Promise<void> {
    const handlers = [
      ...(this.handlers.get(event.type) ?? []),
      ...(this.handlers.get("*") ?? []),
    ];

    if (handlers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      handlers.map((handler) =>
        handler(
          event as UniversalEvent<unknown>,
        ),
      ),
    );

    const rejected = results.filter(
      (
        result,
      ): result is PromiseRejectedResult =>
        result.status === "rejected",
    );

    if (rejected.length > 0) {
      logger.error(
        "One or more event handlers failed.",
        {
          eventType: event.type,
          failedHandlers: rejected.length,
        },
      );
    }
  }

  public listenerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }

  public clear(): void {
    this.handlers.clear();
  }
}

export const universalEventBus =
  new UniversalEventBus();

export function createUniversalEvent<
  TPayload,
>(
  type: string,
  payload: TPayload,
  source: string,
): UniversalEvent<TPayload> {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    source,
    occurredAt: new Date(),
  };
}
