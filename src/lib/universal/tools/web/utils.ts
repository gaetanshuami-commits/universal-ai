export const WEB_SEARCH_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_RESULTS = 6;
export const MAX_MAX_RESULTS = 10;
export const MAX_QUERY_LENGTH = 400;

export function clampMaxResults(value: number | undefined): number {
  const normalized = Number.isFinite(value)
    ? Math.trunc(value ?? DEFAULT_MAX_RESULTS)
    : DEFAULT_MAX_RESULTS;

  return Math.min(MAX_MAX_RESULTS, Math.max(1, normalized));
}

export function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs = WEB_SEARCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

export function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
