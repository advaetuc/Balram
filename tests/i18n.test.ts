import test from "node:test";
import assert from "node:assert/strict";
import { t, seasonLabel, droughtToleranceLabel, cropLabel } from "../src/config/i18n";
import { createSampleFixture } from "../src/mocks/fixtures";
import { generateFieldVoiceAdvisories } from "../src/lib/domain/fieldVoice";
import { interpretSoilKitReading } from "../src/lib/domain/soilKit";
import { getSeasonalCropRecommendations } from "../src/lib/domain/cropRecommendations";
import { generateRoadmap } from "../src/lib/domain/roadmap";
import { buildShareSummary } from "../src/lib/ui/shareSummary";

const approved = ["KMnO₄", "OpenStreetMap", "Open-Meteo", "Balram", "ET₀", "ETc", "NPK", "FYM", "DAP", "SSP", "kg/ha", "mm/day", "mm", "L/hour", "L/week", "L/day", "L", "°C", "MB", "JSON", "IST", "pH", "Kc", "N", "P", "K", "Turf"];

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(strings);
  return [];
}

function assertMarathiText(values: readonly string[]) {
  for (const value of values) {
    let remaining = value;
    for (const token of approved) remaining = remaining.replaceAll(token, "");
    assert.doesNotMatch(remaining, /[A-Za-z]/, `unexpected English text: ${value}`);
  }
}

function sameShape(left: unknown, right: unknown): boolean {
  if (typeof left !== typeof right) return false;
  if (left === null || right === null || typeof left !== "object") return true;
  const leftKeys = Object.keys(left as object).sort();
  const rightKeys = Object.keys(right as object).sort();
  return leftKeys.join("|") === rightKeys.join("|") && leftKeys.every((key) => sameShape((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

test("English and Marathi dictionaries have matching non-empty recursive string structures", () => {
  const en = t("en");
  const mr = t("mr");
  assert.equal(sameShape(en, mr), true);
  assert.ok(strings(en).every((value) => value.trim().length > 0));
  assert.ok(strings(mr).every((value) => value.trim().length > 0));
  assertMarathiText(strings(mr));
});

test("season and drought-tolerance labels have Marathi forms", () => {
  assert.equal(seasonLabel("mr", "Kharif"), "खरीप");
  assert.equal(seasonLabel("mr", "Rabi"), "रब्बी");
  assert.equal(seasonLabel("mr", "Zaid"), "उन्हाळी");
  assert.equal(seasonLabel("mr", "Perennial"), "बारमाही");
  assert.deepEqual(["high", "moderate", "low"].map((level) => droughtToleranceLabel("mr", level as "high" | "moderate" | "low")), ["जास्त", "मध्यम", "कमी"]);
});

test("domain advice, soil, roadmap and share outputs stay Marathi with localized crops and preset plots", () => {
  const fixture = createSampleFixture();
  const soil = fixture.soilKitReading ? interpretSoilKitReading(fixture.soilKitReading) : null;
  assert.ok(soil);
  const advisories = generateFieldVoiceAdvisories({ allocations: fixture.cropAllocations, soilKitReading: fixture.soilKitReading, weatherSnapshot: fixture.weatherSnapshot, nowMs: null });
  const recommendations = getSeasonalCropRecommendations({ monthZeroIndexed: 8, soilKitReading: fixture.soilKitReading, weatherSnapshot: fixture.weatherSnapshot });
  const roadmap = generateRoadmap({ allocations: fixture.cropAllocations, soilInterpretation: soil, waterBreakdownByPlot: {}, todayIso: "2026-11-18" });
  const cropIds = ["sugarcane", "rabi_jowar", "onion", "bajra", "pomegranate", "groundnut"] as const;
  const namedFarm = { ...fixture, cropAllocations: cropIds.map((cropId, index) => ({
    ...fixture.cropAllocations[index % fixture.cropAllocations.length]!,
    plotId: `marathi-test-${index}`,
    cropId,
    plotName: ["Well Plot", "Borewell Patch", "Canal Plot", "Roadside Field", "Plot 5", "Plot 6"][index]!,
  })) };
  const summary = buildShareSummary(namedFarm, roadmap, "mr");
  assertMarathiText([
    ...advisories.flatMap((item) => [item.headline.mr, item.reason.mr, item.message.mr, item.actionLabel.mr]),
    ...recommendations.flatMap((item) => [item.badgeLabel.mr, item.whyItFits.mr, item.careNote.mr]),
    soil.headline.mr, soil.assayNotes.mr, ...soil.steps.flatMap((step) => [step.badgeLabel.mr, step.plainExplanation.mr, step.actionStep.mr]),
    ...roadmap.flatMap((item) => [item.title.mr, item.detail.mr]), summary,
  ]);
  for (const id of cropIds) assert.ok(summary.includes(cropLabel("mr", id)));
  for (const name of ["विहिरीचा प्लॉट", "बोअरवेल प्लॉट", "कालव्याचा प्लॉट", "रस्त्यालगतचा प्लॉट"]) assert.ok(summary.includes(name));
});
