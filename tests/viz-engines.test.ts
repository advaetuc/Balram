import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createSampleFixture } from "../src/mocks/fixtures";
import { getSeasonalCropRecommendations } from "../src/lib/domain/cropRecommendations";
import { createRegionalBaselineWeatherSnapshot, resolveDailyEt0 } from "../src/lib/domain/irrigation";
import { buildCropCalendar } from "../src/lib/domain/viz/calendarLayout";
import { evaluateCropFit } from "../src/lib/domain/viz/cropFit";
import { buildSoilGauges } from "../src/lib/domain/viz/gaugeZones";
import { deriveSkyCondition } from "../src/lib/domain/viz/skyCondition";
import { layoutTiles } from "../src/lib/domain/viz/tileLayout";
import { buildWaterRibbon, HEAVY_RAIN_CAUTION_MM } from "../src/lib/domain/viz/waterRibbon";
import { useNow } from "../src/lib/ui/useNow";
import type { CropAllocation, SoilKitReading } from "../src/types/domain";

function plot(overrides: Partial<CropAllocation> = {}): CropAllocation {
  return {
    cropId: "onion", percentage: 100, season: "rabi",
    growthStage: "initial", plantingDate: null, ...overrides,
  };
}

function soil(overrides: Partial<SoilKitReading> = {}): SoilKitReading {
  return {
    kitType: "commercial_rapid", ph: 8, testedAt: "2026-11-22",
    nitrogenLevel: "medium", phosphorusLevel: "medium", potassiumLevel: "untested",
    nitrogenKgPerHa: null, phosphorusKgPerHa: null, organicCarbon: "untested", salinity: "untested",
    ...overrides,
  };
}

function baseline(date = "2026-11-22") {
  return createRegionalBaselineWeatherSnapshot({
    fieldId: "field", coordinate: [73.8567, 18.5204], nowMs: Date.parse(`${date}T06:00:00+05:30`),
  });
}

test("tile layout maps 7.3 acres to 292 tiles, including a one-tile plot", () => {
  const blocks = layoutTiles(7.3 * 40, [plot({ areaGunthas: 1 })]);
  assert.deepEqual(blocks.map(({ tiles }) => tiles.length), [40, 40, 40, 40, 40, 40, 40, 12]);
  const tiles = blocks.flatMap((block) => block.tiles);
  assert.equal(tiles.filter(({ kind }) => kind === "plot").length, 1);
  assert.equal(tiles.filter(({ kind }) => kind === "fallow").length, 291);
  assert.deepEqual([tiles[39].row, tiles[39].column, tiles[40].row, tiles[40].column], [4, 7, 0, 0]);
});

test("tile layout cycles five patterns with bilingual crop initials on a 10-acre farm", () => {
  const ids = ["onion", "bajra", "groundnut", "sugarcane", "pomegranate", "rabi_jowar", "bajra", "onion"];
  const plots = ids.map((cropId, index) => plot({ cropId, plotId: `plot-${index}`, areaGunthas: 50, percentage: 12.5 }));
  const blocks = layoutTiles(400, plots);
  assert.equal(blocks.length, 10);
  assert.ok(blocks.every(({ tiles }) => tiles.length === 40));
  const tiles = blocks.flatMap(({ tiles }) => tiles);
  assert.equal(tiles.length, 400);
  assert.deepEqual(tiles.filter((_, index) => index % 50 === 0)
    .flatMap((tile) => tile.kind === "plot" ? [[tile.patternIndex, tile.initial.en, tile.initial.mr]] : []), [
    [0, "O", "क"], [1, "B", "ब"], [2, "G", "भ"], [3, "S", "ऊ"],
    [4, "P", "ड"], [0, "R", "र"], [1, "B", "ब"], [2, "O", "क"],
  ]);
});

