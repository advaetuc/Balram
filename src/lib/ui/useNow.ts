"use client";

import { indiaDate } from "@/lib/domain/calendar";
import { useBalramStore } from "@/store/useBalramStore";

export function useNow(): { nowMs: number | null; todayIso: string | null } {
  const nowMs = useBalramStore((state) => state.now);
  return { nowMs, todayIso: indiaDate(nowMs) };
}
