import assert from "node:assert/strict";
import test from "node:test";
import { generateFieldVoiceAdvisories } from "../src/lib/domain/fieldVoice";
import { createSampleFixture } from "../src/mocks/fixtures";
import { SoilKitReadingSchema, type SoilKitReading, type WeatherSnapshot } from "../src/types/domain";

const fixture = createSampleFixture();
const base = SoilKitReadingSchema.parse({
  ...fixture.soilKitReading, ph: 7.4, nitrogenLevel: "medium", phosphorusLevel: "medium",
});

function forecast(rainfall: (number | null)[], source = "Open-Meteo"): WeatherSnapshot {
  const weather = fixture.weatherSnapshot!;
  return { ...weather, source, daily: weather.daily.map((day, index) => ({
    ...day, precipitation: rainfall[index] ?? null,
  })) };
}

function notes(patch: Partial<SoilKitReading> = {}, weatherSnapshot: WeatherSnapshot | null = null) {
  return generateFieldVoiceAdvisories({ allocations: [], soilKitReading: { ...base, ...patch }, weatherSnapshot });
}

test("dry soil is urgent, cites exact readings including zero, and suggests checking before irrigation", () => {
  const [dry] = notes({ moistureLevel: "dry", moisturePercent: 23.75 }, forecast([1, 1, 2, 35]));
  assert.equal(dry.ruleId, "dry_soil_moisture_alert");
  assert.equal(dry.priority, "urgent");
  assert.match(dry.reason.en, /23\.75%.*4 mm/);
  assert.match(dry.reason.mr, /२३\.७५%.*४ मिमी/);
  assert.match(dry.message.en, /early in the morning.*mulch.*drip/);
  assert.equal(notes({ moistureLevel: "dry", moisturePercent: 0 })[0].reason.en.includes("0%"), true);
  assert.doesNotMatch(notes({ moistureLevel: "dry" })[0].reason.en, /0 mm|%/);
});

test("wet soil escalates at 5 mm of forecast rain and gives drainage advice", () => {
  const soil = { moistureLevel: "wet", moisturePercent: 72 } as const;
  const [urgent] = notes(soil, forecast([1, 2, 2]));
  assert.equal(urgent.ruleId, "wet_soil_waterlogging_guard");
  assert.equal(urgent.priority, "urgent");
  assert.match(urgent.message.en, /Pause irrigation.*drainage channels.*roots/);
  assert.equal(notes(soil, forecast([0, 2, 2.9, 50]))[0].priority, "action");
  assert.equal(notes(soil, forecast([null, null, null]))[0].priority, "action");
  assert.equal(notes(soil, forecast([20], "Balram Maharashtra seasonal baseline"))[0].priority, "action");
});

test("washout guard requires at least 15 mm within three days and low nitrogen or phosphorus", () => {
  const id = "rain_fertilizer_washout_guard";
  for (const levels of [{ nitrogenLevel: "low" }, { phosphorusLevel: "low" }] as const) {
    const [guard] = notes(levels, forecast([4, 5, 6]));
    assert.equal(guard.ruleId, id);
    assert.equal(guard.priority, "urgent");
    assert.match(guard.reason.en, /15 mm/);
    assert.match(guard.message.en, /Hold off on top-dressing/);
    assert.ok(!notes(levels, forecast([4, 5, 5.9, 20])).some(note => note.ruleId === id));
  }
  assert.ok(!notes({}, forecast([15])).some(note => note.ruleId === id));
});

test("strong acidity and high nitrogen give distinct, prioritized actions and tips", () => {
  const [acidic, nitrogen] = notes({ ph: 5.7, nitrogenLevel: "high" });
  assert.equal(acidic.ruleId, "acidic_soil_ph_guard");
  assert.equal(acidic.priority, "action");
  assert.match(acidic.message.en, /farmyard manure or compost.*agricultural lime/);
  assert.equal(nitrogen.ruleId, "high_nitrogen_restraint");
  assert.equal(nitrogen.priority, "tip");
  assert.match(nitrogen.message.en, /basal urea.*save money.*leafy growth/);
  assert.ok(!notes({ ph: 5.8 }).some(note => note.ruleId === "acidic_soil_ph_guard"));
});

test("no plots still produces ranked farm-level moisture, low nutrient and pH notes", () => {
  const advisories = notes({ nitrogenLevel: "low", phosphorusLevel: "low", moistureLevel: "dry", ph: 5.3 });
  assert.deepEqual(advisories.map(note => note.ruleId), [
    "dry_soil_moisture_alert", "acidic_soil_ph_guard", "sowing_phosphorus_low", "vegetative_nitrogen_low",
  ]);
  for (const note of advisories) {
    assert.deepEqual([note.plotId, note.plotName, note.cropId], [null, null, null]);
    for (const pair of [note.headline, note.message, note.reason, note.actionLabel]) {
      assert.match(pair.en, /[a-z]/i);
      assert.match(pair.mr, /\p{Script=Devanagari}/u);
      assert.doesNotMatch(pair.mr.replace(/\([NP]\)/g, ""), /[A-Za-z]/);
    }
  }
  assert.equal(notes({ ph: 8.3 })[0].ruleId, "alkaline_lockup_warning");
});

test("steady state invites a field walk and reflects the saved pH and moisture when available", () => {
  const [saved] = notes({ moistureLevel: "moist" });
  assert.equal(saved.ruleId, "general_seasonal_guidance");
  assert.match(saved.reason.en, /pH is 7\.4.*moist/);
  assert.match(saved.reason.mr, /७\.४.*ओलसर/);
  const [empty] = generateFieldVoiceAdvisories({ allocations: [], soilKitReading: null, weatherSnapshot: null });
  assert.match(empty.message.en, /short walk.*roots/);
  assert.match(empty.message.mr, /छोटी फेरी.*मुळांजवळची/);
  assert.doesNotMatch(empty.reason.en, /rule matched|configured/);
});
