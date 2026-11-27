import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import ts from "typescript";
import { cropLabel, seasonLabel, t } from "../src/config/i18n";
import { indiaDate } from "../src/lib/domain/calendar";
import { formatNumber } from "../src/lib/ui/format";
import { farmRoadmap } from "../src/lib/ui/farmRoadmap";
import { buildFarmCardSvg, FARM_CARD_SIZE } from "../src/lib/ui/farmCardSvg";
import type { RoadmapItem } from "../src/lib/domain/roadmap";
import { renderToString } from "react-dom/server";
import { createSampleFixture } from "../src/mocks/fixtures";
import { getCropStageKc, MaharashtraCropMatrix } from "../src/config/cropMatrix";
import { displayPlotName, formatArea } from "../src/lib/domain/landUnits";
import { allocatePlotsByGunthas, updatePlotGunthas } from "../src/lib/domain/allocation";
import { GUNTHAS_PER_ACRE, SQUARE_METRES_PER_GUNTHA } from "../src/lib/domain/geometry";
import { getSeasonalCropRecommendations } from "../src/lib/domain/cropRecommendations";
import { calculatePhaseWaterBreakdown, calculateSystemRuntime, createRegionalBaselineWeatherSnapshot, resolveDailyEt0 } from "../src/lib/domain/irrigation";
import { buildCropCalendar } from "../src/lib/domain/viz/calendarLayout";
import { evaluateCropFit } from "../src/lib/domain/viz/cropFit";
import { buildSoilGauges } from "../src/lib/domain/viz/gaugeZones";
import { estimateWeeksToNextStage } from "../src/lib/domain/viz/stageProgress";
import { deriveSkyCondition } from "../src/lib/domain/viz/skyCondition";
import { barSegments, MAX_VISIBLE_BAR_PLOTS, MIN_SEGMENT_DISPLAY_PERCENT } from "../src/lib/domain/viz/barSegments";
import { buildWaterRibbon, HEAVY_RAIN_CAUTION_MM } from "../src/lib/domain/viz/waterRibbon";
import { useNow } from "../src/lib/ui/useNow";
import { describeSoilReadout, formatSoilNutrient } from "../src/lib/ui/soilReadout";
import { CropAllocationsSchema, growthToLifecycleStage, LifecycleStageSchema, type CropAllocation, type SoilKitReading } from "../src/types/domain";

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

test("bar segments preserve exact area on a fractional-acre farm and report unassigned land", () => {
  const result = barSegments(7.3 * 40, [plot({ areaGunthas: 80, plotId: "well" }), plot({ areaGunthas: 91.5 })]);
  assert.equal(result.totalGunthas, 292);
  assert.equal(result.unassignedGunthas, 120.5);
  assert.deepEqual(result.segments.map(segment => segment.areaGunthas), [80, 91.5, 120.5]);
  assert.deepEqual(result.segments.map(segment => segment.truePercent), [80, 91.5, 120.5].map(area => area / 292 * 100));
  assert.deepEqual(result.segments.map(segment => segment.kind), ["plot", "plot", "fallow"]);
  assert.ok(Math.abs(result.segments.reduce((sum, segment) => sum + segment.displayWidthPercent, 0) - 100) < 1e-10);
});

test("a one-Guntha plot gets a 15 percent target without changing the recorded area or shares", () => {
  const tiny = Object.freeze(plot({ areaGunthas: 1, percentage: 0.25, plotId: "tiny" }));
  const input = Object.freeze([tiny, Object.freeze(plot({ areaGunthas: 239, percentage: 59.75 }))]);
  const { segments } = barSegments(400, input);
  assert.equal(MIN_SEGMENT_DISPLAY_PERCENT, 15);
  assert.deepEqual(segments.map(segment => segment.truePercent), [0.25, 59.75, 40]);
  assert.equal(segments[0].displayWidthPercent, 15);
  assert.equal(segments[0].areaGunthas, 1);
  assert.equal(input[0].percentage, 0.25);
  assert.ok(Math.abs(segments[1].displayWidthPercent / segments[2].displayWidthPercent - 239 / 160) < 1e-10);
  assert.ok(Math.abs(segments.reduce((sum, segment) => sum + segment.displayWidthPercent, 0) - 100) < 1e-10);
});

test("zero land has no segments and a single plot can fill the whole bar", () => {
  assert.deepEqual(barSegments(0, [plot()]), { segments: [], unassignedGunthas: 0, totalGunthas: 0, overflowPlotCount: 0 });
  const { segments } = barSegments(40, [plot()]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].displayWidthPercent, 100);
  assert.equal(segments[0].truePercent, 100);
  assert.equal(barSegments(40, []).segments[0].displayWidthPercent, 100);
});

