import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { AREA_EPSILON_GUNTHAS } from "../landUnits";
import type { CropAllocation } from "@/types/domain";

export const MAX_VISIBLE_BAR_PLOTS = 6;
export const MIN_SEGMENT_DISPLAY_PERCENT = 15;

const patternIndices = [0, 1, 2, 3, 4] as const;

type Segment = { areaGunthas: number; truePercent: number } & (
  | { kind: "plot"; plotIndex: number; plotId: string | null; cropId: string;
      patternIndex: typeof patternIndices[number]; initial: { en: string; mr: string } }
  | { kind: "fallow" }
);

function displayWidths(segments: readonly Segment[]): number[] {
  const floor = MIN_SEGMENT_DISPLAY_PERCENT;
  const floors = segments.map(segment => segment.kind === "fallow"
    ? Math.min(floor, 100 - (segments.length - 1) * floor) : floor);
  // Six plot targets need 90%. A seventh, noninteractive fallow segment gets 10%.
  if (floors.reduce((sum, minimum) => sum + minimum, 0) === 100) return floors;

  const widths: number[] = [];
  let pending = segments.map((_, index) => index);
  let available = 100;
  while (pending.length > 0) {
    const area = pending.reduce((sum, index) => sum + segments[index].areaGunthas, 0);
    const share = (index: number) => area > 0
      ? segments[index].areaGunthas / area * available : available / pending.length;
    const belowFloor = pending.filter(index => share(index) < floors[index]);
    if (belowFloor.length === 0) {
      for (const index of pending) widths[index] = share(index);
      break;
    }
    for (const index of belowFloor) {
      widths[index] = floors[index];
      available -= floors[index];
    }
    pending = pending.filter(index => !belowFloor.includes(index));
  }
  return widths;
}

export function barSegments(totalGunthas: number, plots: readonly CropAllocation[]): {
  segments: (Segment & { displayWidthPercent: number })[];
  overflowPlotCount: number;
  unassignedGunthas: number;
  totalGunthas: number;
} {
  if (!Number.isFinite(totalGunthas) || totalGunthas < 0) {
    throw new RangeError("Total land area must be finite and nonnegative.");
  }
  const overflowPlotCount = Math.max(0, plots.length - MAX_VISIBLE_BAR_PLOTS);
  const segments: Segment[] = [];
  if (totalGunthas === 0) {
    return { segments: [], overflowPlotCount, unassignedGunthas: 0, totalGunthas };
  }

  const areas = plots.map(plot => plot.areaGunthas ?? totalGunthas * (plot.percentage / 100));
  const unassignedGunthas = Math.max(0, totalGunthas - areas.reduce((sum, area) => sum + area, 0));
  plots.slice(0, MAX_VISIBLE_BAR_PLOTS).forEach((plot, plotIndex) => {
    const areaGunthas = areas[plotIndex];
    const crop = Object.hasOwn(MaharashtraCropMatrix, plot.cropId)
      ? MaharashtraCropMatrix[plot.cropId as CropId] : undefined;
    segments.push({
      kind: "plot", plotIndex, plotId: plot.plotId ?? null, cropId: plot.cropId, areaGunthas,
      truePercent: areaGunthas / totalGunthas * 100,
      patternIndex: patternIndices[plotIndex % patternIndices.length],
      initial: { en: crop?.name[0] ?? "?", mr: crop?.marathiName[0] ?? "?" },
    });
  });
  if (unassignedGunthas > AREA_EPSILON_GUNTHAS) {
    segments.push({ kind: "fallow", areaGunthas: unassignedGunthas, truePercent: unassignedGunthas / totalGunthas * 100 });
  }
  // displayOnly: true. Widths apportion the visible strip, including touch-target floors.
  const widths = displayWidths(segments);
  return {
    segments: segments.map((segment, index) => ({ ...segment, displayWidthPercent: widths[index] })),
    overflowPlotCount, unassignedGunthas, totalGunthas,
  };
}
