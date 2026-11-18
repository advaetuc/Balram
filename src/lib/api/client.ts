import { z } from "zod";
import { apiResultSchema, type ApiErrorCode, type ApiResult, type ApiSuccess } from "@/types/api";
import { abortable, ApiError, readJson } from "./http";
import type { Locale } from "@/types/domain";

export async function submitProvider<T extends z.ZodTypeAny>(path: "/api/weather" | "/api/soil", body: unknown,
  schema: T, signal: AbortSignal): Promise<ApiSuccess<z.output<T>>> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 47_000);
  try {
    const response = await abortable(fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal, cache: "no-store", credentials: "same-origin" }), controller.signal);
    const result = apiResultSchema(schema).safeParse(await readJson(response, 1_000_000, controller.signal));
    if (!result.success) throw new ApiError("SCHEMA", "Unsupported provider response.");
    const payload = result.data as ApiResult<z.output<T>>;
    if (!payload.ok) throw new ApiError(payload.error.code, payload.error.message, response.status,
      payload.error.retryAfterSeconds);
    if (!response.ok) throw new ApiError("HTTP", "The service is unavailable.", response.status);
    return payload;
  } catch (error) {
    if (signal.aborted) throw new ApiError("ABORTED", "Request cancelled.", 499);
    if (timedOut) throw new ApiError("TIMEOUT", "The request timed out.", 504);
    if (error instanceof ApiError) throw error;
    throw new ApiError("NETWORK", "Check your connection and try again.");
  } finally { clearTimeout(timer); signal.removeEventListener("abort", cancel); }
}

export function providerErrorMessage(error: unknown, name: string, locale: Locale = "en"): string {
  const code: ApiErrorCode = error instanceof ApiError ? error.code : "INTERNAL";
  if (locale === "mr") {
    const service = name === "Weather" ? "हवामानाचा अंदाज" : name === "Soil" ? "मातीची सेवा" : "सेवा";
    if (code === "TIMEOUT") return `${service} मिळण्यास विलंब झाला. जतन केलेली माहिती बदललेली नाही. तयार असाल तेव्हा पुन्हा प्रयत्न करा.`;
    if (code === "CONFIGURATION" || code === "DISABLED") return `या आवृत्तीत ${service} उपलब्ध नाही. शेत नियोजन वापरता येईल.`;
    if (code === "RATE_LIMITED" || (error instanceof ApiError && error.status === 429)) return `${service} सध्या व्यस्त आहे. ${error instanceof ApiError ? error.retryAfterSeconds ?? 15 : 15} सेकंदांनी पुन्हा प्रयत्न करा.`;
    if (code === "SCHEMA" || code === "INVALID_JSON" || code === "CONTENT_TYPE") return `${service} कडून अपूर्ण किंवा असमर्थित माहिती मिळाली. जतन केलेली माहिती बदललेली नाही.`;
    if (code === "NETWORK") return `${service} शी संपर्क झाला नाही. जोडणी तपासा; जतन केलेली माहिती बदललेली नाही.`;
    return `${service} अद्ययावत करता आली नाही. इतर नियोजन साधने उपलब्ध आहेत.`;
  }
  if (code === "TIMEOUT") return `${name} timed out. Saved data is unchanged. You can retry when ready.`;
  if (code === "CONFIGURATION" || code === "DISABLED") return `${name} is unavailable on this deployment. Your farm plan is still usable.`;
  if (code === "RATE_LIMITED" || (error instanceof ApiError && error.status === 429)) {
    return `${name} is busy. Wait ${error instanceof ApiError ? error.retryAfterSeconds ?? 15 : 15} seconds before retrying.`;
  }
  if (code === "SCHEMA" || code === "INVALID_JSON" || code === "CONTENT_TYPE") return `${name} returned incomplete or unsupported data. Saved values are unchanged.`;
  if (code === "NETWORK") return `${name} could not be reached. Check your connection; saved values are unchanged.`;
  return `${name} could not be updated. Your other planning tools remain available.`;
}
