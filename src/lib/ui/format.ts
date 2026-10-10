import type { BalramState } from "@/store/useBalramStore";

export function formatNumber(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "Not available" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(value);
}
export function formatTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not provided";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST";
}
export function indiaDate(now: number | null): string | null {
  if (now === null) return null;
  return new Date(now + 19800_000).toISOString().slice(0, 10);
}
export function selectedWeatherDay(state: BalramState) {
  if (state.sampleDataActive) return state.weatherSnapshot?.daily[0] ?? null;
  return state.weatherSnapshot?.daily.find((day) => day.date === indiaDate(state.now)) ?? null;
}
export function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
