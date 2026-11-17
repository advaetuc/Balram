import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { CropAllocationsSchema, lifecycleToGrowthStage, type CropAllocation, type LifecycleStage } from "@/types/domain";
import { createFieldId, squareMetresToGunthas } from "./geometry";

export type LandSharePreset =
  | "all_remaining"
  | "half_remaining"
  | "one_acre"
  | "plus_10_gunthas"
  | "plus_5_gunthas"
  | "minus_5_gunthas";

export const DEFAULT_PLOT_NAMES = ["Well Plot", "Borewell Patch", "Canal Plot", "Roadside Field"] as const;

export interface CheckoutDraftLine {
  readonly draftId: string;
  readonly editingPlotId?: string | null;
  readonly cropId: CropId;
  readonly plotName: string;
  readonly areaGunthas: number;
  readonly alreadyPlanted: boolean;
  readonly lifecycleStage: LifecycleStage;
  readonly plantingDate: string | null;
}

export type CheckoutValidationErrorCode =
  | "EMPTY_DRAFT"
  | "INVALID_AREA"
  | "NO_FREE_LAND"
  | "EXCEEDS_AVAILABLE_LAND"
  | "DUPLICATE_PLOT_NAME"
  | "EMPTY_PLOT_NAME";

export interface CheckoutValidationResult {
  readonly ok: boolean;
  readonly errorCode: CheckoutValidationErrorCode | null;
  readonly overByGunthas: number;
  readonly totalDraftGunthas: number;
  readonly remainingFreeGunthas: number | null;
  readonly message: { readonly en: string; readonly mr: string } | null;
}

const messages: Record<CheckoutValidationErrorCode, { en: string; mr: string }> = {
  EMPTY_DRAFT: { en: "Select at least one crop before continuing.", mr: "पुढे जाण्यापूर्वी किमान एक पीक निवडा." },
  INVALID_AREA: { en: "Each plot must have a positive land area.", mr: "प्रत्येक प्लॉटचे क्षेत्र शून्यापेक्षा जास्त असावे." },
  NO_FREE_LAND: { en: "No unassigned land remains for this plot.", mr: "या प्लॉटसाठी जमीन शिल्लक नाही." },
  EXCEEDS_AVAILABLE_LAND: { en: "The selected plots exceed the available farm land.", mr: "निवडलेल्या प्लॉटचे क्षेत्र उपलब्ध जमिनीपेक्षा जास्त आहे." },
  DUPLICATE_PLOT_NAME: { en: "Each plot must have a unique name.", mr: "प्रत्येक प्लॉटचे नाव वेगळे असावे." },
  EMPTY_PLOT_NAME: { en: "Enter a name for every plot.", mr: "प्रत्येक प्लॉटसाठी नाव लिहा." },
};

function roundedTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampMinimum(value: number, available: number | null): number {
  if (available === 0) return 0;
  if (available !== null && available > 0 && available < 1) return roundedTenth(available);
  return Math.max(1, roundedTenth(value));
}

export function pickNextDefaultPlotName(existingNames: readonly string[]): string {
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase("en")));
  return DEFAULT_PLOT_NAMES.find((name) => !used.has(name.toLocaleLowerCase("en"))) ?? `Plot ${existingNames.length + 1}`;
}

export function resolvePresetGunthas(
  preset: LandSharePreset,
  currentLineGunthas: number,
  availableForThisLineGunthas: number | null,
): number {
  const current = Number.isFinite(currentLineGunthas) ? currentLineGunthas : 0;
  const available = availableForThisLineGunthas === null
    ? null
    : Math.max(0, availableForThisLineGunthas);
  const fallbackPool = available === null ? 80 : available;
  let value: number;
  switch (preset) {
    case "all_remaining":
      value = available === null ? 80 : Math.max(0, Math.floor(available * 10) / 10);
      break;
    case "half_remaining":
      value = fallbackPool < 2 ? fallbackPool : Math.floor(fallbackPool / 2);
      break;
    case "one_acre":
      value = 40;
      break;
    case "plus_10_gunthas":
      value = available === null ? current + 10 : Math.min(available, current + 10);
      break;
    case "plus_5_gunthas":
      value = available === null ? current + 5 : Math.min(available, current + 5);
      break;
    case "minus_5_gunthas":
      value = Math.max(1, current - 5);
      break;
  }
  if (available === 0 && (preset === "all_remaining" || preset === "half_remaining" || preset === "plus_10_gunthas" || preset === "plus_5_gunthas")) return 0;
  if (preset === "all_remaining") return roundedTenth(value);
  if (available !== null && value > available && preset !== "one_acre" && preset !== "minus_5_gunthas") value = available;
  return clampMinimum(value, available);
}

