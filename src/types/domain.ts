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

export const LocaleSchema = z.enum(["en", "mr"]);
export type Locale = z.infer<typeof LocaleSchema>;
export const LandUnitSchema = z.enum(["acres", "gunthas"]);
export type LandUnit = z.infer<typeof LandUnitSchema>;
export const LifecycleStageSchema = z.enum(["planned", "vegetative", "flowering_fruiting", "harvesting"]);
export type LifecycleStage = z.infer<typeof LifecycleStageSchema>;
export const GrowthStageSchema = z.enum(["initial", "development", "mid-season", "late-season", "unknown"]);
export type GrowthStage = z.infer<typeof GrowthStageSchema>;
export function lifecycleToGrowthStage(stage: LifecycleStage): Exclude<GrowthStage, "unknown"> {
  return ({ planned: "initial", vegetative: "development", flowering_fruiting: "mid-season", harvesting: "late-season" } as const)[stage];
}
export function growthToLifecycleStage(stage: GrowthStage): LifecycleStage {
  return ({ initial: "planned", unknown: "planned", development: "vegetative", "mid-season": "flowering_fruiting", "late-season": "harvesting" } as const)[stage];
}
export const NutrientLevelSchema = z.enum(["low", "medium", "high"]);
export type NutrientLevel = z.infer<typeof NutrientLevelSchema>;
export const OptionalNutrientLevelSchema = z.enum(["low", "medium", "high", "untested"]);
export type OptionalNutrientLevel = z.infer<typeof OptionalNutrientLevelSchema>;
export const SalinityLevelSchema = z.enum(["normal", "elevated", "high", "untested"]);
export type SalinityLevel = z.infer<typeof SalinityLevelSchema>;
export const MoistureLevelSchema = z.enum(["dry", "moist", "wet", "untested"]);
export type MoistureLevel = z.infer<typeof MoistureLevelSchema>;
export const SoilDataStatusSchema = z.enum(["screening", "simulated", "lab_validated"]);
export type SoilDataStatus = z.infer<typeof SoilDataStatusSchema>;
export const SoilBlueIntensitySchema = z.number().int().min(1).max(5);
export const NitrogenMethodSchema = z.enum(["direct_h2so4", "back_titration_naoh"]);
export type NitrogenMethod = z.infer<typeof NitrogenMethodSchema>;

const positive = z.number().finite().positive();
const percent = z.number().finite().min(0).max(100);
export const SoilLabCalculationSchema = z.object({
  nitrogenMethod: NitrogenMethodSchema.optional(),
  nitrogenBlankMl: nonnegative.optional(),
  nitrogenSampleTrial1Ml: nonnegative.optional(),
  nitrogenSampleTrial2Ml: nonnegative.optional(),
  phosphorusAbsorbance: z.number().finite().optional(),
  phosphorusConcentrationMgPerL: nonnegative.optional(),
  phosphorusMgPerKg: nonnegative.optional(),
  phosphorusExtractVolumeMl: positive.optional(),
  phosphorusSoilMassG: positive.optional(),
  phosphorusHaFactor: positive.optional(),
  tcs3200RawUs: z.object({ r: nonnegative, g: nonnegative, b: nonnegative }).optional(),
  tcs3200RelativeScore: percent.optional(),
});

