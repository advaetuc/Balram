/** Maharashtra-local date derived without reading browser globals during render. */
export function indiaDate(now: number | null): string | null {
  if (now === null || !Number.isFinite(now)) return null;
  return new Date(now + 19_800_000).toISOString().slice(0, 10);
}
