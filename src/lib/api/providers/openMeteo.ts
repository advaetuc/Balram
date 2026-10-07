import { z } from "zod";
import { INDIA_TIMEZONE, PROVIDERS } from "@/config/providers";
import { CoordinateSchema, WeatherSnapshotSchema } from "@/types/domain";
import { success } from "@/types/api";
import { fetchJson } from "../http";
import { cachedRequest, LocationInputSchema, queryCoordinate } from "../server";

const number = z.number().finite();
const epoch = number.int().min(0).max(253402300799);
const readings = <T extends z.ZodTypeAny>(item: T) => z.array(item.nullable()).min(1).max(384);
const HourlySchema = z.object({
  time: z.array(epoch).min(1).max(384),
  temperature_2m: readings(number),
  relative_humidity_2m: readings(number.min(0).max(100)),
  precipitation: readings(number.nonnegative()),
  wind_speed_10m: readings(number.nonnegative()),
  et0_fao_evapotranspiration: readings(number.nonnegative()),
  soil_temperature_6cm: readings(number),
  soil_moisture_0_to_1cm: readings(number.min(0).max(1)),
});
const DailySchema = z.object({
  time: z.array(epoch).min(1).max(7),
  temperature_2m_min: readings(number), temperature_2m_max: readings(number),
  precipitation_sum: readings(number.nonnegative()), et0_fao_evapotranspiration: readings(number.nonnegative()),
});

export const OpenMeteoResponseSchema = z.object({
  latitude: number.min(-90).max(90), longitude: number.min(-180).max(180),
  timezone: z.enum(["Asia/Kolkata", "Asia/Calcutta"]), utc_offset_seconds: z.literal(19800),
  hourly_units: z.object({ time: z.literal("unixtime"), temperature_2m: z.literal("°C"),
    relative_humidity_2m: z.literal("%"), precipitation: z.literal("mm"), wind_speed_10m: z.literal("km/h"),
    et0_fao_evapotranspiration: z.literal("mm"), soil_temperature_6cm: z.literal("°C"), soil_moisture_0_to_1cm: z.literal("m³/m³") }),
  daily_units: z.object({ time: z.literal("unixtime"), temperature_2m_min: z.literal("°C"), temperature_2m_max: z.literal("°C"),
    precipitation_sum: z.literal("mm"), et0_fao_evapotranspiration: z.literal("mm") }),
  hourly: HourlySchema, daily: DailySchema,
}).superRefine((payload, ctx) => {
  for (const [group, step] of [[payload.hourly, 3600], [payload.daily, 86400]] as const) {
    if (Object.values(group).some((values) => values.length !== group.time.length) ||
      group.time.some((value, i) => i > 0 && value - group.time[i - 1] !== step)) {
      ctx.addIssue({ code: "custom", message: "Weather time series are not aligned." });
    }
  }
  if (payload.hourly.time[0] !== payload.daily.time[0] || payload.hourly.time.length !== payload.daily.time.length * 24) {
    ctx.addIssue({ code: "custom", message: "Expected complete hourly coverage for each forecast day." });
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
      timeformat: "unixtime", forecast_days: "7", temperature_unit: "celsius", precipitation_unit: "mm", wind_speed_unit: "kmh",
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration",
      hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,et0_fao_evapotranspiration,soil_temperature_6cm,soil_moisture_0_to_1cm",
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
        precipitation: raw.daily.precipitation_sum[i], referenceEvapotranspiration: raw.daily.et0_fao_evapotranspiration[i],
        soilMoisture: null,
      })),
    });
    const data = {
      snapshot, queryCoordinate: coordinate, gridCoordinate: CoordinateSchema.parse([raw.longitude, raw.latitude]),
      hourlyUnits: { temperature: "°C", humidity: "%", precipitation: "mm", windSpeed: "km/h", referenceEvapotranspiration: "mm/hour", soilMoisture: "m³/m³" },
      soilTemperatureDepthCm: 6, soilMoistureDepthCm: [0, 1] as [number, number],
      hourly: raw.hourly.time.map((time, i) => ({
        validAt: new Date(time * 1000).toISOString(), temperature: raw.hourly.temperature_2m[i],
        relativeHumidity: raw.hourly.relative_humidity_2m[i], precipitation: raw.hourly.precipitation[i],
        windSpeed: raw.hourly.wind_speed_10m[i], referenceEvapotranspiration: raw.hourly.et0_fao_evapotranspiration[i],
        soilTemperature: raw.hourly.soil_temperature_6cm[i], soilMoisture: raw.hourly.soil_moisture_0_to_1cm[i],
      })),
    };
    return { ...success("weather", data, validFrom, [
      "Regional model estimate, not a field sensor measurement. Grid coordinates can differ from the query point.",
      "Shallow soil layers are not root-zone measurements. Daily soil moisture is unavailable; see depth-labelled hourly values.",
      "The forecast response does not expose a model-run timestamp; modelRunAt remains null.",
    ], fetchedAt), expiresAt };
  });
  // Personal field identifiers and full-precision coordinates never enter the shared provider cache.
  result.data.snapshot = WeatherSnapshotSchema.parse({ ...result.data.snapshot, fieldId: params.fieldId,
    coordinate: [params.longitude, params.latitude] });
  return result;
}
