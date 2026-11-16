import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import type { BalramState } from "@/store/useBalramStore";
import { calculatePhaseWaterBreakdown, resolveDailyEt0 } from "@/lib/domain/irrigation";
import { interpretSoilKitReading } from "@/lib/domain/soilKit";
import { generateRoadmap } from "@/lib/domain/roadmap";
import { selectedWeatherDay, indiaDate } from "./format";

export function farmRoadmap(state: BalramState) {
  const area = state.fieldGeometry?.areaSquareMetres ?? null;
  const day = selectedWeatherDay(state);
  const et0 = resolveDailyEt0(day, state.fieldGeometry?.center[1] ?? 18.5204, state.weatherSnapshot?.source)?.et0MmPerDay ?? 4.5;
  const deliveryMethod = state.irrigationSetup?.method === "sprinkler" ? "sprinkler"
    : state.irrigationSetup?.method === "surface" ? "canal_flood" : "drip";
  const waterBreakdownByPlot: Record<string, ReturnType<typeof calculatePhaseWaterBreakdown>> = {};
  for (const [index, plot] of state.cropAllocations.entries()) {
    if (!(plot.cropId in MaharashtraCropMatrix)) continue;
    const areaGunthas = plot.areaGunthas ?? (area === null ? null : area / 101.17141056 * plot.percentage / 100);
    if (!areaGunthas || areaGunthas <= 0) continue;
    const breakdown = calculatePhaseWaterBreakdown({ cropId: plot.cropId as CropId, areaGunthas, baseEt0MmPerDay: et0,
      effectiveRainfallMmPerDay: day?.precipitation ?? 0, deliveryMethod,
      customSystemFlowLph: state.irrigationSetup?.flowConfirmedByFarmer ? state.irrigationSetup.systemFlowLitresPerHour : null,
      customEfficiency: state.irrigationSetup?.flowConfirmedByFarmer ? state.irrigationSetup.applicationEfficiency : null });
    waterBreakdownByPlot[plot.plotId ?? `${plot.cropId}-${index}`] = breakdown;
    if (plot.plotId === undefined) waterBreakdownByPlot[plot.cropId] = breakdown;
  }
  return generateRoadmap({ allocations: state.cropAllocations,
    soilInterpretation: state.soilKitReading ? interpretSoilKitReading(state.soilKitReading) : null,
    waterBreakdownByPlot, todayIso: indiaDate(state.now) ?? "2026-11-16" });
}