test("tile layout apportions whole land by largest remainder and preserves a fractional final tile", () => {
  const plots = [
    plot({ areaGunthas: 2.2, plotId: "first", percentage: 36 }),
    plot({ areaGunthas: 3.6, plotId: "second", percentage: 60 }),
  ];
  const tiles = layoutTiles(6.25, plots).flatMap((block) => block.tiles);
  assert.deepEqual(tiles.flatMap((tile) => tile.kind === "plot" && tile.fillFraction === 1 ? [tile.plotId] : []), ["first", "first", "second", "second", "second", "second"]);
  assert.equal(tiles.at(-1)?.fillFraction, 0.25);
  assert.equal(tiles.at(-1)?.kind, "fallow");
  assert.equal(tiles.reduce((sum, tile) => sum + tile.fillFraction, 0), 6.25);

  const over = layoutTiles(5.5, plots).flatMap((block) => block.tiles);
  assert.equal(over.filter(({ fillFraction }) => fillFraction === 1).length, 5);
  assert.ok(over.reduce((sum, tile) => sum + tile.fillFraction, 0) <= 5.5);
  const legacy = layoutTiles(41, [plot()]).flatMap((block) => block.tiles);
  assert.equal(legacy.filter(({ kind }) => kind === "plot").length, 41);
  assert.deepEqual(layoutTiles(0, []), []);
});

test("nutrient gauges classify exact soil-card thresholds and clamp out-of-range pins", () => {
  assert.deepEqual([279, 280, 560, 561].map((nitrogenKgPerHa) =>
    buildSoilGauges(soil({ nitrogenKgPerHa })).nitrogen.highlightedBandIndex), [0, 1, 1, 2]);
  assert.deepEqual([9.9, 10, 25, 25.1].map((phosphorusKgPerHa) =>
    buildSoilGauges(soil({ phosphorusKgPerHa })).phosphorus.highlightedBandIndex), [0, 1, 1, 2]);
  const gauges = buildSoilGauges(soil({ nitrogenKgPerHa: 800, phosphorusKgPerHa: 41 }));
  assert.deepEqual(gauges.nitrogen.zones.map(({ min, max }) => [min, max]), [[0, 280], [280, 560], [560, 700]]);
  assert.deepEqual(gauges.phosphorus.zones.map(({ min, max }) => [min, max]), [[0, 10], [10, 25], [25, 40]]);
  assert.equal(gauges.nitrogen.pinPercent, 100);
  assert.equal(gauges.phosphorus.pinPercent, 100);
});

test("pH gauge follows the interpretation bands and keeps the Vertisol range independent", () => {
  const gauges = [5.7, 6.5, 8, 8.4].map((ph) => buildSoilGauges(soil({ ph })).ph);
  assert.deepEqual(gauges.map(({ highlightedBandIndex }) => highlightedBandIndex), [0, 2, 3, 4]);
  assert.deepEqual(gauges.map(({ pinPercent }) => Number(pinPercent?.toFixed(2))), [31.43, 42.86, 64.29, 70]);
  assert.deepEqual(gauges[0].vertisolBand, [7.8, 8.4]);
  assert.equal(gauges[0].min, 3.5);
  assert.equal(gauges[0].max, 10.5);
});

test("level-only nutrient gauges highlight the chosen band without a numeric pin", () => {
  const { nitrogen, phosphorus } = buildSoilGauges(soil({ nitrogenLevel: "high", phosphorusLevel: "low" }));
  assert.deepEqual([nitrogen.highlightedBandIndex, phosphorus.highlightedBandIndex], [2, 0]);
  assert.deepEqual([nitrogen.pinPercent, phosphorus.pinPercent], [null, null]);
});

