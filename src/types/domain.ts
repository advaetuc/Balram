import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const timestamp = z.string().datetime({ offset: true });
const nonnegative = z.number().finite().nonnegative();
const fraction = z.number().finite().min(0).max(1);

/** WGS84 GeoJSON order: longitude, latitude. All domain values are JSON-safe. */
export const CoordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export type Coordinate = z.infer<typeof CoordinateSchema>;

function cross(a: Coordinate, b: Coordinate, c: Coordinate): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Coordinate, b: Coordinate, p: Coordinate): boolean {
  return cross(a, b, p) === 0 &&
    p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

function intersects(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

const ring = z.array(CoordinateSchema).min(4).max(1001).superRefine((points, ctx) => {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return;
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (first[0] !== last[0] || first[1] !== last[1]) {
    fail("The polygon ring must be closed.");
    return;
  }
  const vertices = points.slice(0, -1);
  if (new Set(vertices.map((p) => p.join(","))).size !== vertices.length) {
    fail("Polygon vertices must be distinct.");
    return;
  }
  let signedArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    signedArea += cross(first, a, b);
    if (Math.abs(a[0] - b[0]) > 180) {
      fail("Split antimeridian-crossing boundaries before use.");
      return;
    }
    const next = points[(i + 2) % vertices.length];
    if (cross(a, b, next) === 0 && (onSegment(a, b, next) || onSegment(b, next, a))) {
      fail("Polygon edges must not overlap.");
      return;
    }
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      if (intersects(a, b, points[j], points[j + 1])) {
        fail("Polygon edges must not intersect.");
        return;
      }
    }
  }
  if (signedArea === 0) fail("The polygon must enclose an area.");
});

export const FarmProfileSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100).nullable(),
  locale: z.enum(["en", "mr"]),
  timezone: z.literal("Asia/Kolkata"),
  updatedAt: timestamp,
});
export interface FarmProfile extends z.infer<typeof FarmProfileSchema> {}

export const FieldGeometrySchema = z.object({
  fieldId: id,
  /** Explicit weather query point; a centroid is not a field-scale measurement. */
  center: CoordinateSchema,
  // Phase 1 supports a single exterior ring. Reject holes rather than miscounting area.
  boundary: z.object({ type: z.literal("Polygon"), coordinates: z.tuple([ring]) }).nullable(),
  areaSquareMetres: z.number().finite().positive().nullable(),
});
export interface FieldGeometry extends z.infer<typeof FieldGeometrySchema> {}

export const CropAllocationSchema = z.object({
  cropId: id,
  percentage: z.number().finite().positive().max(100),
  season: z.enum(["kharif", "rabi", "zaid", "perennial"]),
  growthStage: z.enum(["initial", "development", "mid-season", "late-season", "unknown"]),
  plantingDate: z.string().date().nullable(),
});
export interface CropAllocation extends z.infer<typeof CropAllocationSchema> {}

export const CropAllocationsSchema = z.array(CropAllocationSchema).max(50).superRefine((items, ctx) => {
  if (items.length && Math.abs(items.reduce((sum, item) => sum + item.percentage, 0) - 100) > 1e-6) {
    ctx.addIssue({ code: "custom", message: "Crop allocations must total 100%." });
  }
  if (new Set(items.map((item) => item.cropId)).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "Each crop must appear only once." });
  }
});

export const IrrigationSetupSchema = z.object({
  method: z.enum(["drip", "sprinkler", "surface", "rainfed", "unknown"]),
  systemFlowLitresPerHour: z.number().finite().positive().nullable(),
  applicationEfficiency: z.number().finite().positive().max(1).nullable(),
  flowConfirmedByFarmer: z.boolean(),
}).refine((value) => !value.flowConfirmedByFarmer || (
  value.systemFlowLitresPerHour !== null && value.applicationEfficiency !== null &&
  value.method !== "rainfed" && value.method !== "unknown"
), { message: "Confirmed irrigation requires a method, measured system flow and efficiency." });
export interface IrrigationSetup extends z.infer<typeof IrrigationSetupSchema> {}

export const WeatherSnapshotSchema = z.object({
  fieldId: id,
  coordinate: CoordinateSchema,
  source: z.string().trim().min(1).max(200),
  provenance: z.enum(["modelled", "sample"]),
  fetchedAt: timestamp,
  modelRunAt: timestamp.nullable(),
  validFrom: timestamp,
  validTo: timestamp,
  expiresAt: timestamp,
  timezone: z.literal("Asia/Kolkata"),
  units: z.object({
    temperature: z.literal("°C"),
    precipitation: z.literal("mm"),
    referenceEvapotranspiration: z.literal("mm/day"),
    soilMoisture: z.literal("m³/m³"),
  }),
  daily: z.array(z.object({
    date: z.string().date(),
    temperatureMin: z.number().finite().nullable(),
    temperatureMax: z.number().finite().nullable(),
    precipitation: nonnegative.nullable(),
    referenceEvapotranspiration: nonnegative.nullable(),
    soilMoisture: fraction.nullable(),
  }).refine((day) => day.temperatureMin === null || day.temperatureMax === null ||
    day.temperatureMin <= day.temperatureMax, { message: "Minimum temperature exceeds maximum." })).min(1).max(16),
}).superRefine((value, ctx) => {
  if (Date.parse(value.validTo) <= Date.parse(value.validFrom) ||
      Date.parse(value.expiresAt) < Date.parse(value.fetchedAt)) {
    ctx.addIssue({ code: "custom", message: "Invalid weather validity or freshness window." });
  }
  if (value.daily.some((day, i) => i > 0 && day.date <= value.daily[i - 1].date)) {
    ctx.addIssue({ code: "custom", message: "Forecast dates must be unique and increasing." });
  }
});
export interface WeatherSnapshot extends z.infer<typeof WeatherSnapshotSchema> {}

export const DataSourceStatusSchema = z.object({
  provider: z.literal("weather"),
  state: z.enum(["idle", "loading", "success", "stale", "error"]),
  provenance: z.enum(["unavailable", "modelled", "sample"]),
  requestId: id.nullable(),
  updatedAt: timestamp.nullable(),
  error: z.string().max(300).nullable(),
});
export interface DataSourceStatus extends z.infer<typeof DataSourceStatusSchema> {}

export const PersistedFarmSchema = z.object({
  farmProfile: FarmProfileSchema.nullable(),
  fieldGeometry: FieldGeometrySchema.nullable(),
  cropAllocations: CropAllocationsSchema,
  irrigationSetup: IrrigationSetupSchema.nullable(),
  weatherSnapshot: WeatherSnapshotSchema.nullable(),
  sampleDataActive: z.boolean(),
}).superRefine((value, ctx) => {
  const weather = value.weatherSnapshot;
  const field = value.fieldGeometry;
  if (weather && (!field || weather.fieldId !== field.fieldId ||
    weather.coordinate[0] !== field.center[0] || weather.coordinate[1] !== field.center[1])) {
    ctx.addIssue({ code: "custom", message: "Weather must belong to the selected field and location." });
  }
  if (weather && (weather.provenance === "sample") !== value.sampleDataActive) {
    ctx.addIssue({ code: "custom", message: "Sample weather requires sample mode." });
  }
});
export interface PersistedFarm extends z.infer<typeof PersistedFarmSchema> {}
