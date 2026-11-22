import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import ts from "typescript";
import { cropLabel, t } from "../src/config/i18n";
import { indiaDate } from "../src/lib/domain/calendar";
import { formatNumber } from "../src/lib/ui/format";
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
import { layoutTiles } from "../src/lib/domain/viz/tileLayout";
import { buildWaterRibbon, HEAVY_RAIN_CAUTION_MM } from "../src/lib/domain/viz/waterRibbon";
import { useNow } from "../src/lib/ui/useNow";
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

test("Guntha Tiles mounts after LandBar and uses the responsive, store-backed allocation path", () => {
  const dashboard = new URL("../src/components/dashboard/", import.meta.url);
  const tiles = readFileSync(new URL("GunthaTiles.tsx", dashboard), "utf8");
  const portfolio = readFileSync(new URL("PortfolioCard.tsx", dashboard), "utf8");
  assert.match(tiles, /useMemo\(\(\) => layoutTiles\(totalGunthas, state\.cropAllocations\),\s*\[totalGunthas, state\.cropAllocations\]\)/);
  assert.match(tiles, /AcreCard = memo\(/);
  assert.match(tiles, /next = updatePlotGunthas\(/);
  assert.doesNotMatch(tiles, /\bpercentage\s*[:=]|style=\{\{/);
  assert.match(tiles, /role="img"[^>]+md:hidden/);
  assert.match(tiles, /min-h-12 min-w-12/);
  assert.match(tiles, /paintEnabled \? "md:touch-none" : ""/);
  assert.match(tiles, /<VizTable /);
  assert.match(tiles, /<VizCaption [^>]+sampleDataActive \? "sample" : "you_entered"/);
  assert.match(portfolio, /<LandBar [^>]*\/>\s*<GunthaTiles\s*\/>/);
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

function loadVisualComponent<T>(path: string, modules: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {} as T;
  runInNewContext(outputText, {
    exports, require: (id: string) => {
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