const legacySoilKitReadingSchema = z.object({
  kitType: z.enum(["balram_inhouse", "commercial_rapid", "soil_health_card"]), ph: z.number().finite().min(3.5).max(10.5),
  nitrogenLevel: NutrientLevelSchema, phosphorusLevel: NutrientLevelSchema,
  potassiumLevel: OptionalNutrientLevelSchema, organicCarbon: OptionalNutrientLevelSchema,
  salinity: SalinityLevelSchema, testedAt: z.string().date(),
  nitrogenKgPerHa: nonnegative.max(2000).nullable().default(null),
  phosphorusKgPerHa: nonnegative.max(500).nullable().default(null),
});
const soilHardwareFields = z.object({
  moistureLevel: MoistureLevelSchema.default("untested"),
  moisturePercent: percent.nullable().default(null),
  phosphorusBlueIntensity: SoilBlueIntensitySchema.nullable().default(null),
  dataStatus: SoilDataStatusSchema.default("screening"),
  labCalculation: SoilLabCalculationSchema.nullable().default(null),
});
export const SoilKitReadingSchema = legacySoilKitReadingSchema.extend(soilHardwareFields.shape);
// Existing callers can still construct the v6 shape. Parsing fills in the hardware fields.
export interface SoilKitReading extends
  z.infer<typeof legacySoilKitReadingSchema>, z.input<typeof soilHardwareFields> {}

export const CheckInEventSchema = z.enum(["none", "heavy_rain", "hail", "heat_wave", "cold_night", "water_shortage"]);
export type CheckInEvent = z.infer<typeof CheckInEventSchema>;
export const CheckInSchema = z.object({
  id,
  date: z.string().date(),
  plotId: id.nullable(),
  stage: LifecycleStageSchema.nullable(),
  event: CheckInEventSchema,
  note: z.string().trim().max(280).default(""),
});
export interface CheckIn extends z.infer<typeof CheckInSchema> {}

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

export const MAX_FARM_PROFILES = 6;
export const MAX_PROFILE_NAME_LENGTH = 30;

export const ProfileOriginSchema = z.enum(["blank", "sample_copy", "imported"]);
export type ProfileOrigin = z.infer<typeof ProfileOriginSchema>;

export const ProfileMetaSchema = z.object({
  id,
  name: FarmProfileSchema.shape.name,
  createdAt: timestamp,
  updatedAt: timestamp,
  origin: ProfileOriginSchema.default("blank"),
});
export type ProfileMeta = z.infer<typeof ProfileMetaSchema>;

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
  plotId: id.optional(), plotName: z.string().trim().min(1).max(60).optional(),
  areaGunthas: z.number().finite().positive().max(400_000).nullable().optional(),
  lifecycleStage: LifecycleStageSchema.optional(),
  cropId: id,
  percentage: z.number().finite().positive().max(100),
  season: z.enum(["kharif", "rabi", "zaid", "perennial"]),
  growthStage: z.enum(["initial", "development", "mid-season", "late-season", "unknown"]),
  plantingDate: z.string().date().nullable(),
});
export interface CropAllocation extends z.infer<typeof CropAllocationSchema> {}

