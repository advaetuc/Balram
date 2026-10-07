import { z } from "zod";
import type { ApiErrorCode } from "@/types/api";

export class ApiError extends Error {
  constructor(public readonly code: ApiErrorCode, message: string, public readonly status = 502,
    public readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ApiError("ABORTED", "The request was cancelled.", 499);
}

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new ApiError("ABORTED", "The request was cancelled.", 499)); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    // Attach handlers even for an already-aborted signal to consume a late rejection.
    promise.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await abortable(new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); }), signal); }
  finally { clearTimeout(timer); }
}

/** Limits decompressed bytes as well as Content-Length; never includes payloads or URLs in errors. */
export async function readJson(response: Response | Request, maxBytes: number, signal?: AbortSignal): Promise<unknown> {
  const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mime !== "application/json" && !mime?.endsWith("+json")) {
    throw new ApiError("CONTENT_TYPE", "Expected a JSON response.");
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new ApiError("TOO_LARGE", "JSON payload exceeds the size limit.", 413);
  if (!response.body) throw new ApiError("INVALID_JSON", "JSON body is missing.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;
  try {
    for (;;) {
      throwIfAborted(signal);
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await abortable(reader.read(), signal); }
      catch (error) {
        if (error instanceof TypeError) throw new ApiError("NETWORK", "The response stream was interrupted.");
        throw error;
      }
      const { done, value } = chunk;
      if (done) { finished = true; break; }
      total += value.byteLength;
      if (total > maxBytes) throw new ApiError("TOO_LARGE", "JSON payload exceeds the size limit.", 413);
      chunks.push(value);
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError("INVALID_JSON", "The response contains invalid JSON."); }
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (timestamp - Date.now()) / 1000) : undefined;
}

export interface HttpOptions<T> {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  allowedOrigins: readonly string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: 0 | 1 | 2;
  headers?: HeadersInit;
  /** Called immediately before EACH GET attempt, including retries. */
  beforeAttempt?: (signal: AbortSignal) => Promise<void>;
  fetcher?: typeof fetch;
  onCachePolicy?: (ttlMs: number | null) => void;
}

/** Read-only GET client. Invalid JSON/schema/4xx and caller cancellation are never retried. */
export async function fetchJson<T>(input: URL, options: HttpOptions<T>): Promise<T> {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || !options.allowedOrigins.includes(url.origin)) {
    throw new ApiError("INVALID_INPUT", "The upstream host is not allowed.", 400);
  }
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 1_000_000;
  if (![0, 1, 2].includes(retries) || !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new ApiError("INVALID_INPUT", "Invalid HTTP limits.", 400);

  for (let attempt = 0; ; attempt++) {
    throwIfAborted(options.signal);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let failure: ApiError;
    let response: Response | undefined;
    try {
      await abortable(Promise.resolve(options.beforeAttempt?.(controller.signal)), controller.signal);
      throwIfAborted(controller.signal);
      try {
        response = await abortable((options.fetcher ?? fetch)(url, {
          method: "GET", signal: controller.signal, redirect: "manual", cache: "no-store",
          headers: { Accept: "application/json", ...Object.fromEntries(new Headers(options.headers)) },
        }), controller.signal);
      } catch (error) {
        if (error instanceof TypeError) throw new ApiError("NETWORK", "The provider could not be reached.");
        throw error;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw new ApiError("HTTP", "The upstream service returned an error.", response.status, retryAfter(response.headers.get("retry-after")));
      }
      const body = await readJson(response, maxBytes, controller.signal);
      const parsed = options.schema.safeParse(body);
      if (!parsed.success) throw new ApiError("SCHEMA", "The provider response does not match its data contract.");
      const policy = response.headers.get("cache-control") ?? "";
      const maxAge = /(?:^|,)\s*s-maxage=(\d+)/i.exec(policy) ?? /(?:^|,)\s*max-age=(\d+)/i.exec(policy);
      const age = Math.max(0, Number(response.headers.get("age")) || 0);
      options.onCachePolicy?.(/(?:no-store|no-cache|private)/i.test(policy) || response.headers.get("vary") === "*"
        ? 0 : maxAge ? Math.max(0, Number(maxAge[1]) - age) * 1000 : null);
      return parsed.data;
    } catch (error) {
      if (options.signal?.aborted) throw new ApiError("ABORTED", "The request was cancelled.", 499);
      if (timedOut) throw new ApiError("TIMEOUT", "The provider request timed out.", 504);
      failure = error instanceof ApiError ? error : new ApiError("INTERNAL", "The provider request could not be completed.");
    } finally {
      clearTimeout(timer);
      if (response?.body && !response.bodyUsed) void response.body.cancel().catch(() => undefined);
      options.signal?.removeEventListener("abort", cancel);
    }
    const retryable = failure.code === "NETWORK" || (failure.code === "HTTP" &&
      (failure.status === 429 || (failure.status >= 500 && failure.status <= 599)));
    if (!retryable || attempt >= retries) throw failure;
    const wait = Math.max((failure.retryAfterSeconds ?? 0) * 1000, (250 * 2 ** attempt) * (0.5 + Math.random() / 2));
    // Refuse an excessive wait instead of retrying before the provider's requested deadline.
    if (!Number.isFinite(wait) || wait > 5000) throw failure;
    await delay(wait, options.signal);
  }
}
