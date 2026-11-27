import type { MoistureLevel, NitrogenMethod, NutrientLevel } from "@/types/domain";

export const SOIL_PRESET_RANGES = {
  ph: { min: 3.5, max: 10.5, slightlyAcidicMin: 5.8, neutralMin: 6.5, neutralMax: 7.5, moderatelyAlkalineMax: 8.2 },
  moisture: { min: 0, max: 100, moistMin: 30, moistMax: 65 },
  nitrogen: { mediumMin: 280, mediumMax: 560 },
  phosphorus: { mediumMin: 10, mediumMax: 25 },
  blueIntensity: { low: [1, 2], medium: [3, 3], high: [4, 5] },
} as const;

export const AVAILABLE_NITROGEN_FACTOR = 31.36;
export const OLSEN_PHOSPHORUS_DEFAULTS = {
  slope: 0.249,
  intercept: 0.020,
  extractVolumeMl: 50,
  soilMassG: 2.5,
  haFactor: 1.995,
} as const;

export function classifyNutrientKgPerHa(nutrient: "nitrogen" | "phosphorus", value: number): NutrientLevel {
  const { mediumMin, mediumMax } = SOIL_PRESET_RANGES[nutrient];
  if (value < mediumMin) return "low";
  return value <= mediumMax ? "medium" : "high";
}

interface NitrogenInput {
  method?: NitrogenMethod;
  blankMl: number;
  sampleTrial1Ml: number;
  sampleTrial2Ml?: number;
}

interface NitrogenDisplay {
  sampleTitreMl: number | null;
  blankTitreMl: number | null;
  lcd: { screen1: readonly [string, string]; screen2: readonly [string, string] };
}

type NitrogenResult = NitrogenDisplay & (
  | {
      ok: true;
      sampleTitreMl: number;
      blankTitreMl: number;
      correctedTitreMl: number;
      nitrogenKgPerHa: number;
      nitrogenKgPerHaExact: number;
      level: NutrientLevel;
    }
  | {
      ok: false;
      error: "invalid_titres";
      correctedTitreMl: null;
      nitrogenKgPerHa: null;
      nitrogenKgPerHaExact: null;
      level: null;
    }
);

function isNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function calculateAvailableNitrogen({
  method = "direct_h2so4", blankMl, sampleTrial1Ml, sampleTrial2Ml,
}: NitrogenInput): NitrogenResult {
  const secondTrial = sampleTrial2Ml ?? sampleTrial1Ml;
  const sampleTitreMl = isNonnegative(sampleTrial1Ml) && isNonnegative(secondTrial)
    ? sampleTrial1Ml + (secondTrial - sampleTrial1Ml) / 2
    : null;
  const blankTitreMl = isNonnegative(blankMl) ? blankMl : null;
  const isDirect = method === "direct_h2so4";
  if (sampleTitreMl !== null && blankTitreMl !== null) {
    const correctedTitreMl = isDirect ? sampleTitreMl - blankTitreMl : blankTitreMl - sampleTitreMl;
    const nitrogenKgPerHaExact = correctedTitreMl * AVAILABLE_NITROGEN_FACTOR;
    if (isNonnegative(nitrogenKgPerHaExact)) {
      const displayValue = nitrogenKgPerHaExact.toFixed(2);
      const level = classifyNutrientKgPerHa("nitrogen", nitrogenKgPerHaExact);
      return {
        ok: true, sampleTitreMl, blankTitreMl, correctedTitreMl, nitrogenKgPerHaExact,
        nitrogenKgPerHa: Number(displayValue), level,
        lcd: {
          screen1: [`B: ${blankTitreMl.toFixed(2)} mL`, `S: ${sampleTitreMl.toFixed(2)} mL`],
          screen2: [`N: ${displayValue} kg/ha`, level.toUpperCase()],
        },
      };
    }
  }
  return {
    ok: false, error: "invalid_titres", sampleTitreMl, blankTitreMl, correctedTitreMl: null,
    nitrogenKgPerHa: null, nitrogenKgPerHaExact: null, level: null,
    lcd: {
      screen1: ["INVALID INPUT", isDirect ? "Check S and B" : "Check B and S"],
      screen2: ["", ""],
    },
  };
}

interface OlsenPhosphorusInput {
  absorbance: number;
  slope?: number;
  intercept?: number;
  extractVolumeMl?: number;
  soilMassG?: number;
  haFactor?: number;
}

type OlsenPhosphorusResult =
  | {
      ok: true;
      concentrationMgPerL: number;
      phosphorusMgPerKg: number;
      phosphorusKgPerHa: number;
      phosphorusKgPerHaReported: number;
      level: NutrientLevel;
    }
  | { ok: false; error: "invalid_input" | "below_intercept" };

