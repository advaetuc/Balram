import type { NutrientLevel, SoilKitReading } from "@/types/domain";
import {
  ALKALINE_KMNO4_N_LOW_MAX, OLSEN_P_LOW_MAX,
  classifyNitrogenKgPerHa, classifyPhosphorusKgPerHa, interpretSoilKitReading,
  type SoilPhCategory,
} from "../soilKit";

interface GaugeZone {
  min: number;
  max: number;
  band: SoilPhCategory | NutrientLevel;
}

const phZones: readonly GaugeZone[] = [
  { min: 3.5, max: 5.8, band: "strongly_acidic" },
  { min: 5.8, max: 6.5, band: "slightly_acidic" },
  { min: 6.5, max: 7.5, band: "optimal_neutral" },
  { min: 7.5, max: 8.2, band: "moderately_alkaline" },
  { min: 8.2, max: 10.5, band: "strongly_alkaline" },
];

function nutrientZones(lowMax: number, mediumMax: number, max: number): readonly GaugeZone[] {
  return [
    { min: 0, max: lowMax, band: "low" },
    { min: lowMax, max: mediumMax, band: "medium" },
    { min: mediumMax, max, band: "high" },
  ];
}

const nitrogenZones = nutrientZones(ALKALINE_KMNO4_N_LOW_MAX, 560, 700);
const phosphorusZones = nutrientZones(OLSEN_P_LOW_MAX, 25, 40);

function gauge(zones: readonly GaugeZone[], value: number | null, band: GaugeZone["band"]) {
  const min = zones[0].min;
  const max = zones[zones.length - 1].max;
  return {
    min, max, zones,
    pinPercent: value === null ? null : Math.min(100, Math.max(0, (value - min) / (max - min) * 100)),
    highlightedBandIndex: zones.findIndex((zone) => zone.band === band),
  };
}

export function buildSoilGauges(reading: SoilKitReading) {
  const { ph, nitrogenKgPerHa, phosphorusKgPerHa } = reading;
  return {
    ph: { ...gauge(phZones, ph, interpretSoilKitReading(reading).phCategory), vertisolBand: [7.8, 8.4] as const },
    nitrogen: gauge(nitrogenZones, nitrogenKgPerHa,
      nitrogenKgPerHa === null ? reading.nitrogenLevel : classifyNitrogenKgPerHa(nitrogenKgPerHa)),
    phosphorus: gauge(phosphorusZones, phosphorusKgPerHa,
      phosphorusKgPerHa === null ? reading.phosphorusLevel : classifyPhosphorusKgPerHa(phosphorusKgPerHa)),
  };
}
