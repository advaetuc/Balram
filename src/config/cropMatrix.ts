export type Season = "Kharif" | "Rabi" | "Zaid" | "Perennial";
export interface CropThresholds {
  readonly id: string;
  readonly name: string;
  readonly season: Season;
  readonly baseKc: number;
  readonly minSoilMoisture: number;
  readonly maxAirTemp: number;
  readonly frostSensitive: boolean;
  readonly dripEfficiency: number;
}

export const CROP_RULE_PROVENANCE = Object.freeze({
  version: "blueprint-1",
  source: "balram_agritech_app_research.md — Complete cropMatrix.ts Configuration",
  kcStage: "mid-season",
  soilContext: "Vertisol planning thresholds; not universal field triggers",
  soilMoistureUnit: "m³/m³",
  temperatureUnit: "°C",
  reviewedForFieldAdvice: false,
  note: "Confirm local soil, crop stage and measured system efficiency before operational use. Modelled shallow moisture is not a root-zone measurement.",
});

export const MaharashtraCropMatrix = Object.freeze({
  sugarcane: Object.freeze({ id: "sugarcane", name: "Sugarcane", season: "Perennial", baseKc: 1.25, minSoilMoisture: 0.38, maxAirTemp: 38, frostSensitive: false, dripEfficiency: 0.90 }),
  rabi_jowar: Object.freeze({ id: "rabi_jowar", name: "Rabi Jowar", season: "Rabi", baseKc: 0.75, minSoilMoisture: 0.18, maxAirTemp: 35, frostSensitive: false, dripEfficiency: 0.85 }),
  onion: Object.freeze({ id: "onion", name: "Onion", season: "Rabi", baseKc: 1.05, minSoilMoisture: 0.28, maxAirTemp: 32, frostSensitive: true, dripEfficiency: 0.90 }),
  bajra: Object.freeze({ id: "bajra", name: "Bajra", season: "Kharif", baseKc: 0.85, minSoilMoisture: 0.12, maxAirTemp: 40, frostSensitive: false, dripEfficiency: 0.85 }),
  pomegranate: Object.freeze({ id: "pomegranate", name: "Pomegranate", season: "Perennial", baseKc: 0.65, minSoilMoisture: 0.25, maxAirTemp: 42, frostSensitive: false, dripEfficiency: 0.95 }),
  groundnut: Object.freeze({ id: "groundnut", name: "Groundnut", season: "Kharif", baseKc: 0.95, minSoilMoisture: 0.20, maxAirTemp: 36, frostSensitive: false, dripEfficiency: 0.85 }),
} satisfies Record<string, CropThresholds>);
export type CropId = keyof typeof MaharashtraCropMatrix;
