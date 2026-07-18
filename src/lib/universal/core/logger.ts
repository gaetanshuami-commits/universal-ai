import { universalConfig } from "./config";

import type {
  UniversalLogLevel,
  UniversalMetadata,
} from "./types";

const LOG_LEVEL_PRIORITY: Record<
  UniversalLogLevel,
  number
> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

interface UniversalLogEntry {
  readonly timestamp: string;
  readonly level: UniversalLogLevel;
  readonly service: string;
  readonly message: string;
  readonly metadata?: UniversalMetadata;
}

function shouldLog(level: UniversalLogLevel): boolean {
  return (
    LOG_LEVEL_PRIORITY[level] >=
    LOG_LEVEL_PRIORITY[universalConfig.logLevel]
  );
}

function createEntry(
  level: UniversalLogLevel,
  service: string,
  message: string,
  metadata?: UniversalMetadata,
): UniversalLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    service,
    message,
    ...(metadata ? { metadata } : {}),
  };
}

function writeEntry(entry: UniversalLogEntry): void {
  const serialized = JSON.stringify(entry);

  switch (entry.level) {
    case "debug":
      console.debug(serialized);
      break;

    case "info":
      console.info(serialized);
      break;

    case "warn":
      console.warn(serialized);
      break;

    case "error":
      console.error(serialized);
      break;
  }
}

export class UniversalLogger {
  public constructor(
    private readonly service: string,
  ) {}

  public debug(
    message: string,
    metadata?: UniversalMetadata,
  ): void {
    this.write("debug", message, metadata);
  }

  public info(
    message: string,
    metadata?: UniversalMetadata,
  ): void {
    this.write("info", message, metadata);
  }

  public warn(
    message: string,
    metadata?: UniversalMetadata,
  ): void {
    this.write("warn", message, metadata);
  }

  public error(
    message: string,
    metadata?: UniversalMetadata,
  ): void {
    this.write("error", message, metadata);
  }

  private write(
    level: UniversalLogLevel,
    message: string,
    metadata?: UniversalMetadata,
  ): void {
    if (!shouldLog(level)) {
      return;
    }

    writeEntry(
      createEntry(
        level,
        this.service,
        message,
        metadata,
      ),
    );
  }
}

export function createUniversalLogger(
  service: string,
): UniversalLogger {
  return new UniversalLogger(service);
}