function allocationAreaGunthas(allocation: CropAllocation, totalFarmGunthas: number | null): number {
  if (allocation.areaGunthas != null) return allocation.areaGunthas;
  if (totalFarmGunthas !== null) return totalFarmGunthas * allocation.percentage / 100;
  return 0;
}

function result(
  errorCode: CheckoutValidationErrorCode | null,
  totalDraftGunthas: number,
  remainingFreeGunthas: number | null,
  overByGunthas = 0,
): CheckoutValidationResult {
  const roundedOverBy = roundedTenth(overByGunthas);
  const message = errorCode === null ? null : errorCode === "EXCEEDS_AVAILABLE_LAND"
    ? { en: `Over by ${roundedOverBy} Gunthas`, mr: `उपलब्ध जमिनीपेक्षा ${roundedOverBy} गुंठे जास्त` }
    : messages[errorCode];
  return { ok: errorCode === null, errorCode, overByGunthas: roundedTenth(overByGunthas), totalDraftGunthas: roundedTenth(totalDraftGunthas),
    remainingFreeGunthas: remainingFreeGunthas === null ? null : roundedTenth(Math.max(0, remainingFreeGunthas)),
    message };
}

export function validateCheckoutDraft(
  lines: readonly CheckoutDraftLine[],
  existingAllocations: readonly CropAllocation[],
  totalAreaSquareMetres: number | null,
): CheckoutValidationResult {
  if (lines.length === 0) return result("EMPTY_DRAFT", 0, totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres));

  const editedIds = new Set(lines.flatMap((line) => line.editingPlotId ? [line.editingPlotId] : []));
  const retained = existingAllocations.filter((allocation) => !allocation.plotId || !editedIds.has(allocation.plotId));
  const totalFarmGunthas = totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres);
  const alreadyAllocatedGunthas = retained.reduce((sum, allocation) => sum + allocationAreaGunthas(allocation, totalFarmGunthas), 0);
  const availablePool = totalFarmGunthas === null ? null : Math.max(0, totalFarmGunthas - alreadyAllocatedGunthas);
  const totalDraftGunthas = lines.reduce((sum, line) => sum + (Number.isFinite(line.areaGunthas) ? line.areaGunthas : 0), 0);
  const freeAfterDraft = availablePool === null ? null : availablePool - totalDraftGunthas;

  if (lines.some((line) => line.plotName.trim().length === 0)) return result("EMPTY_PLOT_NAME", totalDraftGunthas, freeAfterDraft);
  const names = [...lines.map((line) => line.plotName.trim().toLocaleLowerCase("en")),
    ...retained.flatMap((allocation) => allocation.plotName ? [allocation.plotName.trim().toLocaleLowerCase("en")] : [])];
  if (new Set(names).size !== names.length) return result("DUPLICATE_PLOT_NAME", totalDraftGunthas, freeAfterDraft);

  if (availablePool !== null && availablePool <= 0 && lines.some((line) => !Number.isFinite(line.areaGunthas) || line.areaGunthas <= 0)) {
    return result("NO_FREE_LAND", totalDraftGunthas, freeAfterDraft);
  }
  if (lines.some((line) => !Number.isFinite(line.areaGunthas) || line.areaGunthas <= 0)) {
    return result("INVALID_AREA", totalDraftGunthas, freeAfterDraft);
  }
  if (availablePool !== null && totalDraftGunthas > availablePool + 0.05) {
    return result("EXCEEDS_AVAILABLE_LAND", totalDraftGunthas, freeAfterDraft, totalDraftGunthas - availablePool);
  }
  return result(null, totalDraftGunthas, availablePool === null ? null : availablePool - totalDraftGunthas);
}

function inferredExistingAreas(allocations: readonly CropAllocation[], totalFarmGunthas: number | null): Map<CropAllocation, number> {
  const areas = new Map<CropAllocation, number>();
  let knownArea = 0;
  let knownShare = 0;
  for (const allocation of allocations) {
    if (allocation.areaGunthas != null) {
      areas.set(allocation, allocation.areaGunthas);
      knownArea += allocation.areaGunthas;
      knownShare += allocation.percentage;
    }
  }
  const missing = allocations.filter((allocation) => allocation.areaGunthas == null);
  const inferredTotal = totalFarmGunthas ?? (knownShare > 0 ? knownArea * 100 / knownShare : 80);
  for (const allocation of missing) areas.set(allocation, inferredTotal * allocation.percentage / 100);
  return areas;
}

