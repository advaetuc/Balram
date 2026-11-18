import type { BalramState } from "@/store/useBalramStore";
import { indiaDate } from "@/lib/domain/calendar";
import { resolveDailyEt0 } from "@/lib/domain/irrigation";
import type { Locale } from "@/types/domain";
export { indiaDate } from "@/lib/domain/calendar";

export function formatNumber(value: number | null | undefined, digits = 1, locale: Locale = "en"): string {
  return value == null || !Number.isFinite(value) ? (locale === "mr" ? "उपलब्ध नाही" : "Not available") : new Intl.NumberFormat(locale === "mr" ? "mr-IN" : "en-IN", { maximumFractionDigits: digits }).format(value);
}
export function formatTime(value: string | null | undefined, locale: Locale = "en"): string {
  if (!value || !Number.isFinite(Date.parse(value))) return locale === "mr" ? "दिलेले नाही" : "Not provided";
  return new Intl.DateTimeFormat(locale === "mr" ? "mr-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST";
}
export function selectedWeatherDay(state: BalramState) {
  if (state.sampleDataActive) return state.weatherSnapshot?.daily[0] ?? null;
  return state.weatherSnapshot?.daily.find((day) => day.date === indiaDate(state.now)) ?? state.weatherSnapshot?.daily[0] ?? null;
}
export function resolvedWeatherMetrics(state: BalramState) {
  const day = selectedWeatherDay(state);
  const latitude = state.fieldGeometry?.center[1] ?? 18.5204;
  const resolvedEt0 = resolveDailyEt0(day, latitude, state.weatherSnapshot?.source);
  const et0IsPositive = resolvedEt0 !== null && Number.isFinite(resolvedEt0.et0MmPerDay) && resolvedEt0.et0MmPerDay > 0;
  return {
    date: day?.date ?? indiaDate(state.now) ?? "2026-10-01",
    et0MmPerDay: et0IsPositive ? resolvedEt0.et0MmPerDay : 4.5,
    et0Provenance: et0IsPositive ? resolvedEt0.provenance : "maharashtra-baseline" as const,
    precipitationMm: day?.precipitation ?? 0,
    temperatureMinC: day?.temperatureMin ?? 19,
    temperatureMaxC: day?.temperatureMax ?? 31,
    hasSnapshot: state.weatherSnapshot !== null,
  };
}
export function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
