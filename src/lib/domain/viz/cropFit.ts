import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import type { SoilKitReading, WeatherSnapshot } from "@/types/domain";
import { detectMaharashtraSeason } from "../cropRecommendations";

export type CropFitStatus = "good" | "fair" | "needs_help";

function contains(value: number, [min, max]: readonly [number, number]) {
  return value >= min && value <= max;
}

export function evaluateCropFit({
  cropId, monthZeroIndexed, soilKitReading, weatherSnapshot,
}: {
  cropId: CropId;
  monthZeroIndexed: number;
  soilKitReading: SoilKitReading | null;
  weatherSnapshot: WeatherSnapshot | null;
}): { soil: CropFitStatus; water: CropFitStatus; sowing: CropFitStatus } {
  const crop = MaharashtraCropMatrix[cropId];
  const season = detectMaharashtraSeason(monthZeroIndexed);
  const inSowingWindow = Object.values(crop.sowingWindows).some(([start, end]) =>
    contains(monthZeroIndexed, [start, end < start ? 11 : end]) ||
    (end < start && monthZeroIndexed <= end));

  const ph = soilKitReading?.ph;
  let soil: CropFitStatus = "fair";
  if (ph !== undefined) {
    if (!contains(ph, crop.tolerablePhRange)) soil = "needs_help";
    else if (contains(ph, crop.optimalPhRange)) soil = "good";
  }

  const days = weatherSnapshot?.daily ?? [];
  const highs = days.flatMap(({ temperatureMax }) => temperatureMax === null ? [] : [temperatureMax]);
  const hasRainData = days.length > 0 && days.every(({ precipitation }) => precipitation !== null);
  let water: CropFitStatus = "fair";
  if (highs.length > 0 && hasRainData) {
    const meanHigh = highs.reduce((sum, high) => sum + high, 0) / highs.length;
    const rain = days.reduce((sum, day) => sum + (day.precipitation ?? 0), 0);
    // Same hot/dry thresholds as the seasonal recommendations.
    const hotAndDry = meanHigh >= 35 && rain < 5;
    if (!hotAndDry || crop.droughtTolerance === "high") water = "good";
    else if (crop.droughtTolerance === "low") water = "needs_help";
  }

  const sowing = inSowingWindow ? "good" : crop.supportedSeasons.includes(season) ? "fair" : "needs_help";
  return { soil, water, sowing };
}
