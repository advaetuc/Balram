import { PersistedFarmSchema, type PersistedFarm } from "@/types/domain";

export function createEmptyFixture(): PersistedFarm {
  return {
    farmProfile: null,
    fieldGeometry: null,
    cropAllocations: [],
    irrigationSetup: null,
    weatherSnapshot: null,
    soilSnapshot: null,
    planningUpdatedAt: null,
    sampleDataActive: false,
  };
}

/** Fixed timestamps and fresh object graphs make demos reproducible and isolated. */
export function createSampleFixture(): PersistedFarm {
  return PersistedFarmSchema.parse({
    farmProfile: {
      id: "sample-farm", name: "Sample farm · Pune", district: "Pune",
      locale: "en", timezone: "Asia/Kolkata", updatedAt: "2026-10-01T06:00:00+05:30",
    },
    fieldGeometry: {
      fieldId: "sample-field", center: [73.8567, 18.5204],
      boundary: null, areaSquareMetres: 8093.7128448,
    },
    cropAllocations: [
      { cropId: "bajra", percentage: 60, season: "kharif", growthStage: "late-season", plantingDate: "2026-06-20" },
      { cropId: "groundnut", percentage: 40, season: "kharif", growthStage: "late-season", plantingDate: "2026-06-22" },
    ],
    irrigationSetup: {
      method: "drip", systemFlowLitresPerHour: null,
      applicationEfficiency: null, flowConfirmedByFarmer: false,
    },
    weatherSnapshot: {
      fieldId: "sample-field", coordinate: [73.8567, 18.5204],
      source: "Balram deterministic fixture", provenance: "sample",
      fetchedAt: "2026-10-01T06:00:00+05:30", modelRunAt: null,
      validFrom: "2026-10-01T00:00:00+05:30", validTo: "2026-10-04T00:00:00+05:30",
      expiresAt: "2026-10-01T06:30:00+05:30", timezone: "Asia/Kolkata",
      units: { temperature: "°C", precipitation: "mm", referenceEvapotranspiration: "mm/day", soilMoisture: "m³/m³" },
      daily: [
        { date: "2026-10-01", temperatureMin: 21, temperatureMax: 30, precipitation: 2, referenceEvapotranspiration: 4.1, soilMoisture: 0.29 },
        { date: "2026-10-02", temperatureMin: 20, temperatureMax: 31, precipitation: 0, referenceEvapotranspiration: 4.4, soilMoisture: 0.28 },
        { date: "2026-10-03", temperatureMin: 22, temperatureMax: 29, precipitation: 5, referenceEvapotranspiration: null, soilMoisture: null },
      ],
    },
    sampleDataActive: true,
  });
}