export function calculateOlsenPhosphorus({
  absorbance,
  slope = OLSEN_PHOSPHORUS_DEFAULTS.slope,
  intercept = OLSEN_PHOSPHORUS_DEFAULTS.intercept,
  extractVolumeMl = OLSEN_PHOSPHORUS_DEFAULTS.extractVolumeMl,
  soilMassG = OLSEN_PHOSPHORUS_DEFAULTS.soilMassG,
  haFactor = OLSEN_PHOSPHORUS_DEFAULTS.haFactor,
}: OlsenPhosphorusInput): OlsenPhosphorusResult {
  if (!Number.isFinite(absorbance) || !Number.isFinite(intercept) ||
      ![slope, extractVolumeMl, soilMassG, haFactor].every(isPositive)) {
    return { ok: false, error: "invalid_input" };
  }
  if (absorbance < intercept) return { ok: false, error: "below_intercept" };

  const concentrationMgPerL = (absorbance - intercept) / slope;
  const phosphorusMgPerKg = concentrationMgPerL * extractVolumeMl / soilMassG;
  const phosphorusKgPerHa = phosphorusMgPerKg * haFactor;
  if (!Number.isFinite(phosphorusKgPerHa)) return { ok: false, error: "invalid_input" };

  // BAL-P-01 uses the rounded mg/kg result in its worked example.
  const reportedKgPerHa = Number(phosphorusMgPerKg.toFixed(2)) * haFactor;
  return {
    ok: true, concentrationMgPerL, phosphorusMgPerKg, phosphorusKgPerHa,
    phosphorusKgPerHaReported: Number(reportedKgPerHa.toFixed(2)),
    level: classifyNutrientKgPerHa("phosphorus", phosphorusKgPerHa),
  };
}

export type SoilBlueIntensity = 1 | 2 | 3 | 4 | 5;

export function blueIntensityToLevel(intensity: SoilBlueIntensity): NutrientLevel {
  const { low, medium } = SOIL_PRESET_RANGES.blueIntensity;
  if (intensity <= low[1]) return "low";
  return intensity <= medium[1] ? "medium" : "high";
}

export function levelToDefaultBlueIntensity(level: NutrientLevel): SoilBlueIntensity {
  return ({ low: 2, medium: 3, high: 4 } as const)[level];
}

interface Tcs3200Pulses { rUs: number; gUs: number; bUs: number }
interface Tcs3200Calibration { lowBUs: number; highBUs: number }

type Tcs3200Result = { labValidated: false } & (
  | { status: "calibrated"; score0To100: number; outOfRange: "low" | "high" | null; blueIntensity1To5: SoilBlueIntensity }
  | {
      status: "timeout_invalid" | "uncalibrated" | "invalid_calibration";
      score0To100: null;
      outOfRange: null;
      blueIntensity1To5: null;
    }
);

export function evaluateTcs3200Optical(
  { rUs, gUs, bUs }: Tcs3200Pulses, calibration?: Tcs3200Calibration,
): Tcs3200Result {
  const unscored = { score0To100: null, outOfRange: null, blueIntensity1To5: null, labValidated: false } as const;
  if (![rUs, gUs, bUs].every(isPositive)) return { status: "timeout_invalid", ...unscored };
  if (!calibration) return { status: "uncalibrated", ...unscored };

  const { lowBUs, highBUs } = calibration;
  const lowResponse = 1 / lowBUs;
  const highResponse = 1 / highBUs;
  if (!isPositive(lowBUs) || !isPositive(highBUs) ||
      !isPositive(highResponse - lowResponse)) {
    return { status: "invalid_calibration", ...unscored };
  }

  const rawScore = (1 / bUs - lowResponse) / (highResponse - lowResponse) * 100;
  const score0To100 = Math.min(100, Math.max(0, rawScore));
  const outOfRange = rawScore < 0 ? "low" : rawScore > 100 ? "high" : null;
  const blueIntensity1To5 = ([1, 2, 3, 4, 5] as const)[Math.min(4, Math.floor(score0To100 / 20))];
  return { status: "calibrated", score0To100, outOfRange, blueIntensity1To5, labValidated: false };
}

export function classifyMoisturePercent(percent: number): MoistureLevel {
  const { min, max, moistMin, moistMax } = SOIL_PRESET_RANGES.moisture;
  if (!Number.isFinite(percent) || percent < min || percent > max) return "untested";
  if (percent < moistMin) return "dry";
  return percent <= moistMax ? "moist" : "wet";
}

const labNitrogen = { method: "direct_h2so4", sampleTrial1Ml: 7.8, sampleTrial2Ml: 7.7, blankMl: 0.4 } as const;
const labPhosphorus = { absorbance: 0.211, ...OLSEN_PHOSPHORUS_DEFAULTS };
const arduinoNitrogen = { method: "back_titration_naoh", blankMl: 30, sampleTrial1Ml: 10 } as const;
const demoBPulses = { rUs: 1350, gUs: 1250, bUs: 1000 } as const;
const demoBCalibration = { lowBUs: 2000, highBUs: 2000 / 3 } as const;

export const SOIL_DEMO_PRESETS = {
  lab_procedure_demo: {
    dataStatus: "simulated", ph: 7.1, moisturePercent: 48, moistureLevel: classifyMoisturePercent(48),
    phosphorusBlueIntensity: 4,
    nitrogen: { input: labNitrogen, result: calculateAvailableNitrogen(labNitrogen) },
    phosphorus: { input: labPhosphorus, result: calculateOlsenPhosphorus(labPhosphorus) },
  },
  arduino_lcd_high_n: {
    dataStatus: "simulated", ph: 6.8, moisturePercent: 24, moistureLevel: classifyMoisturePercent(24),
    phosphorusBlueIntensity: 2,
    nitrogen: { input: arduinoNitrogen, result: calculateAvailableNitrogen(arduinoNitrogen) },
  },
  tcs3200_optical_demo: {
    dataStatus: "simulated", ph: 7.4, moisturePercent: 72, moistureLevel: classifyMoisturePercent(72),
    phosphorusBlueIntensity: 3,
    optical: {
      sampleId: "DEMO-B", pulses: demoBPulses, calibration: demoBCalibration,
      result: evaluateTcs3200Optical(demoBPulses, demoBCalibration),
    },
  },
} as const;
