import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import type { CropAllocation } from "@/types/domain";
import { GUNTHAS_PER_ACRE } from "../geometry";

const COLUMNS = 8;
const PATTERN_INDICES = [0, 1, 2, 3, 4] as const;
type PatternIndex = typeof PATTERN_INDICES[number];

type TileAssignment =
  | { kind: "fallow" }
  | { kind: "plot"; plotIndex: number; plotId: string | null; cropId: string;
      patternIndex: PatternIndex; initial: { en: string; mr: string } };

export type LandTile = TileAssignment & { row: number; column: number; fillFraction: number };
export interface AcreBlock {
  acreIndex: number;
  tiles: LandTile[];
}

/** Partial acres contain only the cells backed by land. A block limit preserves the full-farm apportionment. */
export function layoutTiles(totalGunthas: number, plots: readonly CropAllocation[], maxBlocks = Infinity): AcreBlock[] {
  if (!Number.isFinite(totalGunthas) || totalGunthas < 0) {
    throw new RangeError("Total land area must be finite and nonnegative.");
  }

  if (maxBlocks !== Infinity && (!Number.isInteger(maxBlocks) || maxBlocks < 0)) {
    throw new RangeError("Maximum acre blocks must be a nonnegative integer.");
  }

  const areas = plots.map((plot) => plot.areaGunthas ?? totalGunthas * plot.percentage / 100);
  const allocated = areas.reduce((sum, area) => sum + area, 0);
  // Saved plot areas can slightly exceed the mapped area due to plot-entry rounding.
  const scale = allocated > totalGunthas ? totalGunthas / allocated : 1;
  const assignments: TileAssignment[] = plots.map((plot, plotIndex) => {
    const crop = Object.hasOwn(MaharashtraCropMatrix, plot.cropId)
      ? MaharashtraCropMatrix[plot.cropId as CropId] : undefined;
    return {
      kind: "plot", plotIndex, plotId: plot.plotId ?? null, cropId: plot.cropId,
      patternIndex: PATTERN_INDICES[plotIndex % PATTERN_INDICES.length],
      initial: { en: crop?.name[0] ?? "?", mr: crop?.marathiName[0] ?? "?" },
    };
  });
  assignments.push({ kind: "fallow" });

  const quotas = [...areas.map((area) => area * scale), Math.max(0, totalGunthas - allocated)];
  const wholeTiles = Math.floor(totalGunthas);
  const counts = quotas.map(Math.floor);
  const ranked = quotas.map((quota, index) => ({ index, remainder: quota - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = wholeTiles - counts.reduce((sum, count) => sum + count, 0);
  for (const { index } of ranked.slice(0, Math.max(0, remaining))) counts[index]++;

  const blocks: AcreBlock[] = [];
  const tileLimit = maxBlocks * GUNTHAS_PER_ACRE;
  let tileIndex = 0;
  function addTile(assignment: TileAssignment, fillFraction: number) {
    const acreIndex = Math.floor(tileIndex / GUNTHAS_PER_ACRE);
    const cell = tileIndex % GUNTHAS_PER_ACRE;
    const block = blocks[acreIndex] ?? (blocks[acreIndex] = { acreIndex, tiles: [] });
    block.tiles.push({ ...assignment, row: Math.floor(cell / COLUMNS), column: cell % COLUMNS, fillFraction });
    tileIndex++;
  }

  assignments.forEach((assignment, index) => {
    const visible = Math.min(counts[index], tileLimit - tileIndex);
    for (let tile = 0; tile < visible; tile++) addTile(assignment, 1);
  });
  const fraction = totalGunthas - wholeTiles;
  if (fraction > 0 && wholeTiles < tileLimit) {
    const index = quotas.reduce((best, quota, i) =>
      quota - counts[i] > quotas[best] - counts[best] ? i : best, 0);
    addTile(assignments[index], fraction);
  }
  return blocks;
}