test("water ribbon uses stage Kc and keeps heavy-rain caution tied to actual input rain", () => {
  const weatherSnapshot = baseline();
  weatherSnapshot.daily[0].referenceEvapotranspiration = 4;
  weatherSnapshot.daily[0].precipitation = 2;
  weatherSnapshot.daily[1].precipitation = HEAVY_RAIN_CAUTION_MM;
  weatherSnapshot.daily[2].precipitation = HEAVY_RAIN_CAUTION_MM - 0.1;
  const input = { weatherSnapshot, plot: plot({ lifecycleStage: "flowering_fruiting" }), latitudeDeg: 18.5204 };
  const standard = buildWaterRibbon(input);
  const scaled = buildWaterRibbon({ ...input, rainScalePercent: 50 });
  assert.equal(scaled.length, 7);
  assert.ok(scaled.every((day) => day.provenance === "typical_season" && day.illustrative));
  assert.ok(standard.every((day) => !day.illustrative));
  assert.deepEqual([scaled[0].rainMm, scaled[0].scaledRainMm, scaled[0].cropNeedMm, scaled[0].netNeedMm], [2, 1, 4.2, 3.2]);
  assert.equal(scaled[0].irrigate, true);
  assert.equal(scaled[1].heavyRainCaution, true);
  assert.equal(scaled[2].heavyRainCaution, false);
});

test("water ribbon uses Hargreaves when available and preserves forecast gaps", () => {
  const sample = createSampleFixture().weatherSnapshot!;
  sample.daily[0].referenceEvapotranspiration = null;
  sample.daily[0].precipitation = null;
  sample.daily.splice(1, 1);
  const ribbon = buildWaterRibbon({ weatherSnapshot: sample, plot: plot(), latitudeDeg: 18.5204 });
  const hargreaves = resolveDailyEt0(sample.daily[0], 18.5204)!;
  assert.equal(hargreaves.provenance, "hargreaves-fallback");
  assert.equal(ribbon[0].cropNeedMm, hargreaves.et0MmPerDay * 0.7);
  assert.equal(ribbon[0].netNeedMm, null);
  assert.equal(ribbon[0].irrigate, false);
  assert.deepEqual(ribbon[1], {
    date: "2026-10-02", tempMin: null, tempMax: null, rainMm: null, scaledRainMm: null,
    cropNeedMm: null, netNeedMm: null, irrigate: false, heavyRainCaution: false,
    provenance: "sample", illustrative: false,
  });
  assert.equal(ribbon[6].date, "2026-10-07");
});

test("crop-fit soil flags agree with the seasonal ranking at pH 8.0", () => {
  const input = { monthZeroIndexed: 9, soilKitReading: soil(), weatherSnapshot: null };
  const ranked = getSeasonalCropRecommendations(input);
  const onion = evaluateCropFit({ ...input, cropId: "onion" });
  const pomegranate = evaluateCropFit({ ...input, cropId: "pomegranate" });
  assert.deepEqual(onion, { soil: "fair", water: "fair", sowing: "good" });
  assert.equal(pomegranate.soil, "good");
  assert.match(ranked.find(({ cropId }) => cropId === "onion")!.whyItFits.en, /outside the ideal range/);
  assert.ok(ranked.find(({ cropId }) => cropId === "pomegranate")!.score > ranked.find(({ cropId }) => cropId === "onion")!.score);
});

test("hot, dry conditions favor Bajra over Sugarcane in both crop-fit and seasonal ranking", () => {
  const weatherSnapshot = baseline("2026-05-23");
  const input = { monthZeroIndexed: 5, soilKitReading: null, weatherSnapshot };
  const ranked = getSeasonalCropRecommendations(input);
  assert.deepEqual(evaluateCropFit({ ...input, cropId: "bajra" }), { soil: "fair", water: "good", sowing: "good" });
  assert.equal(evaluateCropFit({ ...input, cropId: "sugarcane" }).water, "needs_help");
  assert.equal(ranked.find(({ cropId }) => cropId === "bajra")!.tier, "best_match");
  assert.equal(ranked.find(({ cropId }) => cropId === "sugarcane")!.tier, "high_risk");
});

