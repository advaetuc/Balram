import { z } from "zod";
import { PROVIDERS, type ProviderName } from "@/config/providers";

export const ApiSourceSchema = z.object({
  id: z.string(), name: z.string(), url: z.string().url(), attribution: z.string(),
  provenance: z.enum(["modelled", "reported"]),
});
export type ApiSource = z.infer<typeof ApiSourceSchema>;
export const ApiErrorCodeSchema = z.enum([
  "INVALID_INPUT", "ABORTED", "TIMEOUT", "NETWORK", "HTTP", "CONTENT_TYPE", "INVALID_JSON",
  "SCHEMA", "TOO_LARGE", "RATE_LIMITED", "CONFIGURATION", "DISABLED", "METHOD_NOT_ALLOWED", "INTERNAL",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export interface ApiSuccess<T> {
  ok: true;
  source: ApiSource;
  fetchedAt: string;
  validAt: string | null;
  expiresAt: string;
  data: T;
  cached: boolean;
  warnings: string[];
}
export interface ApiFailure {
  ok: false;
  source: ApiSource;
  fetchedAt: string;
  validAt: null;
  data: null;
  error: { code: ApiErrorCode; message: string; retryAfterSeconds?: number };
}
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function apiResultSchema<T extends z.ZodTypeAny>(schema: T) {
  const base = { source: ApiSourceSchema, fetchedAt: z.string().datetime({ offset: true }) };
  return z.discriminatedUnion("ok", [
    z.object({ ...base, ok: z.literal(true), validAt: z.string().datetime({ offset: true }).nullable(),
      expiresAt: z.string().datetime({ offset: true }), data: schema, cached: z.boolean(), warnings: z.array(z.string()) }),
    z.object({ ...base, ok: z.literal(false), validAt: z.null(), data: z.null(),
      error: z.object({ code: ApiErrorCodeSchema, message: z.string(), retryAfterSeconds: z.number().nonnegative().optional() }) }),
  ]);
}

export function sourceFor(provider: ProviderName): ApiSource {
  const { id, name, url, attribution, provenance } = PROVIDERS[provider];
  return { id, name, url, attribution, provenance };
}

export function success<T>(provider: ProviderName, data: T, validAt: string | null,
  warnings: string[] = [], fetchedAt = new Date().toISOString()): ApiSuccess<T> {
  return { ok: true, source: sourceFor(provider), fetchedAt, validAt, data, cached: false, warnings,
    expiresAt: new Date(Date.parse(fetchedAt) + PROVIDERS[provider].ttlMs).toISOString() };
}
