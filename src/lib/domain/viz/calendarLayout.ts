import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { LifecycleStageSchema, type CropAllocation, type LifecycleStage } from "@/types/domain";
import { detectMaharashtraSeason } from "../cropRecommendations";

interface CalendarSpan { startXPercent: number; endXPercent: number }
type CalendarStageBar = CalendarSpan & { stage: LifecycleStage; startDate: string; endDate: string };

const DAYS_MS = 86_400_000;
const monthX = (month: number) => month / 12 * 100;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function parseDate(iso: string | null) {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) && isoDate(date) === iso ? date : null;
}

function dateX(date: Date) {
  const nextMonth = new Date(date);
  nextMonth.setUTCMonth(date.getUTCMonth() + 1, 1);
  // Equal month columns, with each day spaced according to its actual month length.
  const daysInMonth = date.getUTCDate() - 1 + (nextMonth.getTime() - date.getTime()) / DAYS_MS;
  return monthX(date.getUTCMonth() + (date.getUTCDate() - 1) / daysInMonth);
}

function sowingSpans(start: number, end: number): CalendarSpan[] {
  if (end >= start) return [{ startXPercent: monthX(start), endXPercent: monthX(end + 1) }];
  return [
    { startXPercent: monthX(start), endXPercent: 100 },
    { startXPercent: 0, endXPercent: monthX(end + 1) },
  ];
}

export function buildCropCalendar({ allocations, todayIso }: {
  allocations: readonly CropAllocation[];
  todayIso: string | null;
}) {
  const today = parseDate(todayIso);
  const months = Array.from({ length: 12 }, (_, monthZeroIndexed) => ({
    monthZeroIndexed, season: detectMaharashtraSeason(monthZeroIndexed),
    startXPercent: monthX(monthZeroIndexed), endXPercent: monthX(monthZeroIndexed + 1),
  }));

  const plots = allocations.map((allocation) => {
    const crop = Object.hasOwn(MaharashtraCropMatrix, allocation.cropId)
      ? MaharashtraCropMatrix[allocation.cropId as CropId] : undefined;
    const sowingWindows = Object.entries(crop?.sowingWindows ?? {}).flatMap(([season, [start, end]]) =>
      sowingSpans(start, end).map((span) => ({ season, ...span })));
    const stageBars: CalendarStageBar[] = [];
    const plantingDate = parseDate(allocation.plantingDate);
    let harvest: { date: string; xPercent: number } | null = null;
    if (plantingDate && crop) {
      let date = plantingDate;
      for (const stage of LifecycleStageSchema.options) {
        const end = new Date(date.getTime() + crop.phaseWeeks[stage] * 7 * DAYS_MS);
        const yearBoundary = new Date(date);
        yearBoundary.setUTCMonth(12, 1);
        if (end >= yearBoundary) {
          stageBars.push({
            stage, startDate: isoDate(date), endDate: isoDate(yearBoundary),
            startXPercent: dateX(date), endXPercent: 100,
          });
          date = yearBoundary;
        }
        if (date < end) {
          stageBars.push({
            stage, startDate: isoDate(date), endDate: isoDate(end),
            startXPercent: dateX(date), endXPercent: dateX(end),
          });
        }
        date = end;
      }
      harvest = { date: isoDate(date), xPercent: dateX(date) };
    }
    return {
      plotId: allocation.plotId ?? null, cropId: allocation.cropId, sowingWindows, stageBars, harvest,
    };
  });

  return { months, plots, todayXPercent: today ? dateX(today) : null };
}