test("bar segments retain the first six plots, count overflow and cycle patterns in input order", () => {
  const plots = Array.from({ length: 8 }, (_, index) => plot({
    cropId: index % 2 ? "onion" : "bajra", areaGunthas: 50, percentage: 12.5, plotId: `plot-${index}`,
  }));
  const result = barSegments(400, plots);
  assert.equal(MAX_VISIBLE_BAR_PLOTS, 6);
  assert.equal(result.overflowPlotCount, 2);
  assert.equal(result.unassignedGunthas, 0);
  const visible = result.segments.filter(segment => segment.kind === "plot");
  assert.equal(visible.length, 6);
  assert.deepEqual(visible.map(segment => segment.plotId), plots.slice(0, 6).map(item => item.plotId));
  assert.deepEqual(visible.map(segment => segment.patternIndex), [0, 1, 2, 3, 4, 0]);
  assert.deepEqual(visible.map(segment => segment.initial), [0, 1, 2, 3, 4, 5].map(index => index % 2 ? { en: "O", mr: "क" } : { en: "B", mr: "ब" }));
  assert.ok(visible.every(segment => segment.truePercent === 12.5 && segment.displayWidthPercent >= 15));
  const withFallow = barSegments(440, plots);
  assert.equal(withFallow.unassignedGunthas, 40);
  assert.deepEqual(withFallow.segments.map(segment => segment.displayWidthPercent), [15, 15, 15, 15, 15, 15, 10]);
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

test("tile adjustments resize named and legacy plots through canonical guntha updates", () => {
  const area = 40 * SQUARE_METRES_PER_GUNTHA;
  const allocations = [
    plot({ plotId: "named", areaGunthas: 10, percentage: 25 }),
    plot({ cropId: "bajra", percentage: 25 }),
  ];
  const shrunk = updatePlotGunthas(allocations, "bajra-1", 9, area);
  const transferred = updatePlotGunthas(shrunk, "named", 11, area);
  assert.deepEqual(transferred.map(({ areaGunthas }) => areaGunthas), [11, 9]);
  assert.equal(allocations[1].areaGunthas, undefined);
  assert.ok(CropAllocationsSchema.safeParse(transferred).success);
  assert.throws(() => updatePlotGunthas(transferred, "named", 32, area), RangeError);
  assert.throws(() => updatePlotGunthas(transferred, "named", 0, area));
});

test("filling the field apportions exactly 100 percent without changing guntha areas", () => {
  const area = 400 * SQUARE_METRES_PER_GUNTHA;
  const allocations = [
    plot({ plotId: "one", areaGunthas: 100.1, percentage: 25.03 }),
    plot({ plotId: "two", areaGunthas: 100.1, percentage: 25.03 }),
    plot({ plotId: "three", areaGunthas: 190, percentage: 47.5 }),
  ];
  const filled = CropAllocationsSchema.parse(updatePlotGunthas(allocations, "three", 199.8, area));
  assert.deepEqual(filled.map(({ areaGunthas }) => areaGunthas), [100.1, 100.1, 199.8]);
  assert.equal(filled.reduce((sum, { percentage }) => sum + Math.round(percentage * 100), 0), 10_000);

  const largeField = 10_000 * SQUARE_METRES_PER_GUNTHA;
  const withTinyPlot = CropAllocationsSchema.parse(updatePlotGunthas([
    plot({ plotId: "tiny", areaGunthas: 0.1, percentage: 0.01 }),
    plot({ plotId: "large", areaGunthas: 9999, percentage: 99.99 }),
  ], "large", 9999.9, largeField));
  assert.deepEqual(withTinyPlot.map(({ percentage }) => percentage), [0.01, 99.99]);
});

test("Portfolio opens and focuses a plot through the Land Bar without the retired grid", () => {
  const portfolio = readFileSync(new URL("../src/components/dashboard/PortfolioCard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(portfolio, /GunthaTiles/);
  assert.match(portfolio, /<LandBar [\s\S]*?onSelectPlot=\{selectLandPlot\}/);
  assert.match(portfolio, /row\.open = true/);
  assert.match(portfolio, /id="your-plots"/);
});

test("BulletGauge is store-free and SoilGauges mounts above the enrichment checklist", () => {
  const gauge = readFileSync(new URL("../src/components/viz/BulletGauge.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(gauge, /useBalramStore|from\s+["'][^"']*\/store\/|style=\{\{/);
  assert.match(gauge, /role="img"[^>]+aria-label=\{ariaLabel\}/);
  assert.match(gauge, /pinX === null && <rect/);
  const card = readFileSync(new URL("../src/components/dashboard/SoilCard.tsx", import.meta.url), "utf8");
  assert.match(card, /interpretation&&<>\s*<SoilGauges [^>]*\/>[\s\S]*?What Your Soil Needs Before Planting/);
});

test("pH controls rank a local copy, clamp and reset without writing to the saved result", () => {
  // Execute the component with a frozen store snapshot and a small hook harness.
  const saved = Object.freeze(soil({ ph: 10.4 }));
  const snapshot = Object.freeze({
    soilKitReading: saved, weatherSnapshot: null, now: Date.parse("2026-04-30T19:00:00Z"),
    locale: "en" as const, sampleDataActive: false,
  });
  let whatIfPh: number | null = null;
  let resets = 0;
  const inputs: Parameters<typeof getSeasonalCropRecommendations>[0][] = [];
  const modules = {
    react: {
      useId: () => "soil-audit",
      useRef: () => ({ current: { focus: () => { resets++; } } }),
      useState: () => [whatIfPh, (update: ((previous: number | null) => number) | null) => {
        whatIfPh = update === null ? null : update(whatIfPh);
      }],
    },
    "react/jsx-runtime": { jsx, jsxs },
    "@/components/viz/BulletGauge": { BulletGauge: "test-gauge" },
    "@/components/viz/VizCaption": { VizCaption: "test-caption" },
    "@/components/viz/VizTable": { VizTable: "test-table" },
    "@/config/i18n": { cropLabel, t },
    "@/lib/domain/calendar": { indiaDate },
    "@/lib/domain/cropRecommendations": { getSeasonalCropRecommendations: (input: typeof inputs[number]) => {
      inputs.push(input);
      return getSeasonalCropRecommendations(input);
    } },
    "@/lib/domain/viz/gaugeZones": { buildSoilGauges },
    "@/lib/ui/format": { formatNumber },
    "@/lib/ui/soilReadout": { describeSoilReadout, formatSoilNutrient },
    "@/store/useBalramStore": { useBalramStore: (select: (state: typeof snapshot) => unknown) => select(snapshot) },
  };
  const url = new URL("../src/components/dashboard/SoilGauges.tsx", import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  type Props = {
    children?: ReactNode; className?: string; onClick?: () => void; "aria-label"?: string;
    "aria-disabled"?: boolean; rows?: string[][];
  };
  const exports = {} as { SoilGauges: () => ReactElement<unknown, (props: unknown) => ReactNode> };
  runInNewContext(outputText, {
    exports, require: (id: keyof typeof modules) => {
      assert.ok(Object.hasOwn(modules, id), `unexpected module: ${id}`);
      return modules[id];
    },
  });
  const elements = (node: ReactNode): ReactElement<Props>[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
  };
  const render = () => {
    const result = exports.SoilGauges();
    return elements(result.type(result.props));
  };
  const increase = (view: ReturnType<typeof render>) =>
    view.find(node => node.props["aria-label"] === t("en").phIncrease)?.props;
  assert.equal(inputs.length, 0);
  assert.ok(increase(render())?.onClick);
  increase(render())!.onClick!();
  const trial = render();
  assert.equal(whatIfPh, 10.5);
  assert.equal(increase(trial)?.["aria-disabled"], true);
  increase(trial)!.onClick!();
  assert.equal(whatIfPh, 10.5);
  assert.equal(inputs[0].monthZeroIndexed, 4);
  assert.notEqual(inputs[0].soilKitReading, saved);
  assert.equal(inputs[0].soilKitReading?.ph, 10.5);
  assert.equal(trial.find(node => node.type === "test-table")?.props.rows?.[0][1], "10.4");
  const controls = trial.find(node => node.type === "section" && node.props.className?.includes("print:hidden"));
  assert.ok(controls);
  assert.equal(elements(controls).filter(node => node.type === "li").length, 3);
  const reset = trial.find(node => node.props.children === t("en").viz.soilGauges.reset);
  assert.ok(reset?.props.onClick);
  reset.props.onClick();
  assert.equal(whatIfPh, null);
  assert.equal(resets, 1);
  assert.ok(render().every(node => node.props.children !== t("en").viz.soilGauges.whatIf));
  assert.equal(snapshot.soilKitReading, saved);
  assert.equal(saved.ph, 10.4);
});

function loadVisualComponent<T>(path: string, modules: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {} as T;
  runInNewContext(outputText, {
    ...globals, exports, require: (id: string) => {
      if (id === "react/jsx-runtime") return { Fragment, jsx, jsxs };
      assert.ok(Object.hasOwn(modules, id), `unexpected module: ${id}`);
      return modules[id];
    },
  });
  return exports;
}

test("WaterDayColumn is store-free and renders the source's distinct provenance stroke", () => {
  const path = "../src/components/viz/WaterDayColumn.tsx";
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//);
  const strokes = loadVisualComponent("../src/components/viz/ProvenanceStroke.tsx", {});
  const { WaterDayColumn } = loadVisualComponent<{ WaterDayColumn: (props: Record<string, unknown>) => ReactElement }>(path, {
    react: { useId: () => "day-audit" }, "@/config/i18n": { t }, "./ProvenanceStroke": strokes,
  });
  const day = buildWaterRibbon({ weatherSnapshot: baseline(), plot: plot(), latitudeDeg: 18.5 })[0];
  const render = (provenance: typeof day.provenance) => renderToString(createElement(WaterDayColumn, {
    day: { ...day, provenance, heavyRainCaution: true, irrigate: true }, locale: "en", scaleMaxMm: 25,
    label: "Water planning for Sunday", weekday: "Sun", dateLabel: "22", temperatureLabel: "30°C",
    rainLabel: "0 mm", dialogId: "water-detail", onOpen: () => {},
  }));

  assert.match(render("typical_season"), /stroke-dasharray="2 4"/);
  assert.match(render("forecast"), /stroke-dasharray="6 4"/);
  assert.match(render("sample"), /fill="url\(#water-day-day-audit-pat-sample\)"/);
  assert.match(render("typical_season"), /aria-haspopup="dialog" aria-controls="water-detail"/);
  assert.match(render("typical_season"), /<title>Fertiliser caution<\/title>/);
  assert.match(render("typical_season"), /<title>Irrigation may be needed<\/title>/);
});

test("WaterRibbon labels baseline and illustrative rain, retains seven table rows and restores day focus", () => {
  const weatherSnapshot = baseline();
  weatherSnapshot.daily[0].precipitation = 26;
  weatherSnapshot.daily[0].referenceEvapotranspiration = 4;
  const snapshot = Object.freeze({
    weatherSnapshot, cropAllocations: [plot({ areaGunthas: 40 })], fieldGeometry: null,
    connection: "offline", locale: "en", landUnit: "gunthas", sampleDataActive: false, irrigationSetup: null,
    now: Date.parse(weatherSnapshot.fetchedAt) + 3_600_000,
  });
  const slots: unknown[] = [];
  let slot = 0;
  let afterRender: (() => void)[] = [];
  const { WaterRibbon } = loadVisualComponent<{ WaterRibbon: (props: { compact?: boolean }) => ReactElement }>(
    "../src/components/irrigation/WaterRibbon.tsx", {
      react: {
        useId: () => `audit-${slot++}`,
        useMemo: (factory: () => unknown) => factory(),
        useEffect: (effect: () => void) => { afterRender.push(effect); },
        useRef: (initial: unknown) => {
          const index = slot++;
          return slots[index] ?? (slots[index] = { current: initial });
        },
        useState: (initial: unknown) => {
          const index = slot++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], (value: unknown) => { slots[index] = value; }];
        },
      },
      "@/config/cropMatrix": { getCropStageKc, MaharashtraCropMatrix },
      "@/config/i18n": { cropLabel, t },
      "@/components/ui/ProvenanceBadge": { ProvenanceBadge: "test-provenance" },
      "@/components/ui/RadioChoices": { RadioChoices: "test-radio" },
      "@/components/viz/VizCaption": { VizCaption: "test-caption" },
      "@/components/viz/VizTable": { VizTable: "test-table" },
      "@/components/viz/WaterDayColumn": { WaterDayColumn: "test-day" },
      "@/lib/domain/allocation": { allocatePlotsByGunthas },
      "@/lib/domain/geometry": { GUNTHAS_PER_ACRE },
      "@/lib/domain/irrigation": { calculatePhaseWaterBreakdown, calculateSystemRuntime, resolveDailyEt0 },
      "@/lib/domain/viz/waterRibbon": { buildWaterRibbon },
      "@/lib/domain/landUnits": { displayPlotName, formatArea },
      "@/lib/ui/format": { formatNumber },
      "@/store/useBalramStore": { useBalramStore: (select: (state: typeof snapshot) => unknown) => select(snapshot) },
      "@/types/domain": { growthToLifecycleStage },
    });
  type Props = {
    children?: ReactNode; day?: ReturnType<typeof buildWaterRibbon>[number]; provenance?: string;
    summary?: string; className?: string; rows?: string[][]; onChange?: (scale: 50) => void;
    onOpen?: (date: string, trigger: { isConnected: true; focus(): void }) => void; onClose?: () => void;
    ref?: { current: unknown };
  };
  const elements = (node: ReactNode): ReactElement<Props>[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
  };
  const render = (compact = false) => {
    slot = 0;
    afterRender = [];
    const tree = elements(WaterRibbon({ compact }));
    for (const effect of afterRender) effect();
    return tree;
  };

  const initial = render();
  const caption = initial.find(node => node.type === "test-caption");
  assert.equal(caption?.props.provenance, "estimated");
  assert.equal(caption?.props.summary, "Typical for this season");
  assert.match(renderToString(initial[0]), /Offline · Weather saved.*1 hour ago/);
  initial.find(node => node.type === "test-radio")!.props.onChange!(50);
  const scaled = render();
  const table = scaled.find(node => node.type === "test-table");
  assert.equal(table?.props.rows?.length, 7);
  assert.equal(table?.props.rows?.[0][1], "13");
  const banner = scaled.find(node => node.props.className?.includes("bg-amber") &&
    Array.isArray(node.props.children) && node.props.children.includes("What if rain is lower · Illustrative"));
  assert.ok(banner && !banner.props.className?.includes("print:hidden"));
  const day = scaled.find(node => node.type === "test-day")!;
  assert.equal(day.props.day?.illustrative, true);
  assert.equal(day.props.day?.heavyRainCaution, true);

  let focusCount = 0;
  const modal = { open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  scaled.find(node => node.type === "dialog")!.props.ref!.current = modal;
  day.props.onOpen!(day.props.day!.date, { isConnected: true, focus() { focusCount++; } });
  const detail = render();
  assert.equal(modal.open, true);
  assert.ok(detail.some(node => node.type === "dt" && node.props.children === "Estimated daily runtime"));
  assert.ok(detail.some(node => node.type === "dd" && node.props.children === "0 min"));
  modal.close();
  detail.find(node => node.type === "dialog")!.props.onClose!();
  assert.equal(focusCount, 1);
  const compact = render(true);
  assert.equal(compact.filter(node => node.type === "test-day").length, 7);
  assert.ok(compact.every(node => node.type !== "test-radio" && node.type !== "test-table"));
  assert.ok(compact.filter(node => node.type === "test-day").every(node => !node.props.day?.illustrative));
  assert.equal(weatherSnapshot.daily[0].precipitation, 26);
});

test("stage progress withholds timing on the server, at harvest and for unknown crops", () => {
  const input = { cropId: "onion", lifecycleStage: "vegetative" as const, plantingDate: "2028-02-29", todayIso: "2028-03-28" };
  assert.equal(estimateWeeksToNextStage({ ...input, todayIso: null }), null);
  assert.equal(estimateWeeksToNextStage({ ...input, lifecycleStage: "harvesting" }), null);
  assert.equal(estimateWeeksToNextStage({ ...input, cropId: "constructor" }), null);
  assert.equal(estimateWeeksToNextStage({ ...input, plantingDate: "2027-02-29" }), null);
  assert.equal(estimateWeeksToNextStage({ ...input, todayIso: "2028-04-31" }), null);
});

test("stage progress uses the cumulative phase end across leap day and rounds up to at least one week", () => {
  const input = { cropId: "onion", lifecycleStage: "vegetative" as const, plantingDate: "2028-02-29", todayIso: "2028-03-28" };
  assert.deepEqual(estimateWeeksToNextStage(input), { weeksRemaining: 4, nextStage: "flowering_fruiting" });
  assert.deepEqual(estimateWeeksToNextStage({ ...input, todayIso: "2028-03-29" }), { weeksRemaining: 4, nextStage: "flowering_fruiting" });
  assert.deepEqual(estimateWeeksToNextStage({ ...input, todayIso: "2028-05-02" }), { weeksRemaining: 1, nextStage: "flowering_fruiting" });
  assert.deepEqual(estimateWeeksToNextStage({ ...input, plantingDate: null }), { weeksRemaining: 5, nextStage: "flowering_fruiting" });
  assert.deepEqual(estimateWeeksToNextStage({ ...input, todayIso: "2028-02-26" }), { weeksRemaining: 8, nextStage: "flowering_fruiting" });
  assert.deepEqual(estimateWeeksToNextStage({
    cropId: "bajra", lifecycleStage: "flowering_fruiting", plantingDate: "2027-12-28", todayIso: "2028-02-22",
  }), { weeksRemaining: 2, nextStage: "harvesting" });
});

test("StageRail is store-free and renders ordered stages and timing only when supplied", () => {
  const path = "../src/components/viz/StageRail.tsx";
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//);
  const illustration = loadVisualComponent("../src/components/viz/StageIllustration.tsx", {});
  const { StageRail } = loadVisualComponent<{ StageRail: (props: Record<string, unknown>) => ReactElement }>(path, {
    "@/config/i18n": { t }, "@/lib/ui/format": { formatNumber }, "@/types/domain": { LifecycleStageSchema },
    "./StageIllustration": illustration,
  });
  const render = (weeksToNext: ReturnType<typeof estimateWeeksToNextStage>) =>
    renderToString(createElement(StageRail, { locale: "en", stage: "vegetative", weeksToNext }));
  const server = render(null);
  assert.match(server, /Planned.*aria-current="step".*Vegetative.*Flowering \/ Fruiting.*Harvesting/s);
  assert.equal((server.match(/<svg[^>]*class="size-8"/g) ?? []).length, 4);
  assert.match(server, /sr-only">Completed/);
  assert.doesNotMatch(server, /About /);
  assert.match(render({ weeksRemaining: 1, nextStage: "flowering_fruiting" }), /About 1 week to Flowering \/ Fruiting/);
  assert.match(render({ weeksRemaining: 4, nextStage: "flowering_fruiting" }), /About 4 weeks to Flowering \/ Fruiting/);
});

test("SkyScene is store-free and draws distinct weather treatments and provenance cues", () => {
  const path = "../src/components/viz/SkyScene.tsx";
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//);
  const strokes = loadVisualComponent("../src/components/viz/ProvenanceStroke.tsx", {});
  const { SkyScene } = loadVisualComponent<{ SkyScene: (props: Record<string, unknown>) => ReactElement }>(path, {
    react: { useId: () => "scene-audit" }, "./ProvenanceStroke": strokes,
  });
  const render = (condition: string | null, provenance = "forecast", dominantStage = "vegetative") =>
    renderToString(createElement(SkyScene, { condition, dominantStage, provenance, locale: "en", ariaLabel: "Farm sky summary" }));

  assert.match(render("clear_hot"), /role="img" aria-label="Farm sky summary"/);
  assert.match(render("clear_hot"), /fill="#FFBF00"/);
  assert.match(render("clear_mild"), /stop-color="#E0F2FE"/);
  assert.match(render("clear_mild"), /stroke-dasharray="6 4"/);
  assert.match(render("partly_cloudy", "typical_season"), /stroke-dasharray="2 4"/);
  assert.equal((render("partly_cloudy").match(/class="sky-cloud-drift"/g) ?? []).length, 1);
  for (const condition of ["light_rain", "heavy_rain"]) {
    const rain = render(condition, "sample");
    assert.match(rain, /stroke="#0369A1"/);
    assert.match(rain, /fill="url\(#sky-scene-audit-pat-sample\)"/);
    assert.doesNotMatch(rain, /sky-cloud-drift/);
  }
  assert.notEqual(render("clear_mild", "forecast", "planned"), render("clear_mild", "forecast", "harvesting"));
  assert.doesNotMatch(render(null), /sky-cloud-drift|stroke="#0369A1"/);

  const motion = readFileSync(new URL("../src/styles/motion.css", import.meta.url), "utf8");
  assert.match(motion, /prefers-reduced-motion: no-preference\)\s*\{\s*\.sky-cloud-drift\s*\{\s*animation: sky-cloud-drift calc\(var\(--dur-skeleton\)/);
  assert.match(motion, /prefers-reduced-motion: reduce\)\s*\{\s*\.sky-cloud-drift\s*\{\s*animation: none/);
});

test("CropFitTiles is store-free and each Marathi status has a visible word and distinct shape", () => {
  const path = "../src/components/viz/CropFitTiles.tsx";
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//);
  const { CropFitTiles } = loadVisualComponent<{ CropFitTiles: (props: Record<string, unknown>) => ReactElement }>(path, {
    "@/config/i18n": { t },
  });
  const tiles = renderToString(createElement(CropFitTiles, {
    locale: "mr", fit: { soil: "good", water: "fair", sowing: "needs_help" },
  }));
  assert.match(tiles, /grid-cols-3 gap-2/);
  assert.match(tiles, /माती.*योग्य.*पाणी.*ठीक.*पेरणी.*काळजी घ्या/);
  assert.equal((tiles.match(/<dt /g) ?? []).length, 3);
  assert.equal((tiles.match(/<dd /g) ?? []).length, 3);
  assert.equal(new Set([...tiles.matchAll(/<path d="([^"]+)"/g)].map(match => match[1])).size, 3);
});

test("Today's sky labels the baseline and leaves missing weather unbadged", () => {
  const weatherSnapshot = baseline();
  const state = {
    weatherSnapshot: weatherSnapshot as typeof weatherSnapshot | null,
    cropAllocations: [plot({ lifecycleStage: "vegetative" })], locale: "en", sampleDataActive: false,
  };
  const { TodaysSky } = loadVisualComponent<{ TodaysSky: () => ReactElement }>("../src/components/home/TodaysSky.tsx", {
    "@/components/ui/ProvenanceBadge": { ProvenanceBadge: "test-provenance" },
    "@/components/viz/SkyScene": { SkyScene: "test-sky" },
    "@/components/viz/StageIllustration": { StageIllustration: () => null },
    "@/config/i18n": { t }, "@/lib/domain/viz/skyCondition": { deriveSkyCondition }, "@/lib/ui/format": { formatNumber },
    "@/store/useBalramStore": { useBalramStore: (select: (value: typeof state) => unknown) => select(state) },
  });
  const mockSceneProps = (node: ReactNode): Record<string, unknown> | undefined => {
    if (Array.isArray(node)) return node.map(mockSceneProps).find(Boolean);
    if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
    return node.type === "test-sky" ? node.props : mockSceneProps(node.props.children);
  };
  const initial = TodaysSky();
  assert.match(renderToString(initial), /Typical for the season.*<time datetime="2026-11-22".*provenance="estimated"/si);
  assert.match(String(mockSceneProps(initial)?.ariaLabel), /Minimum temperature.*Maximum temperature.*Main crop stage · Vegetative/);
  state.weatherSnapshot = null;
  const missing = TodaysSky();
  assert.equal(mockSceneProps(missing)?.condition, null);
  assert.doesNotMatch(renderToString(missing), /provenance="estimated"|<time/);
});

test("CalendarRibbon is store-free, windows 6 or 12 months and omits Today on the server", () => {
  const path = "../src/components/viz/CalendarRibbon.tsx";
  assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), "utf8"), /useBalramStore|from\s+["'][^"']*\/store\//);
  const strokes = loadVisualComponent("../src/components/viz/ProvenanceStroke.tsx", {});
  const { CalendarRibbon } = loadVisualComponent<{ CalendarRibbon: (props: Record<string, unknown>) => ReactElement }>(path, {
    react: { useId: () => "calendar-audit" }, "@/config/i18n": { seasonLabel, t },
    "@/types/domain": { LifecycleStageSchema }, "./ProvenanceStroke": strokes,
  });
  const allocations = [
    plot({ plotId: "onion-a", plantingDate: "2027-12-20" }),
    plot({ plotId: "bajra-b", cropId: "bajra", plantingDate: null }),
  ];
  const render = (todayIso: string | null, printStatic: boolean, half = 0) => renderToString(createElement(CalendarRibbon, {
    layout: buildCropCalendar({ allocations, todayIso }), locale: "en", printStatic, half,
    labels: [
      { key: "onion-a", name: "Well Plot", crop: "Onion", needsPlantingDate: false },
      { key: "bajra-b", name: "Canal Plot", crop: "Bajra", needsPlantingDate: true },
    ],
    formatDate: (date: string) => date, selectedKey: "onion-a", actionsId: "actions",
    onHalfChange: () => {}, onPlotSelect: () => {},
  }));

  const server = render(null, false);
  assert.match(server, /grid-cols-6/);
  assert.match(server, /grid-cols-12/);
  assert.match(server, /aria-pressed="true" aria-controls="actions"/);
  assert.match(server, /Add planting date to chart harvest/);
  assert.doesNotMatch(server, /aria-label="Today"/);
  const july = render("2028-07-03", false, 1);
  assert.equal((july.match(/aria-label="Today"/g) ?? []).length, 2);
  assert.match(july, /Jul<!-- --> – <!-- -->Dec|Jul – Dec/);
  const january = render("2028-07-03", false, 0);
  assert.equal((january.match(/aria-label="Today"/g) ?? []).length, 1);
  const printable = render(null, true);
  assert.doesNotMatch(printable, /<button|grid-cols-6|aria-label="Today"/);
  assert.match(printable, /grid-cols-12/);
  assert.match(printable, /Harvest estimate · 2028-04-17/);
  assert.match(printable, /fill="url\(#calendar-calendar-audit-pat-stripes\)"/);
  assert.match(printable, /stroke-dasharray="3 2"/);
});

test("CropCalendar supplies the hydrated Today marker and filters actions by selected plot", () => {
  const allocations = [
    plot({ plotId: "named", plotName: "Well Plot" }),
    plot({ cropId: "bajra", plotName: "Canal Plot" }),
  ];
  const state = {
    locale: "en", sampleDataActive: false, cropAllocations: allocations,
    fieldGeometry: null, soilKitReading: null, weatherSnapshot: null, irrigationSetup: null, now: null,
  } as unknown as Parameters<typeof farmRoadmap>[0];
  let todayIso: string | null = null;
  let slot = 0;
  const slots: unknown[] = [];
  const { CropCalendar } = loadVisualComponent<{ CropCalendar: (props: { printStatic?: boolean }) => ReactElement }>(
    "../src/components/journey/CropCalendar.tsx", {
      react: {
        useId: () => `calendar-audit-${slot++}`,
        useMemo: (factory: () => unknown) => factory(),
        useState: (initial: unknown) => {
          const index = slot++;
          if (!(index in slots)) slots[index] = initial;
          return [slots[index], (next: unknown) => {
            slots[index] = typeof next === "function" ? next(slots[index]) : next;
          }];
        },
      },
      "@/config/i18n": { cropLabel, t },
      "@/components/viz/CalendarRibbon": { CalendarRibbon: "test-ribbon" },
      "@/components/viz/VizCaption": { VizCaption: "test-caption" },
      "@/components/viz/VizTable": { VizTable: "test-table" },
      "@/lib/domain/landUnits": { displayPlotName },
      "@/lib/domain/viz/calendarLayout": { buildCropCalendar },
      "@/lib/ui/farmRoadmap": { farmRoadmap },
      "@/lib/ui/useNow": { useNow: () => ({ todayIso }) },
      "@/store/useBalramStore": { useBalramStore: (select: (value: typeof state) => unknown) => select(state) },
      "@/types/domain": { growthToLifecycleStage },
      "./RoadmapList": { RoadmapList: "test-roadmap" },
    });
  type Props = {
    children?: ReactNode;
    layout?: ReturnType<typeof buildCropCalendar>;
    half?: number;
    printStatic?: boolean;
    onHalfChange?: (half: 0 | 1) => void;
    onPlotSelect?: (key: string) => void;
    items?: ReturnType<typeof farmRoadmap>;
  };
  const elements = (node: ReactNode): ReactElement<Props>[] => {
    if (Array.isArray(node)) return node.flatMap(elements);
    return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
  };
  const render = (printStatic = false) => {
    slot = 0;
    return elements(CropCalendar({ printStatic }));
  };
  const ribbon = (view: ReturnType<typeof render>) => view.find(node => node.type === "test-ribbon")!.props;
  const actions = (view: ReturnType<typeof render>) => view.find(node => node.type === "test-roadmap")?.props.items;
  assert.equal(ribbon(render()).layout?.todayXPercent, null);
  assert.equal(ribbon(render()).half, 0);
  todayIso = "2026-11-22";
  assert.notEqual(ribbon(render()).layout?.todayXPercent, null);
  assert.equal(ribbon(render()).half, 1);

  ribbon(render()).onHalfChange!(0);
  assert.equal(ribbon(render()).half, 0);
  ribbon(render()).onPlotSelect!("plot:named");
  assert.deepEqual(actions(render())?.map(item => item.plotId), ["named"]);
  ribbon(render()).onPlotSelect!("legacy:1");
  assert.deepEqual(actions(render())?.map(item => item.title.en), ["Prepare Canal Plot for sowing"]);
  assert.equal(state.cropAllocations[1].plotId, undefined);
  assert.equal(actions(render(true)), undefined);
  assert.equal(ribbon(render(true)).printStatic, true);
});

function farmCardAction(id: string, en: string, mr: string): RoadmapItem {
  return {
    id, title: { en, mr }, detail: { en: "Private point 73.781234", mr: "खासगी बिंदू १८.५४१२३४" },
    bucket: "this_week", kind: "harvest", priority: 1, plotId: null, provenance: "you_entered",
  };
}

test("Farm Card SVG escapes localized display text and excludes coordinates and private records", () => {
  const roadmap = [
    farmCardAction("one", "Check & prepare harvest 18.521234", "काढणीची तयारी & तपासा १८.५२१२३४"),
    farmCardAction("two", "Check plot readiness", "प्लॉटची तयारी तपासा"),
    farmCardAction("three", "Omitted third action", "तिसरे वगळलेले काम"),
  ];
  for (const locale of ["en", "mr"] as const) {
    const fixture = createSampleFixture();
    const state = {
      ...fixture, locale, sampleDataActive: false,
      farmProfile: { ...fixture.farmProfile!, name: locale === "en" ? "Green & <Farm>" : "हिरवे & <शेत>" },
      fieldGeometry: { ...fixture.fieldGeometry!, boundary: { type: "Polygon" as const, coordinates: [[
        [73.8533333, 18.5211111], [73.8544444, 18.5222222], [73.8555555, 18.5233333], [73.8533333, 18.5211111],
      ]] as NonNullable<NonNullable<typeof fixture.fieldGeometry>["boundary"]>["coordinates"] },
      },
      cropAllocations: [{ ...fixture.cropAllocations[0], plotName: "Plot <7> 73.8567" }, fixture.cropAllocations[1]],
    };
    const svg = buildFarmCardSvg({ state, roadmap });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1080" height="1080"[^>]*>[\s\S]*<\/svg>$/);
    assert.equal(svg.includes(`lang="${locale}"`), true);
    assert.match(svg, locale === "en" ? /Green &amp; &lt;Farm&gt;/ : /हिरवे &amp; &lt;शेत&gt;/);
    assert.match(svg, /Plot &lt;7&gt;/);
    assert.ok(svg.includes(cropLabel(locale, "bajra")));
    assert.ok(svg.includes(t(locale).stageNames.harvesting));
    assert.ok(svg.includes(formatArea(80, state.landUnit, locale)));
    assert.match(svg, locale === "en" ? /Check &amp; prepare harvest/ : /काढणीची तयारी &amp; तपासा/);
    assert.ok(svg.includes(t(locale).provenance.you_entered));
    assert.doesNotMatch(svg, /18\.52|73\.85|१८\.५२|Private point|खासगी बिंदू|<script|<foreignObject|Omitted third action|तिसरे वगळलेले काम/);
  }
});

test("Farm Card uses only scalar area and caps the plotted segments and names on larger farms", () => {
  const fixture = createSampleFixture();
  const area = 400_000 * SQUARE_METRES_PER_GUNTHA;
  const inaccessible = () => { throw new Error("The exporter accessed private map data"); };
  const fieldGeometry = Object.defineProperties({ areaSquareMetres: area }, {
    center: { get: inaccessible }, boundary: { get: inaccessible }, fieldId: { get: inaccessible },
  }) as NonNullable<typeof fixture.fieldGeometry>;
  const state = {
    ...fixture, fieldGeometry,
    cropAllocations: Array.from({ length: 8 }, (_, i) => plot({
      plotId: `plot-${i}`, plotName: `Plot ${i + 1}`, percentage: 12.5, areaGunthas: 50_000,
    })),
  };
  Object.defineProperty(state, "weatherSnapshot", { get: inaccessible });
  const svg = buildFarmCardSvg({ state, roadmap: [] });
  const segments = svg.match(/data-land-segment="plot"/g) ?? [];
  assert.equal(segments.length, MAX_VISIBLE_BAR_PLOTS);
  assert.match(svg, /height="56"/);
  assert.match(svg, /\+2 more plots/);
  assert.match(svg, /Sample farm · For illustration/);
  assert.doesNotMatch(svg, />Plot 8</);
});

test("Farm Card button exports PNG files, falls back locally and respects cancelled shares", async () => {
  const state = createSampleFixture();
  const slots: unknown[] = [];
  let cursor = 0;
  let supportsFileShare = true;
  let cancelShare = false;
  let shared = 0;
  let downloaded = 0;
  let revoked = 0;
  const anchor = {
    href: "", download: "",
    click() {
      assert.equal(this.href, "blob:mock-png");
      assert.match(this.download, /^balram-farm-card-\d{4}-\d{2}-\d{2}\.png$/);
      downloaded++;
    },
    remove() {},
  };
  class MockImage {
    onload?: () => void;
    set src(url: string) {
      const prefix = "data:image/svg+xml;charset=utf-8,";
      assert.ok(url.startsWith(prefix));
      assert.match(decodeURIComponent(url.slice(prefix.length)), /width="1080" height="1080"/);
      this.onload?.();
    }
  }
  const png = new Blob(["png-test"], { type: "image/png" });
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({
      drawImage(image: unknown, x: number, y: number, w: number, h: number) {
        assert.ok(image instanceof MockImage);
        assert.deepEqual([x, y, w, h], [0, 0, 1080, 1080]);
      },
    }),
    toBlob(callback: (value: Blob) => void, type: string) {
      assert.deepEqual([this.width, this.height, type], [1080, 1080, "image/png"]);
      callback(png);
    },
  };
  type Props = { children?: ReactNode; onClick?: () => Promise<void> };
  const { FarmCardShareButton } = loadVisualComponent<{
    FarmCardShareButton: (props: { state: typeof state; roadmap: RoadmapItem[] }) => ReactElement<Props>;
  }>("../src/components/ui/FarmCardShareButton.tsx", {
    react: {
      useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value: unknown) => { slots[index] = value; }];
      },
      useRef: () => ({ current: false }),
    },
    "@/config/i18n": { t }, "@/lib/domain/calendar": { indiaDate },
    "@/lib/ui/farmCardSvg": { buildFarmCardSvg, FARM_CARD_SIZE },
  }, {
    Image: MockImage, File, DOMException,
    navigator: {
      canShare: ({ files }: { files: File[] }) => {
        assert.equal(files[0].type, "image/png");
        return supportsFileShare;
      },
      share: async ({ files }: { files: File[] }) => {
        if (cancelShare) throw new DOMException("Cancelled", "AbortError");
        assert.match(files[0].name, /^balram-farm-card-\d{4}-\d{2}-\d{2}\.png$/);
        shared++;
      },
    },
    document: {
      createElement: (tag: string) => tag === "canvas" ? canvas : anchor, body: { append() {} },
    },
    URL: {
      createObjectURL: (blob: Blob) => { assert.equal(blob, png); return "blob:mock-png"; },
      revokeObjectURL: () => { revoked++; },
    },
    window: { setTimeout: (callback: () => void) => callback() },
  });
  const click = async () => {
    cursor = 0;
    const view = FarmCardShareButton({ state, roadmap: [] });
    const button = (view.props.children as ReactElement<Props>[])[0];
    await button.props.onClick!();
  };

  await click();
  assert.deepEqual([shared, downloaded], [1, 0]);
  cancelShare = true;
  await click();
  assert.deepEqual([shared, downloaded], [1, 0]);
  supportsFileShare = false;
  await click();
  assert.deepEqual([shared, downloaded, revoked], [1, 1, 1]);
  cursor = 0;
  assert.match(renderToString(FarmCardShareButton({ state, roadmap: [] })), /role="status"[^>]*>Farm card downloaded\./);
});

test("Land Bar renders a fixed-height set of plot buttons and keeps the full table accessible", () => {
  const strokes = loadVisualComponent("../src/components/viz/ProvenanceStroke.tsx", {});
  const table = loadVisualComponent("../src/components/viz/VizTable.tsx", { "@/config/i18n": { t } });
  const { LandBar } = loadVisualComponent<{ LandBar: (props: Record<string, unknown>) => ReactElement }>(
    "../src/components/ui/LandBar.tsx", {
      react: { useId: () => "land-audit" },
      "@/config/i18n": { cropLabel, t },
      "@/components/ui/ProvenanceBadge": { ProvenanceBadge: () => null },
      "@/components/viz/ProvenanceStroke": strokes,
      "@/components/viz/VizTable": table,
      "@/lib/domain/landUnits": { displayPlotName, formatArea },
      "@/lib/domain/viz/barSegments": { barSegments },
      "@/lib/ui/format": { formatNumber },
      "@/types/domain": { growthToLifecycleStage },
    },
  );
  for (const count of [1, 3, 8]) {
    const plots = Array.from({ length: count }, (_, index) => plot({
      plotId: `plot-${index}`, plotName: `Plot ${index + 1}`, areaGunthas: 1,
    }));
    const markup = renderToString(createElement(LandBar, {
      totalGunthas: 400, allocatedGunthas: count, plots, selectedPlotId: "plot-0",
      onSelectPlot: () => {}, onShowAllPlots: () => {}, unit: "gunthas", locale: "mr", sampleDataActive: false,
    }));
    assert.match(markup, /flex h-14 min-w-\[320px\]/);
    assert.match(markup, /प्लॉट 1 · कांदा · 1 गुंठा/);
    const widths = [...markup.matchAll(/<button[^>]*style="width:([\d.]+)%"[^>]*min-h-14 min-w-12/g)];
    assert.equal(widths.length, Math.min(count, 6));
    for (const match of widths) assert.ok(Number(match[1]) * 3.2 >= 48);
    assert.match(markup, /aria-pressed="true"/);
    assert.match(markup, /pat-fallow/);
    assert.match(markup, /sr-only peer-open:hidden print:!block print:not-sr-only/);
    assert.equal((markup.match(/scope="row"/g) ?? []).length, 2 * (count + 1));
    if (count === 8) assert.match(markup, /\+२ इतर/);
  }
});
