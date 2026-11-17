import type { CropAllocation } from "@/types/domain";

export interface PlotRemovalSnapshot {
  readonly removedPlot: CropAllocation;
  readonly previousAllocations: readonly CropAllocation[];
  readonly remainingAllocations: readonly CropAllocation[];
}

/** Capture one reversible plot removal so the UI can restore the complete prior plan atomically. */
export function createPlotRemovalSnapshot(allocations: readonly CropAllocation[], plotId: string): PlotRemovalSnapshot | null {
  const removedPlot = allocations.find((plot) => plot.plotId === plotId);
  if (!removedPlot) return null;
  return {
    removedPlot,
    previousAllocations: [...allocations],
    remainingAllocations: allocations.filter((plot) => plot.plotId !== plotId),
  };
}

export function restorePlotRemoval(snapshot: PlotRemovalSnapshot): CropAllocation[] {
  return [...snapshot.previousAllocations];
}
