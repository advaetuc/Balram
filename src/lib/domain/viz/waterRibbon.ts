import { getCropStageKc, MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import type { CropAllocation, WeatherSnapshot } from "@/types/domain";
import { GUNTHAS_PER_ACRE } from "../geometry";
import { calculateCropWaterRequirement, calculateIrrigationDemand, resolveDailyEt0 } from "../irrigation";

// Planning threshold pending confirmation by a local agronomist.
export const HEAVY_RAIN_CAUTION_MM = 25;

export type VisualWeatherProvenance = "forecast" | "typical_season" | "sample";

export function visualWeatherProvenance(snapshot: WeatherSnapshot): VisualWeatherProvenance {
  if (snapshot.provenance === "sample") return "sample";
  return snapshot.source.toLowerCase().includes("baseline") ? "typical_season" : "forecast";
}

export function buildWaterRibbon({
  weatherSnapshot, plot, latitudeDeg, rainScalePercent = 100,
}: {
  weatherSnapshot: WeatherSnapshot;
  plot: CropAllocation;
  latitudeDeg: number;
  rainScalePercent?: 100 | 75 | 50 | 25;
}) {
  const cropKc = Object.hasOwn(MaharashtraCropMatrix, plot.cropId)
    ? getCropStageKc(plot.cropId as CropId, plot.lifecycleStage ?? plot.growthStage)
    : null;
  const provenance = visualWeatherProvenance(weatherSnapshot);
  const start = Date.parse(weatherSnapshot.daily[0].date);
  const byDate = new Map(weatherSnapshot.daily.map((day) => [day.date, day]));
  // Depth is independent of area, so legacy percentage-only plots use a one-acre basis.
  const areaAcres = (plot.areaGunthas ?? GUNTHAS_PER_ACRE) / GUNTHAS_PER_ACRE;

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    const day = byDate.get(date) ?? null;
    const et0 = resolveDailyEt0(day, latitudeDeg, weatherSnapshot.source)?.et0MmPerDay ?? null;
    const rainMm = day?.precipitation ?? null;
    const scaledRainMm = rainMm === null ? null : rainMm * rainScalePercent / 100;
    const cropNeedMm = et0 === null || cropKc === null ? null : calculateCropWaterRequirement(et0, cropKc);
    const netNeedMm = et0 === null || cropKc === null || scaledRainMm === null ? null
      : calculateIrrigationDemand({ et0, cropKc, areaAcres, effectiveRainfallMm: scaledRainMm }).netDepthMm;

    return {
      date, tempMin: day?.temperatureMin ?? null, tempMax: day?.temperatureMax ?? null,
      rainMm, scaledRainMm, cropNeedMm, netNeedMm, irrigate: netNeedMm !== null && netNeedMm > 0,
      heavyRainCaution: rainMm !== null && rainMm >= HEAVY_RAIN_CAUTION_MM,
      provenance, illustrative: rainScalePercent !== 100,
    };
  });
}
