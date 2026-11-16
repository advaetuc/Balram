import { z } from "zod";
import type { CheckIn } from "@/types/domain";

/** Returns false for SSR and malformed dates to avoid a premature reminder banner. */
export function isCheckInDue(checkIns: readonly CheckIn[], nowIso: string | null, cadenceDays: 7 | 30 = 7): boolean {
  if (nowIso === null || (cadenceDays !== 7 && cadenceDays !== 30)) return false;
  const today = nowIso.slice(0, 10);
  if (!z.string().date().safeParse(today).success) return false;
  if (checkIns.length === 0) return true;
  const latestDate = checkIns[0]?.date;
  if (!latestDate || !z.string().date().safeParse(latestDate).success) return false;
  const ageDays = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latestDate}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(ageDays) && ageDays >= cadenceDays;
}
