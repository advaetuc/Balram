import assert from "node:assert/strict";
import test from "node:test";
import {
  blueIntensityToLevel,
  calculateAvailableNitrogen,
  calculateOlsenPhosphorus,
  classifyMoisturePercent,
  evaluateTcs3200Optical,
  levelToDefaultBlueIntensity,
  SOIL_DEMO_PRESETS,
} from "../src/lib/domain/soilChemistry";
import { createSoilHealthCardReading, interpretSoilKitReading } from "../src/lib/domain/soilKit";
import { SoilKitReadingSchema, SoilLabCalculationSchema } from "../src/types/domain";

test("BAL-N-01 averages both trials and returns exact nitrogen and a rounded LCD value", () => {
  const result = calculateAvailableNitrogen({
    method: "direct_h2so4", sampleTrial1Ml: 7.8, sampleTrial2Ml: 7.7, blankMl: 0.4,
  });
  assert.ok(result.ok);
  assert.equal(result.sampleTitreMl, 7.75);
  assert.equal(result.blankTitreMl, 0.4);
  assert.equal(result.correctedTitreMl, 7.35);
  assert.ok(Math.abs(result.nitrogenKgPerHaExact - 230.496) < 1e-10);
  assert.equal(result.nitrogenKgPerHa, 230.50);
  assert.equal(result.level, "low");
  assert.deepEqual(result.lcd.screen1, ["B: 0.40 mL", "S: 7.75 mL"]);
  assert.deepEqual(result.lcd.screen2, ["N: 230.50 kg/ha", "LOW"]);
});

test("direct nitrogen accepts one trial and zero correction, and flags invalid titres", () => {
  const equal = calculateAvailableNitrogen({ sampleTrial1Ml: 10, blankMl: 10 });
  assert.ok(equal.ok);
  assert.equal(equal.sampleTitreMl, 10);
  assert.equal(equal.nitrogenKgPerHa, 0);
  assert.equal(equal.level, "low");
  for (const inputs of [
    { sampleTrial1Ml: 10, blankMl: 15 },
    { sampleTrial1Ml: 10, sampleTrial2Ml: -1, blankMl: 1 },
    { sampleTrial1Ml: 10, blankMl: Infinity },
    { sampleTrial1Ml: NaN, blankMl: 1 },
  ]) {
    const result = calculateAvailableNitrogen(inputs);
    assert.equal(result.ok, false);
    assert.deepEqual(result.lcd.screen1, ["INVALID INPUT", "Check S and B"]);
    assert.equal(result.nitrogenKgPerHa, null);
  }
});

