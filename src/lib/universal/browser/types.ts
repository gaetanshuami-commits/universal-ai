export type BrowserAction =
  | "goto"
  | "click"
  | "fill"
  | "select"
  | "press"
  | "wait"
  | "scroll"
  | "extract"
  | "screenshot";

export interface BrowserStep {
  readonly id: string;
  readonly action: BrowserAction;
  readonly selector?: string;
  readonly value?: string;
  readonly timeoutMs?: number;
}

export interface BrowserExecutionResult {
  readonly success: boolean;
  readonly action: BrowserAction;
  readonly durationMs: number;
  readonly output?: string;
  readonly error?: string;
}

export interface BrowserPlan {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly createdAt: string;
  readonly steps: ReadonlyArray<BrowserStep>;
}