test("calendar places leap day within February and marks the planned harvest", () => {
  const calendar = buildCropCalendar({ allocations: [plot({ plantingDate: "2028-02-29" })], todayIso: "2028-02-29" });
  assert.equal(calendar.months.length, 12);
  assert.equal(calendar.months[1].season, "Rabi");
  assert.equal(calendar.months[3].season, "Zaid");
  assert.equal(calendar.months[6].season, "Kharif");
  const february = calendar.months[1];
  assert.ok(calendar.todayXPercent! > february.startXPercent && calendar.todayXPercent! < february.endXPercent);
  assert.equal(calendar.plots[0].stageBars[0].startXPercent, calendar.todayXPercent);
  assert.equal(calendar.plots[0].stageBars[0].endDate, "2028-03-21");
  assert.equal(calendar.plots[0].harvest?.date, "2028-06-27");
});

test("calendar splits December–January stages across both edges with no SSR Today marker", () => {
  const calendar = buildCropCalendar({ allocations: [plot({ plantingDate: "2027-12-20" }), plot()], todayIso: null });
  assert.equal(calendar.todayXPercent, null);
  const [first, second] = calendar.plots[0].stageBars;
  assert.deepEqual([first.endDate, first.endXPercent, second.stage, second.startDate, second.startXPercent, second.endDate],
    ["2028-01-01", 100, "planned", "2028-01-01", 0, "2028-01-10"]);
  assert.equal(calendar.plots[0].sowingWindows.find(({ season }) => season === "Rabi")?.endXPercent, 100);
  assert.deepEqual(calendar.plots[1].stageBars, []);
  assert.equal(calendar.plots[1].harvest, null);
});

test("sky discretizes heat and rain while identifying its source and the dominant plot stage", () => {
  const weatherSnapshot = baseline();
  const allocations = [
    plot({ percentage: 25, lifecycleStage: "harvesting" }),
    plot({ percentage: 75, growthStage: "development" }),
  ];
  const conditions = [
    { temperatureMax: 34, precipitation: 0, expected: "clear_mild" },
    { temperatureMax: 35, precipitation: 0, expected: "clear_hot" },
    { temperatureMax: 35, precipitation: 0.2, expected: "partly_cloudy" },
    { temperatureMax: 35, precipitation: 1, expected: "light_rain" },
    { temperatureMax: 35, precipitation: 25, expected: "heavy_rain" },
  ];
  for (const { temperatureMax, precipitation, expected } of conditions) {
    Object.assign(weatherSnapshot.daily[0], { temperatureMax, precipitation });
    const sky = deriveSkyCondition({ weatherSnapshot, allocations });
    assert.equal(sky.condition, expected);
    assert.equal(sky.dominantStage, "vegetative");
    assert.equal(sky.provenance, "typical_season");
    assert.match(sky.headline.en, /^Typical for the season/);
    assert.doesNotMatch(sky.headline.mr, /[A-Za-z]/);
  }
  const sample = deriveSkyCondition({ weatherSnapshot: createSampleFixture().weatherSnapshot, allocations: [] });
  assert.equal(sample.provenance, "sample");
  assert.equal(sample.dominantStage, "planned");
  const missing = deriveSkyCondition({ weatherSnapshot: null, allocations: [] });
  assert.equal(missing.tempMax, null);
  assert.equal(missing.rainMm, null);
  assert.equal(missing.headline.en, "Weather data is unavailable");
});

test("useNow renders a null clock and date on the server", () => {
  function Clock() {
    const { nowMs, todayIso } = useNow();
    return createElement("span", null, `${nowMs} / ${todayIso}`);
  }
  assert.equal(renderToString(createElement(Clock)), "<span>null / null</span>");
});

test("visual primitives are store-free and visual engines have no React, store, or wall-clock dependencies", () => {
  const components = new URL("../src/components/viz/", import.meta.url);
  const engines = new URL("../src/lib/domain/viz/", import.meta.url);
  for (const filename of readdirSync(components).filter((file) => /\.tsx?$/.test(file))) {
    assert.doesNotMatch(readFileSync(new URL(filename, components), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//, filename);
  }
  for (const filename of readdirSync(engines).filter((file) => /\.ts$/.test(file))) {
    assert.doesNotMatch(readFileSync(new URL(filename, engines), "utf8"), /from\s+["']react|useBalramStore|\/store\/|Date\.now\(|new Date\(\)/, filename);
  }
});