test("Arduino NaOH back-titration reproduces all five LCD examples", () => {
  const examples = [
    [15, 10, 156.80, "low", "156.80"],
    [22, 10, 376.32, "medium", "376.32"],
    [30, 10, 627.20, "high", "627.20"],
    [10, 10, 0, "low", "0.00"],
  ] as const;
  for (const [blankMl, sampleTrial1Ml, value, level, displayValue] of examples) {
    const result = calculateAvailableNitrogen({ method: "back_titration_naoh", blankMl, sampleTrial1Ml });
    assert.ok(result.ok);
    assert.equal(result.correctedTitreMl, blankMl - sampleTrial1Ml);
    assert.equal(result.nitrogenKgPerHa, value);
    assert.equal(result.level, level);
    assert.deepEqual(result.lcd.screen2, [`N: ${displayValue} kg/ha`, level.toUpperCase()]);
  }
  const invalid = calculateAvailableNitrogen({ method: "back_titration_naoh", blankMl: 10, sampleTrial1Ml: 15 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.correctedTitreMl, null);
  assert.deepEqual(invalid.lcd.screen1, ["INVALID INPUT", "Check B and S"]);
});

test("BAL-P-01 returns each Olsen step and supports the alternate hectare factor", () => {
  const result = calculateOlsenPhosphorus({ absorbance: 0.211 });
  assert.ok(result.ok);
  assert.equal(result.concentrationMgPerL.toFixed(3), "0.767");
  assert.equal(result.phosphorusMgPerKg.toFixed(2), "15.34");
  assert.ok(Math.abs(result.phosphorusKgPerHa - 30.606024096385543) < 1e-10);
  assert.equal(result.phosphorusKgPerHaReported.toFixed(2), "30.60");
  assert.equal(result.level, "high");

  const alternate = calculateOlsenPhosphorus({ absorbance: 0.211, haFactor: 2.24 });
  assert.ok(alternate.ok);
  assert.equal(alternate.phosphorusKgPerHa, result.phosphorusMgPerKg * 2.24);
  assert.equal(alternate.phosphorusKgPerHaReported.toFixed(2), "34.36");
  const custom = calculateOlsenPhosphorus({
    absorbance: 0.5, slope: 0.5, intercept: 0, extractVolumeMl: 25, soilMassG: 5, haFactor: 2,
  });
  assert.ok(custom.ok);
  assert.equal(custom.concentrationMgPerL, 1);
  assert.equal(custom.phosphorusMgPerKg, 5);
  assert.equal(custom.phosphorusKgPerHa, 10);
  assert.equal(custom.level, "medium");
});

test("Olsen rejects below-intercept absorbance and invalid calibration values", () => {
  assert.deepEqual(calculateOlsenPhosphorus({ absorbance: 0.019 }), { ok: false, error: "below_intercept" });
  const equal = calculateOlsenPhosphorus({ absorbance: 0.020 });
  assert.ok(equal.ok);
  assert.equal(equal.phosphorusKgPerHa, 0);
  assert.equal(equal.level, "low");
  for (const inputs of [{ slope: 0 }, { soilMassG: 0 }, { extractVolumeMl: -1 }, { haFactor: Infinity }, { intercept: NaN }]) {
    assert.deepEqual(calculateOlsenPhosphorus({ absorbance: 0.211, ...inputs }), { ok: false, error: "invalid_input" });
  }
});

test("blue intensity maps all five choices and returns a representative choice per level", () => {
  assert.deepEqual(([1, 2, 3, 4, 5] as const).map(blueIntensityToLevel), ["low", "low", "medium", "high", "high"]);
  assert.deepEqual((["low", "medium", "high"] as const).map(levelToDefaultBlueIntensity), [2, 3, 4]);
});

test("TCS3200 rejects timeouts in any channel and requires valid calibration for a score", () => {
  const pulses = { rUs: 1350, gUs: 1250, bUs: 1000 };
  for (const channel of ["rUs", "gUs", "bUs"] as const) {
    const signal = evaluateTcs3200Optical({ ...pulses, [channel]: 0 });
    assert.equal(signal.status, "timeout_invalid");
    assert.equal(signal.score0To100, null);
    assert.equal(signal.labValidated, false);
  }
  const uncalibrated = evaluateTcs3200Optical(pulses);
  assert.equal(uncalibrated.status, "uncalibrated");
  assert.equal(uncalibrated.labValidated, false);
  for (const highBUs of [2000, 2500, 0, NaN]) {
    const invalid = evaluateTcs3200Optical(pulses, { lowBUs: 2000, highBUs });
    assert.equal(invalid.status, "invalid_calibration");
    assert.equal(invalid.blueIntensity1To5, null);
    assert.equal(invalid.labValidated, false);
  }
});

test("TCS3200 scores reciprocal blue pulses and clamps outside the calibration window", () => {
  const calibration = { lowBUs: 2000, highBUs: 2000 / 3 };
  const examples = [
    [3000, 0, "low", 1],
    [2000, 0, null, 1],
    [1000, 50, null, 3],
    [calibration.highBUs, 100, null, 5],
    [500, 100, "high", 5],
  ] as const;
  for (const [bUs, score0To100, outOfRange, blueIntensity1To5] of examples) {
    assert.deepEqual(evaluateTcs3200Optical({ rUs: 1350, gUs: 1250, bUs }, calibration), {
      status: "calibrated", score0To100, outOfRange, blueIntensity1To5, labValidated: false,
    });
  }
});

test("moisture classification uses inclusive moist boundaries and rejects invalid percentages", () => {
  assert.deepEqual([0, 29, 30, 65, 66, 100].map(classifyMoisturePercent), ["dry", "dry", "moist", "moist", "wet", "wet"]);
  assert.deepEqual([-1, 101, NaN].map(classifyMoisturePercent), ["untested", "untested", "untested"]);
});

const legacyReading = {
  kitType: "balram_inhouse",
  ph: 7.1,
  nitrogenLevel: "medium",
  phosphorusLevel: "medium",
  potassiumLevel: "untested",
  organicCarbon: "untested",
  salinity: "untested",
  nitrogenKgPerHa: null,
  phosphorusKgPerHa: null,
  testedAt: "2026-11-27",
} as const;

test("old v6 soil readings get defaults and Soil Health Card readings accept zero nutrients", () => {
  assert.deepEqual(SoilKitReadingSchema.parse(legacyReading), {
    ...legacyReading, moistureLevel: "untested", moisturePercent: null,
    phosphorusBlueIntensity: null, dataStatus: "screening", labCalculation: null,
  });
  const card = createSoilHealthCardReading({ ph: 7, nitrogenKgPerHa: 0, phosphorusKgPerHa: 0, testedAt: legacyReading.testedAt });
  assert.equal(card.nitrogenKgPerHa, 0);
  assert.equal(card.phosphorusKgPerHa, 0);
  assert.equal(card.nitrogenLevel, "low");
  assert.equal(card.phosphorusLevel, "low");
});

test("v6 soil reading retains an optional compact calculation audit", () => {
  const labCalculation = {
    nitrogenMethod: "direct_h2so4", nitrogenBlankMl: 0.4, nitrogenSampleTrial1Ml: 7.8, nitrogenSampleTrial2Ml: 7.7,
    phosphorusAbsorbance: 0.211, phosphorusConcentrationMgPerL: 0.767, phosphorusMgPerKg: 15.34,
    phosphorusExtractVolumeMl: 50, phosphorusSoilMassG: 2.5, phosphorusHaFactor: 1.995,
    tcs3200RawUs: { r: 1350, g: 1250, b: 1000 }, tcs3200RelativeScore: 50,
  };
  assert.deepEqual(SoilKitReadingSchema.parse({ ...legacyReading, labCalculation }).labCalculation, labCalculation);
  assert.deepEqual(SoilLabCalculationSchema.parse({}), {});
  assert.equal(SoilLabCalculationSchema.safeParse({ tcs3200RelativeScore: 101 }).success, false);
  assert.equal(SoilKitReadingSchema.safeParse({ ...legacyReading, phosphorusBlueIntensity: 2.5 }).success, false);
});

test("interpretation includes localized moisture actions and appends the simulated dosing disclaimer", () => {
  const screening = interpretSoilKitReading(legacyReading);
  assert.equal(screening.steps.some(({ parameter }) => parameter === "moisture"), false);
  for (const [moistureLevel, severity] of [["dry", "attention"], ["moist", "good"], ["wet", "attention"]] as const) {
    const result = interpretSoilKitReading({ ...legacyReading, moistureLevel, dataStatus: "simulated" });
    const step = result.steps.find(({ parameter }) => parameter === "moisture");
    assert.ok(step);
    assert.equal(step.severity, severity);
    for (const field of [step.badgeLabel, step.plainExplanation, step.actionStep]) {
      assert.match(field.en, /[a-z]/i);
      assert.match(field.mr, /[\u0900-\u097f]/u);
    }
    assert.ok(result.assayNotes.en.startsWith(screening.assayNotes.en));
    assert.ok(result.assayNotes.mr.startsWith(screening.assayNotes.mr));
    assert.match(result.assayNotes.en, /simulated demonstration.*Do not use.*actual fertilizer doses/i);
    assert.match(result.assayNotes.mr, /काल्पनिक नोंद.*प्रत्यक्ष खताची मात्रा.*वापरू नका/u);
  }
});

test("demo presets carry simulated provenance and reproduce the lab, Arduino and DEMO-B values", () => {
  const { lab_procedure_demo: lab, arduino_lcd_high_n: arduino, tcs3200_optical_demo: optical } = SOIL_DEMO_PRESETS;
  assert.deepEqual(Object.values(SOIL_DEMO_PRESETS).map(({ dataStatus }) => dataStatus), ["simulated", "simulated", "simulated"]);
  assert.deepEqual(Object.values(SOIL_DEMO_PRESETS).map(({ ph, moisturePercent, moistureLevel, phosphorusBlueIntensity }) =>
    [ph, moisturePercent, moistureLevel, phosphorusBlueIntensity]), [[7.1, 48, "moist", 4], [6.8, 24, "dry", 2], [7.4, 72, "wet", 3]]);
  assert.equal(lab.nitrogen.result.nitrogenKgPerHa, 230.50);
  assert.ok(lab.phosphorus.result.ok);
  assert.equal(lab.phosphorus.result.phosphorusKgPerHaReported, 30.60);
  assert.equal(arduino.nitrogen.result.nitrogenKgPerHa, 627.20);
  assert.deepEqual(optical.optical.pulses, { rUs: 1350, gUs: 1250, bUs: 1000 });
  assert.equal(optical.optical.result.score0To100, 50);
  assert.equal(optical.optical.result.blueIntensity1To5, 3);
  assert.equal(optical.optical.result.labValidated, false);
});
