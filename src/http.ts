import {
  APIConnectionError,
  APITimeoutError,
  errorForStatus,
  type APIErrorBody,
} from "./error.js";

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  defaultHeaders: Record<string, string>;
}

export interface RequestOptions {
  path: string;
  method?: string;
  body?: unknown;
  timeout?: number;
  extraHeaders?: Record<string, string>;
  responseType?: "json" | "binary";
}

export interface RawResponse {
  status: number;
  headers: Headers;
  requestId?: string;
  json?: unknown;
  bytes?: Uint8Array;
  contentType: string;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function jitterBackoff(attempt: number): number {
  const base = Math.min(0.5 * 2 ** attempt, 8);
  return (base / 2 + Math.random() * (base / 2)) * 1000;
}

function debugLog(...args: unknown[]): void {
  if (process.env.RUMIK_LOG === "debug") {
    console.error("[rumik-ai]", ...args);
  }
}

export function HttpClient(options: HttpClientOptions) {
  async function request(opts: RequestOptions): Promise<RawResponse> {
    const url = new URL(opts.path, options.baseUrl).toString();
    const method = opts.method ?? "POST";

    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...options.defaultHeaders,
      ...opts.extraHeaders,
    };

    const timeoutMs = opts.timeout ?? options.timeout;
    const maxRetries = options.maxRetries;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        debugLog(method, url, attempt > 0 ? `(retry ${attempt})` : "");

        const res = await fetch(url, {
          method,
          headers,
          body:
            opts.body !== undefined
              ? JSON.stringify(opts.body)
              : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        const requestId =
          res.headers.get("x-request-id") ?? undefined;

        if (!res.ok) {
          const retryAfterHeader = res.headers.get("retry-after");
          const retryAfter = retryAfterHeader
            ? Number(retryAfterHeader)
            : undefined;

          let body: APIErrorBody = {};

          try {
            body = (await res.json()) as APIErrorBody;
          } catch {
            body = {};
          }

          const message =
            body.error ?? `Request failed with status ${res.status}`;

          const err = errorForStatus(res.status, message, {
            code: body.code,
            requestId,
            response: body,
            retryAfter,
          });

          if (
            RETRYABLE_STATUS.has(res.status) &&
            attempt < maxRetries
          ) {
            const waitMs = retryAfter
              ? retryAfter * 1000
              : jitterBackoff(attempt);

            debugLog(
              `status ${res.status}, retrying in ${Math.round(waitMs)}ms`,
            );

            await sleep(waitMs);
            lastError = err;
            continue;
          }

          throw err;
        }

        const contentType = res.headers.get("content-type") ?? "";

        if (opts.responseType === "binary") {
          const bytes = new Uint8Array(await res.arrayBuffer());

          return {
            status: res.status,
            headers: res.headers,
            requestId,
            bytes,
            contentType,
          };
        }

        const json = await res.json();

        return {
          status: res.status,
          headers: res.headers,
          requestId,
          json,
          contentType,
        };
      } catch (err) {
        clearTimeout(timer);

        if (isAbortError(err)) {
          const timeoutErr = APITimeoutError(
            `Request timed out after ${timeoutMs}ms.`,
            err,
          );

          if (attempt < maxRetries) {
            const waitMs = jitterBackoff(attempt);

            debugLog(
              `timeout, retrying in ${Math.round(waitMs)}ms`,
            );

            await sleep(waitMs);
            lastError = timeoutErr;
            continue;
          }

          throw timeoutErr;
        }

        if (err instanceof Error && isNetworkError(err)) {
          const connErr = APIConnectionError(err.message, err);

          if (attempt < maxRetries) {
            const waitMs = jitterBackoff(attempt);

            debugLog(
              `connection error, retrying in ${Math.round(waitMs)}ms`,
            );

            await sleep(waitMs);
            lastError = connErr;
            continue;
          }

          throw connErr;
        }

        throw err;
      }
    }

    throw lastError ?? APIConnectionError("Request failed after retries.");
  }

  return {
    get baseUrl(): string {
      return options.baseUrl;
    },

    get apiKey(): string {
      return options.apiKey;
    },

    request,
  };
}

export type HttpClient = ReturnType<typeof HttpClient>;

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function isNetworkError(err: Error): boolean {
  return (
    err.name === "TypeError" ||
    /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(err.message)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}