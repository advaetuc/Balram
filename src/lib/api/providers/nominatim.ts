import { z } from "zod";
import { nominatimIdentity, PROVIDERS } from "@/config/providers";
import { CoordinateSchema } from "@/types/domain";
import { success } from "@/types/api";
import { ApiError, fetchJson } from "../http";
import { acquireProviderSlot, cachedRequest } from "../server";

const decimalString = z.string().regex(/^-?\d+(?:\.\d+)?$/).transform(Number).pipe(z.number().finite());
export const NominatimResponseSchema = z.array(z.object({
  place_id: z.number().int().nonnegative(),
  osm_type: z.enum(["node", "way", "relation"]), osm_id: z.number().int().nonnegative(),
  lat: decimalString.pipe(z.number().min(-90).max(90)), lon: decimalString.pipe(z.number().min(-180).max(180)),
  display_name: z.string().min(1).max(2000),
  boundingbox: z.tuple([decimalString, decimalString, decimalString, decimalString])
    .refine(([south, north, west, east]) => south <= north && west <= east, "Invalid bounds."),
})).max(5);

export const GeocodeInputSchema = z.object({
  intent: z.literal("submit"),
  query: z.string().trim().min(3).max(160).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Invalid place query."),
}).strict();

/** Explicit form submissions only. No keystroke/autocomplete/reverse/bulk endpoint is exposed. */
export async function searchPlaces(input: z.infer<typeof GeocodeInputSchema>, signal?: AbortSignal) {
  const params = GeocodeInputSchema.parse(input);
  const query = GeocodeInputSchema.shape.query.parse(params.query.normalize("NFKC").replace(/\s+/g, " "));
  return cachedRequest("geocode", query.toLocaleLowerCase("en-IN"), signal, async (sharedSignal) => {
    const identity = nominatimIdentity();
    if (!identity) throw new ApiError("CONFIGURATION", "Configure BALRAM_CONTACT_URL with the application's public contact page before enabling geocoding.", 503);
    const url = new URL(PROVIDERS.geocode.endpoint);
    url.search = new URLSearchParams({ q: query, format: "jsonv2", countrycodes: "in", limit: "5", "accept-language": "en" }).toString();
    let ttl: number = PROVIDERS.geocode.ttlMs;
    const raw = await fetchJson(url, { schema: NominatimResponseSchema, signal: sharedSignal,
      allowedOrigins: [url.origin], headers: { "User-Agent": identity },
      beforeAttempt: (attemptSignal) => acquireProviderSlot("nominatim", attemptSignal),
      onCachePolicy: (value) => { if (value !== null) ttl = Math.min(ttl, value); },
    });
    const data = raw.map((place) => ({
      id: `${place.osm_type}:${place.osm_id}`, label: place.display_name,
      coordinate: CoordinateSchema.parse([place.lon, place.lat]),
      bounds: z.tuple([CoordinateSchema, CoordinateSchema]).parse([
        [place.boundingbox[2], place.boundingbox[0]], [place.boundingbox[3], place.boundingbox[1]],
      ]),
    }));
    const result = success("geocode", data, null, ["© OpenStreetMap contributors. Provider record update time is unavailable."]);
    return { ...result, expiresAt: new Date(Date.parse(result.fetchedAt) + ttl).toISOString() };
  });
}
