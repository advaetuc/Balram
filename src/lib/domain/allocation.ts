import { z } from "zod";
import { CropAllocationSchema, type CropAllocation } from "@/types/domain";
import { acresToSquareMetres } from "./geometry";

function basisPoints(percentage: number): number {
  const value = z.number().finite().min(0).max(100).parse(percentage) * 100;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 1e-8) throw new RangeError("Use at most two decimal places for crop percentages.");
  return rounded;
}

/** Integer basis points make 100% exact; an empty draft is distinct from a complete portfolio. */
export function validatePortfolio(input: readonly CropAllocation[]): CropAllocation[] {
  const entries = z.array(CropAllocationSchema).min(1).max(50).parse(input);
  if (new Set(entries.map((entry) => entry.cropId)).size !== entries.length) throw new RangeError("Duplicate crops are not allowed.");
  if (entries.reduce((sum, entry) => sum + basisPoints(entry.percentage), 0) !== 10_000) {
    throw new RangeError("Crop allocations must total exactly 100%.");
  }
  return entries;
}

/** Largest-remainder apportionment keeps the other crops proportional and the total exactly 100%. */
export function rebalancePortfolio(input: readonly CropAllocation[], cropId: string, percentage: number): CropAllocation[] {
  const portfolio = validatePortfolio(input);
  const selected = portfolio.find((entry) => entry.cropId === cropId);
  if (!selected) throw new RangeError("The selected crop is not in this portfolio.");
  const selectedPoints = basisPoints(percentage);
  const others = portfolio.filter((entry) => entry.cropId !== cropId);
  if (!others.length && selectedPoints !== 10_000) throw new RangeError("A one-crop portfolio must remain at 100%.");
  const remaining = 10_000 - selectedPoints;
  const total = others.reduce((sum, entry) => sum + basisPoints(entry.percentage), 0);
  const apportioned = others.map((entry, index) => {
    const exact = basisPoints(entry.percentage) * remaining / total;
    return { entry, index, points: Math.floor(exact), remainder: exact % 1 };
  });
  let residual = remaining - apportioned.reduce((sum, item) => sum + item.points, 0);
  for (const item of [...apportioned].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (residual-- > 0) item.points++;
  }
  const updates = new Map(apportioned.map((item) => [item.entry.cropId, item.points]));
  updates.set(cropId, selectedPoints);
  return validatePortfolio(portfolio.map((entry) => ({ ...entry, percentage: updates.get(entry.cropId)! / 100 }))
    .filter((entry) => entry.percentage > 0));
}

export function allocateAcreage(input: readonly CropAllocation[], totalAcres: number) {
  const area = z.number().finite().positive().parse(totalAcres);
  return validatePortfolio(input).map((entry) => {
    const areaAcres = area * basisPoints(entry.percentage) / 10_000;
    return { ...entry, areaAcres, areaSquareMetres: acresToSquareMetres(areaAcres) };
  });
}
