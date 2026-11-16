import { CropAllocationsSchema, type PersistedFarm } from "@/types/domain";
import { SQUARE_METRES_PER_GUNTHA } from "./geometry";

export type JourneyStationId = "land" | "weather" | "soil" | "crops" | "advice" | "roadmap";
export type JourneyStationStatus = "done" | "current" | "ready" | "skipped" | "locked" | "needs_update";
export interface JourneyStation { readonly id: JourneyStationId; readonly status: JourneyStationStatus }

function weatherIsStale(state: PersistedFarm, nowIso: string | null): boolean {
  const snapshot = state.weatherSnapshot;
  if (!snapshot) return true;
  if (nowIso === null) return false;
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return true;
  return now >= Date.parse(snapshot.expiresAt) || now >= Date.parse(snapshot.validTo) || now < Date.parse(snapshot.fetchedAt);
}

function hasValidCropPlan(state: PersistedFarm): boolean {
  const parsed = CropAllocationsSchema.safeParse(state.cropAllocations);
  if (!parsed.success || parsed.data.length === 0) return false;
  const withArea = parsed.data.filter((plot) => plot.areaGunthas !== null && plot.areaGunthas !== undefined && Number.isFinite(plot.areaGunthas) && plot.areaGunthas > 0);
  if (!withArea.length) return parsed.data.some((plot) => plot.plotId !== undefined && plot.percentage > 0);
  const totalFarmGunthas = state.fieldGeometry?.areaSquareMetres === null || state.fieldGeometry?.areaSquareMetres === undefined
    ? null
    : state.fieldGeometry.areaSquareMetres / SQUARE_METRES_PER_GUNTHA;
  const assigned = withArea.reduce((sum, plot) => sum + (plot.areaGunthas ?? 0), 0);
  return totalFarmGunthas === null || assigned <= totalFarmGunthas + 1e-8;
}

/** Derives the six setup stations from saved data without consulting browser or wall-clock state. */
export function deriveJourney(state: PersistedFarm, nowIso: string | null): readonly JourneyStation[] {
  const landDone = state.fieldGeometry !== null;
  const weatherStale = weatherIsStale(state, nowIso);
  const soilHandled = state.soilKitReading !== null || state.soilSkipped;
  const cropsDone = hasValidCropPlan(state);
  const adviceLocked = !landDone || !cropsDone;
  const statuses: Record<JourneyStationId, JourneyStationStatus> = {
    land: landDone ? "done" : "current",
    weather: !landDone ? "locked" : weatherStale ? "needs_update" : "done",
    soil: !landDone ? "locked" : state.soilKitReading ? "done" : state.soilSkipped ? "skipped" : "current",
    crops: !landDone ? "locked" : cropsDone ? "done" : soilHandled ? "current" : "ready",
    advice: adviceLocked ? "locked" : weatherStale ? "needs_update" : "ready",
    roadmap: !landDone || !cropsDone ? "locked" : state.setupCompletedAt && weatherStale ? "needs_update" : state.setupCompletedAt ? "done" : "ready",
  };
  return (["land", "weather", "soil", "crops", "advice", "roadmap"] as const).map((id) => ({ id, status: statuses[id] }));
}
