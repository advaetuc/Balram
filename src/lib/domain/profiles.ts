import type { ProfileMeta, StashedFarm } from "@/types/domain";
import { squareMetresToGunthas } from "./geometry";
import { barSegments } from "./viz/barSegments";

export * from "./profileOperations";

export function summarizeProfile(meta: ProfileMeta, slice: StashedFarm) {
  const areaGunthas = squareMetresToGunthas(slice.fieldGeometry?.areaSquareMetres ?? 0);
  return {
    id: meta.id,
    name: meta.name,
    origin: meta.origin,
    updatedAt: meta.updatedAt,
    areaGunthas,
    plotCount: slice.cropAllocations.length,
    setupComplete: slice.setupCompletedAt !== null,
    segments: barSegments(areaGunthas, slice.cropAllocations).segments,
  };
}
