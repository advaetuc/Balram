import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { cropLabel, lifecycleLabel, t } from "@/config/i18n";
import type { RoadmapItem } from "@/lib/domain/roadmap";
import { squareMetresToAcresAndGunthas } from "@/lib/domain/geometry";
import type { Locale, PersistedFarm } from "@/types/domain";

/** Builds a shareable summary from farmer-entered details. Geometry is intentionally never read. */
export function buildShareSummary(state: PersistedFarm, roadmap: readonly RoadmapItem[], locale: Locale): string {
  const copy = t(locale);
  const lines = [state.farmProfile?.name ?? (locale === "mr" ? "माझे शेत" : "My Farm")];
  const area = state.fieldGeometry?.areaSquareMetres;
  if (area != null) {
    const size = squareMetresToAcresAndGunthas(area);
    lines.push(`${copy.shareLand}: ${size.acres} ${copy.acres} ${size.gunthas} ${copy.gunthas}`);
  }
  lines.push(`${copy.sharePlots}:`);
  if (state.cropAllocations.length === 0) lines.push(locale === "mr" ? "प्लॉट नाहीत" : "No plots saved");
  for (const [index, plot] of state.cropAllocations.entries()) {
    const crop = plot.cropId in MaharashtraCropMatrix ? cropLabel(locale, plot.cropId as CropId) : plot.cropId;
    const areaGunthas = plot.areaGunthas ?? (state.fieldGeometry?.areaSquareMetres == null ? null : state.fieldGeometry.areaSquareMetres / 101.17141056 * plot.percentage / 100);
    const size = areaGunthas == null ? null : squareMetresToAcresAndGunthas(areaGunthas * 101.17141056);
    const land = size ? `${size.acres} ${copy.acres} ${size.gunthas} ${copy.gunthas}` : `${plot.percentage}%`;
    lines.push(`• ${plot.plotName ?? `${locale === "mr" ? "प्लॉट" : "Plot"} ${index + 1}`} · ${crop} · ${land} · ${lifecycleLabel(locale, plot.lifecycleStage ?? "planned")}`);
  }
  if (state.soilKitReading) {
    const reading = state.soilKitReading;
    lines.push(`${copy.shareSoilTested} (${reading.testedAt}): pH ${reading.ph}, N ${reading.nitrogenLevel}, P ${reading.phosphorusLevel}${reading.potassiumLevel === "untested" ? "" : `, K ${reading.potassiumLevel}`}. ${locale === "mr" ? "किटद्वारे मोजलेले" : "Measured by kit"}.`);
  } else lines.push(`${copy.shareSoil}: ${copy.shareSoilUntested}`);
  lines.push(`${copy.shareActions}:`);
  for (const item of roadmap.slice(0, 3)) lines.push(`• ${item.title[locale]} — ${item.detail[locale]}`);
  if (roadmap.length === 0) lines.push(copy.roadmapEmpty);
  if (state.sampleDataActive) lines.push(locale === "mr" ? "नमुना माहिती · उदाहरण" : "Sample data · illustrative");
  return lines.join("\n");
}
