import { z } from "zod";
import { INDIA_TIMEZONE, PROVIDERS } from "@/config/providers";
import { CoordinateSchema, WeatherSnapshotSchema } from "@/types/domain";
import { success } from "@/types/api";
import { fetchJson } from "../http";
import { cachedRequest, LocationInputSchema, queryCoordinate } from "../server";
import { calculateHargreavesEt0 } from "@/lib/domain/irrigation";

const number = z.number().finite();
const epoch = number.int().min(0).max(253402300799);
const readings = <T extends z.ZodTypeAny>(item: T) => z.array(item.nullable()).min(1).max(7);
const DailySchema = z.object({
  time: z.array(epoch).min(1).max(7),
  temperature_2m_min: readings(number), temperature_2m_max: readings(number),
  precipitation_sum: readings(number.nonnegative()), et0_fao_evapotranspiration: readings(number.nonnegative()),
});

export const OpenMeteoResponseSchema = z.object({
  latitude: number.min(-90).max(90), longitude: number.min(-180).max(180),
  timezone: z.string().min(1), utc_offset_seconds: z.number().int(),
  daily_units: z.object({ time: z.literal("unixtime"), temperature_2m_min: z.literal("°C"), temperature_2m_max: z.literal("°C"),
    precipitation_sum: z.literal("mm"), et0_fao_evapotranspiration: z.literal("mm") }),
  daily: DailySchema,
}).superRefine((payload, ctx) => {
  const group=payload.daily;
  if (Object.values(group).some((values) => values.length !== group.time.length) ||
      group.time.some((value, i) => i > 0 && value - group.time[i - 1] !== 86400)) {
      ctx.addIssue({ code: "custom", message: "Weather time series are not aligned." });
  }
  if (payload.daily.time.some((value) => (value + payload.utc_offset_seconds) % 86400 !== 0)) {
    ctx.addIssue({ code: "custom", message: "Forecast days must begin at midnight in Asia/Kolkata." });
  }
});

export const ForecastInputSchema = LocationInputSchema.extend({
  fieldId: z.string().trim().min(1).max(128), intent: z.literal("forecast"),
}).strict();

export async function getForecast(input: z.infer<typeof ForecastInputSchema>, signal?: AbortSignal) {
  const params = ForecastInputSchema.parse(input);
  const coordinate = queryCoordinate(params);
  const result = await cachedRequest("weather", coordinate, signal, async (sharedSignal) => {
    const url = new URL(PROVIDERS.weather.endpoint);
    url.search = new URLSearchParams({
      latitude: String(coordinate[1]), longitude: String(coordinate[0]), timezone: INDIA_TIMEZONE,
      timeformat: "unixtime", forecast_days: "7", temperature_unit: "celsius", precipitation_unit: "mm",
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration",
    }).toString();
    let ttl: number = PROVIDERS.weather.ttlMs;
    const raw = await fetchJson(url, { schema: OpenMeteoResponseSchema, signal: sharedSignal,
      allowedOrigins: [url.origin], onCachePolicy: (value) => { if (value !== null) ttl = Math.min(ttl, value); } });
    const fetchedAt = new Date().toISOString();
    const validFrom = new Date(raw.daily.time[0] * 1000).toISOString();
    const validTo = new Date((raw.daily.time[raw.daily.time.length - 1] + 86400) * 1000).toISOString();
    const expiresAt = new Date(Math.max(Date.parse(fetchedAt), Math.min(Date.parse(validTo), Date.parse(fetchedAt) + ttl))).toISOString();
    const snapshot = WeatherSnapshotSchema.parse({
      fieldId: "provider-cache", coordinate, source: PROVIDERS.weather.name, provenance: "modelled",
      fetchedAt, modelRunAt: null, validFrom, validTo, expiresAt, timezone: INDIA_TIMEZONE,
      units: { temperature: "°C", precipitation: "mm", referenceEvapotranspiration: "mm/day", soilMoisture: "m³/m³" },
      daily: raw.daily.time.map((time, i) => ({
        date: new Date((time + raw.utc_offset_seconds) * 1000).toISOString().slice(0, 10),
        temperatureMin: raw.daily.temperature_2m_min[i], temperatureMax: raw.daily.temperature_2m_max[i],
        precipitation: raw.daily.precipitation_sum[i], referenceEvapotranspiration: raw.daily.et0_fao_evapotranspiration[i] ??
          (raw.daily.temperature_2m_min[i] != null && raw.daily.temperature_2m_max[i] != null
            ? calculateHargreavesEt0({ latitudeDeg: coordinate[1], dateIso: new Date((time + raw.utc_offset_seconds) * 1000).toISOString().slice(0,10), tempMinC: raw.daily.temperature_2m_min[i]!, tempMaxC: raw.daily.temperature_2m_max[i]! }) : null),
        soilMoisture: null,
      })),
    });
    const data = {
      snapshot, queryCoordinate: coordinate, gridCoordinate: CoordinateSchema.parse([raw.longitude, raw.latitude]),
    };
    return { ...success("weather", data, validFrom, [
      "Regional model estimate, not a field sensor measurement. Grid coordinates can differ from the query point.",
      "Daily soil moisture is unavailable from this request.",
      "The forecast response does not expose a model-run timestamp; modelRunAt remains null.",
    ], fetchedAt), expiresAt };
  });
  // Personal field identifiers and full-precision coordinates never enter the shared provider cache.
  result.data.snapshot = WeatherSnapshotSchema.parse({ ...result.data.snapshot, fieldId: params.fieldId,
    coordinate: [params.longitude, params.latitude] });
  return result;
}