export const CropAllocationsSchema = z.array(CropAllocationSchema).max(50).superRefine((items, ctx) => {
  if (items.some((item) => Math.abs(item.percentage * 100 - Math.round(item.percentage * 100)) > 1e-8)) {
    ctx.addIssue({ code: "custom", message: "Crop percentages support at most two decimal places." });
  }
  const points = items.reduce((sum, item) => sum + Math.round(item.percentage * 100), 0);
  const plotMode = items.some((item) => item.plotId !== undefined || item.areaGunthas !== undefined);
  if (points > 10_000 || (!plotMode && items.length > 0 && points !== 10_000)) {
    ctx.addIssue({ code: "custom", message: plotMode ? "Plot allocations cannot exceed 100%." : "Crop allocations must total 100%." });
  }
  if (!plotMode && new Set(items.map((item) => item.cropId)).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "Each crop must appear only once in percentage mode." });
  }
  const plotIds = items.flatMap((item) => item.plotId === undefined ? [] : [item.plotId]);
  if (new Set(plotIds).size !== plotIds.length) {
    ctx.addIssue({ code: "custom", message: "Each plot ID must be unique." });
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

export const SoilDataSchema = z.object({
  queryCoordinate: CoordinateSchema,
  gridCoordinate: CoordinateSchema,
  depthCm: z.tuple([z.literal(0), z.literal(5)]),
  properties: z.array(z.object({
    property: z.enum(["clay", "sand", "silt"]),
    mean: z.number().finite().min(0).max(100).nullable().default(null),
    unit: z.literal("%"),
  })).max(3).refine((items) => new Set(items.map((item) => item.property)).size === items.length),
});
export const SoilSnapshotSchema = z.object({
  fieldId: id, coordinate: CoordinateSchema, source: z.string().min(1).max(200),
  fetchedAt: timestamp, validAt: timestamp.nullable(), expiresAt: timestamp,
  data: SoilDataSchema,
});
export interface SoilSnapshot extends z.infer<typeof SoilSnapshotSchema> {}

export const DataSourceStatusSchema = z.object({
  provider: z.enum(["weather", "soil"]),
  state: z.enum(["idle", "loading", "success", "stale", "error"]),
  provenance: z.enum(["unavailable", "modelled", "sample"]),
  requestId: id.nullable(),
  updatedAt: timestamp.nullable(),
  error: z.string().max(300).nullable(),
});
export interface DataSourceStatus extends z.infer<typeof DataSourceStatusSchema> {}

export const StashedFarmSchema = z.object({
  farmProfile: FarmProfileSchema.nullable(),
  fieldGeometry: FieldGeometrySchema.nullable(),
  cropAllocations: CropAllocationsSchema,
  irrigationSetup: IrrigationSetupSchema.nullable(),
  weatherSnapshot: WeatherSnapshotSchema.nullable(),
  soilSnapshot: SoilSnapshotSchema.nullable().default(null),
  planningUpdatedAt: timestamp.nullable().default(null),
  soilKitReading: SoilKitReadingSchema.nullable().default(null),
  soilSkipped: z.boolean().default(false),
  setupCompletedAt: z.string().date().nullable().default(null),
  checkIns: z.array(CheckInSchema).max(104).default([]),
});
export type StashedFarm = z.infer<typeof StashedFarmSchema>;

export const PersistedFarmSchema = StashedFarmSchema.extend({
  sampleDataActive: z.boolean(),
  locale: LocaleSchema.default("en"),
  landUnit: LandUnitSchema.default("acres"),
  profiles: z.array(ProfileMetaSchema).max(MAX_FARM_PROFILES).default([]),
  activeProfileId: id.nullable().default(null),
  farmStash: z.record(id, StashedFarmSchema).default({}),
}).superRefine((value, ctx) => {
  const profileIds = new Set(value.profiles.map((profile) => profile.id));
  if (profileIds.size !== value.profiles.length) {
    ctx.addIssue({ code: "custom", path: ["profiles"], message: "Profile IDs must be unique." });
  }
  if (!value.sampleDataActive && value.activeProfileId !== null && !profileIds.has(value.activeProfileId)) {
    ctx.addIssue({ code: "custom", path: ["activeProfileId"], message: "The active profile must exist." });
  }
  for (const profileId of Object.keys(value.farmStash)) {
    if (!profileIds.has(profileId)) {
      ctx.addIssue({ code: "custom", path: ["farmStash", profileId], message: "A stashed farm must belong to a profile." });
    }
  }
  const weather = value.weatherSnapshot;
  const field = value.fieldGeometry;
  const soil = value.soilSnapshot;
  if (soil && (!field || soil.fieldId !== field.fieldId || soil.coordinate[0] !== field.center[0] ||
      soil.coordinate[1] !== field.center[1] || value.sampleDataActive)) {
    ctx.addIssue({ code: "custom", message: "Soil data must belong to the selected real field." });
  }
  if (weather && (!field || weather.fieldId !== field.fieldId ||
    weather.coordinate[0] !== field.center[0] || weather.coordinate[1] !== field.center[1])) {
    ctx.addIssue({ code: "custom", message: "Weather must belong to the selected field and location." });
  }
  if (weather && (weather.provenance === "sample") !== value.sampleDataActive) {
    ctx.addIssue({ code: "custom", message: "Sample weather requires sample mode." });
  }
});
export interface PersistedFarm extends z.infer<typeof PersistedFarmSchema> {}
