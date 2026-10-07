import { z } from "zod";
import { PROVIDERS, SOIL_DEPTH, SOIL_PROPERTIES } from "@/config/providers";
import { CoordinateSchema } from "@/types/domain";
import { success } from "@/types/api";
import { fetchJson } from "../http";
import { acquireProviderSlot, cachedRequest, LocationInputSchema, queryCoordinate } from "../server";

export const SoilGridsResponseSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: CoordinateSchema }),
  properties: z.object({ layers: z.array(z.object({
    name: z.enum(SOIL_PROPERTIES),
    unit_measure: z.object({ d_factor: z.literal(10), mapped_units: z.literal("g/kg"), target_units: z.literal("%") }),
    depths: z.array(z.object({
      label: z.literal(SOIL_DEPTH),
      range: z.object({ top_depth: z.literal(0), bottom_depth: z.literal(5), unit_depth: z.literal("cm") }),
      values: z.object({ mean: z.number().finite().min(0).max(1000).nullable() }),
    })).length(1),
  })).length(3) }),
}).refine((value) => new Set(value.properties.layers.map((layer) => layer.name)).size === 3,
  { message: "Expected one layer per requested soil property." });

export const SoilInputSchema = LocationInputSchema.extend({ intent: z.literal("soil-lookup") }).strict();

/** Optional contextual mineral fractions only; never used as irrigation/moisture measurements. */
export async function getSoilProperties(input: z.infer<typeof SoilInputSchema>, signal?: AbortSignal) {
  const params = SoilInputSchema.parse(input);
  const coordinate = queryCoordinate(params);
  return cachedRequest("soil", coordinate, signal, async (sharedSignal) => {
    const url = new URL(PROVIDERS.soil.endpoint);
    url.search = new URLSearchParams({ lon: String(coordinate[0]), lat: String(coordinate[1]), depth: SOIL_DEPTH, value: "mean" }).toString();
    for (const property of SOIL_PROPERTIES) url.searchParams.append("property", property);
    let ttl: number = PROVIDERS.soil.ttlMs;
    const raw = await fetchJson(url, { schema: SoilGridsResponseSchema, signal: sharedSignal,
      allowedOrigins: [url.origin], beforeAttempt: (attemptSignal) => acquireProviderSlot("soilgrids", attemptSignal),
      onCachePolicy: (value) => { if (value !== null) ttl = Math.min(ttl, value); },
    });
    const data = { queryCoordinate: coordinate, gridCoordinate: raw.geometry.coordinates,
      depthCm: [0, 5] as [number, number], properties: raw.properties.layers.map((layer) => ({
        property: layer.name, mean: layer.depths[0].values.mean === null ? null : layer.depths[0].values.mean / layer.unit_measure.d_factor,
        unit: "%" as const,
      })) };
    const result = success("soil", data, null, [
      "SoilGrids is a beta, gridded soil-property estimate, not a field soil test or live moisture sensor.",
      "Dataset observation/valid time is unavailable. These properties do not feed irrigation calculations.",
    ]);
    return { ...result, expiresAt: new Date(Date.parse(result.fetchedAt) + ttl).toISOString() };
  });
}
