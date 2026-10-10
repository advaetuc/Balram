import { z } from "zod";
import { COORDINATE_DECIMALS, hasSingleProviderAuthority, PROVIDER_LIMITS, type ProviderName } from "@/config/providers";
import { CoordinateSchema, type Coordinate } from "@/types/domain";
import { sourceFor, type ApiFailure, type ApiSuccess } from "@/types/api";
import { abortable, ApiError, delay, readJson, throwIfAborted } from "./http";

type Pending = { controller: AbortController; promise: Promise<ApiSuccess<unknown>>; users: number };
interface Authority {
  next: Map<string, number>;
  cache: Map<string, ApiSuccess<unknown>>;
  pending: Map<string, Pending>;
}
const scope = globalThis as typeof globalThis & { __balramProvidersV1?: Authority };
const authority = scope.__balramProvidersV1 ??= { next: new Map(), cache: new Map(), pending: new Map() };

export const LocationInputSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export function queryCoordinate(input: z.infer<typeof LocationInputSchema>): Coordinate {
  const { latitude, longitude } = LocationInputSchema.parse(input);
  return CoordinateSchema.parse([Number(longitude.toFixed(COORDINATE_DECIMALS)), Number(latitude.toFixed(COORDINATE_DECIMALS))]);
}

export async function acquireProviderSlot(provider: keyof typeof PROVIDER_LIMITS, signal: AbortSignal): Promise<void> {
  if (!hasSingleProviderAuthority()) {
    throw new ApiError("CONFIGURATION", "This provider requires a single application-wide request authority. Distributed/serverless access is disabled.", 503);
  }
  const interval = PROVIDER_LIMITS[provider];
  if (!authority.next.has(provider)) authority.next.set(provider, Date.now() + (provider === "nominatim" ? interval : 0));
  for (;;) {
    throwIfAborted(signal);
    const wait = (authority.next.get(provider) ?? 0) - Date.now();
    if (wait <= 0) { authority.next.set(provider, Date.now() + interval); return; }
    if (wait > 2000) throw new ApiError("RATE_LIMITED", "The provider request limit has been reached. Submit again later.", 429, Math.ceil(wait / 1000));
    await delay(wait, signal);
  }
}

/** Bounded cache of rounded provider queries; individual callers may cancel without cancelling others. */
export async function cachedRequest<T>(provider: ProviderName, parameters: unknown, signal: AbortSignal | undefined,
  load: (signal: AbortSignal) => Promise<ApiSuccess<T>>): Promise<ApiSuccess<T>> {
  throwIfAborted(signal);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([provider, parameters])));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  throwIfAborted(signal);
  const hit = authority.cache.get(key);
  if (hit && Date.parse(hit.expiresAt) > Date.now()) return structuredClone({ ...hit, cached: true }) as ApiSuccess<T>;
  authority.cache.delete(key);
  let pending = authority.pending.get(key);
  if (pending?.controller.signal.aborted) { authority.pending.delete(key); pending = undefined; }
  if (!pending) {
    if (authority.pending.size >= 32) throw new ApiError("RATE_LIMITED", "The service is busy. Try again shortly.", 429, 5);
    const controller = new AbortController();
    const entry: Pending = { controller, users: 0, promise: Promise.resolve().then(() => load(controller.signal)).then((result) => {
      if (!controller.signal.aborted && Date.parse(result.expiresAt) > Date.now()) {
        if (authority.cache.size >= 128) authority.cache.delete(authority.cache.keys().next().value!);
        authority.cache.set(key, result);
      }
      return result;
    }).finally(() => { if (authority.pending.get(key) === entry) authority.pending.delete(key); }) };
    pending = entry;
    authority.pending.set(key, entry);
  }
  pending.users++;
  try { return structuredClone(await abortable(pending.promise, signal)) as ApiSuccess<T>; }
  finally {
    pending.users--;
    if (pending.users === 0 && authority.pending.get(key) === pending) pending.controller.abort();
  }
}

// Responses may contain field IDs/centers. Never use public SWR or CDN storage here.
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
};

export function errorResponse(provider: ProviderName, error: unknown): Response {
  const failure = error instanceof ApiError ? error : error instanceof z.ZodError
    ? new ApiError("SCHEMA", "The provider returned unsupported data.")
    : new ApiError("INTERNAL", "The request could not be completed.", 500);
  const body: ApiFailure = { ok: false, source: sourceFor(provider), fetchedAt: new Date().toISOString(), validAt: null, data: null,
    error: { code: failure.code, message: failure.message, ...(failure.retryAfterSeconds === undefined
      ? {} : { retryAfterSeconds: failure.retryAfterSeconds }) } };
  const status = failure.code === "HTTP" ? (failure.status === 429 ? 429 : 502) : failure.status;
  return Response.json(body, { status, headers: { ...privateHeaders,
    ...(failure.retryAfterSeconds === undefined ? {} : { "Retry-After": String(Math.ceil(failure.retryAfterSeconds)) }) } });
}

/** POST bodies keep precise inputs out of URL/access logs. Intent must originate from an explicit submit action. */
export async function providerRoute<T>(request: Request, provider: ProviderName, schema: z.ZodType<T>,
  action: (input: T, signal: AbortSignal) => Promise<ApiSuccess<unknown>>): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) cancel();
  const timer = setTimeout(cancel, 45_000);
  try {
    const url = new URL(request.url);
    if (url.search || request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.get("origin") && request.headers.get("origin") !== url.origin)) {
      throw new ApiError("INVALID_INPUT", "Use a same-origin form submission with a JSON body.", 400);
    }
    let input: T;
    try { input = schema.parse(await readJson(request, 4096, controller.signal)); }
    catch (error) {
      if (error instanceof ApiError && ["ABORTED", "TOO_LARGE"].includes(error.code)) throw error;
      throw new ApiError("INVALID_INPUT", "Invalid request body.", 400);
    }
    return Response.json(await action(input, controller.signal), { headers: privateHeaders });
  } catch (error) { return errorResponse(provider, error); }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); }
}

export function submitOnly(provider: ProviderName): Response {
  const response = errorResponse(provider, new ApiError("METHOD_NOT_ALLOWED", "Use an explicit POST submission; automatic search is not supported.", 405));
  response.headers.set("Allow", "POST");
  return response;
}