function apportionPercentages(allocations: readonly CropAllocation[], areas: readonly number[], totalFarmGunthas: number | null): CropAllocation[] {
  const allocated = areas.reduce((sum, area) => sum + area, 0);
  const denominator = totalFarmGunthas ?? allocated;
  if (!(denominator > 0)) throw new RangeError("Checkout allocations require a positive land area.");
  const targetPoints = Math.min(10_000, Math.round(allocated / denominator * 10_000));
  const points = areas.map((area, index) => {
    const exact = area / allocated * targetPoints;
    return { index, points: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let residual = targetPoints - points.reduce((sum, entry) => sum + entry.points, 0);
  for (const entry of [...points].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (residual <= 0) break;
    entry.points++;
    residual--;
  }
  const byIndex = new Map(points.map((entry) => [entry.index, entry.points]));
  return allocations.map((allocation, index) => ({ ...allocation, percentage: byIndex.get(index)! / 100 }));
}

/** Validate and atomically convert an ephemeral checkout draft into persisted crop allocations. */
export function commitCheckoutDraftToAllocations(
  lines: readonly CheckoutDraftLine[],
  existingAllocations: readonly CropAllocation[],
  totalAreaSquareMetres: number | null,
): CropAllocation[] {
  const validation = validateCheckoutDraft(lines, existingAllocations, totalAreaSquareMetres);
  if (!validation.ok) throw new RangeError(validation.message?.en ?? "Checkout draft is invalid.");

  const totalFarmGunthas = totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres);
  const editedIds = new Set(lines.flatMap((line) => line.editingPlotId ? [line.editingPlotId] : []));
  for (const line of lines) {
    if (line.editingPlotId && !existingAllocations.some((allocation) => allocation.plotId === line.editingPlotId)) {
      throw new RangeError("The plot selected for editing no longer exists.");
    }
  }
  const retained = existingAllocations.filter((allocation) => !allocation.plotId || !editedIds.has(allocation.plotId));
  const retainedAreas = inferredExistingAreas(retained, totalFarmGunthas);
  const reservedIds = new Set(existingAllocations.flatMap((allocation) => allocation.plotId ? [allocation.plotId] : []));
  const allocationForLine = (line: CheckoutDraftLine, plotId: string): CropAllocation => {
    const stage = line.alreadyPlanted ? line.lifecycleStage : "planned";
    return {
      plotId, plotName: line.plotName.trim(), areaGunthas: roundedTenth(line.areaGunthas), cropId: line.cropId,
      percentage: 1, season: MaharashtraCropMatrix[line.cropId].season.toLowerCase() as CropAllocation["season"],
      lifecycleStage: stage, growthStage: lifecycleToGrowthStage(stage), plantingDate: line.alreadyPlanted ? line.plantingDate : null,
    };
  };
  const newLines = lines.filter((line) => !line.editingPlotId);
  const newAllocations = newLines.map((line) => {
    let plotId = createFieldId().replace(/^field-/, "plot-");
    while (reservedIds.has(plotId)) plotId = createFieldId().replace(/^field-/, "plot-");
    reservedIds.add(plotId);
    return allocationForLine(line, plotId);
  });
  const editsById = new Map(lines.flatMap((line) => line.editingPlotId ? [[line.editingPlotId, line] as const] : []));
  const all: CropAllocation[] = [];
  const allAreas: number[] = [];
  for (const existing of existingAllocations) {
    const edit = existing.plotId ? editsById.get(existing.plotId) : undefined;
    if (edit) {
      all.push(allocationForLine(edit, existing.plotId!));
      allAreas.push(edit.areaGunthas);
    } else {
      all.push(existing);
      allAreas.push(retainedAreas.get(existing) ?? 0);
    }
  }
  for (let index = 0; index < newAllocations.length; index++) {
    all.push(newAllocations[index]!);
    allAreas.push(newLines[index]!.areaGunthas);
  }
  const calculated = apportionPercentages(all, allAreas, totalFarmGunthas);
  return CropAllocationsSchema.parse(calculated);
}
