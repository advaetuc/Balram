import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as i18n from "../src/config/i18n";
import * as cropMatrix from "../src/config/cropMatrix";
import * as calendar from "../src/lib/domain/calendar";
import * as cropRecommendations from "../src/lib/domain/cropRecommendations";
import * as fieldVoice from "../src/lib/domain/fieldVoice";
import * as geometry from "../src/lib/domain/geometry";
import * as irrigation from "../src/lib/domain/irrigation";
import * as landUnits from "../src/lib/domain/landUnits";
import * as soilChemistry from "../src/lib/domain/soilChemistry";
import * as soilKit from "../src/lib/domain/soilKit";
import * as gaugeZones from "../src/lib/domain/viz/gaugeZones";
import * as waterRibbon from "../src/lib/domain/viz/waterRibbon";
import * as farmRoadmap from "../src/lib/ui/farmRoadmap";
import * as format from "../src/lib/ui/format";
import * as soilReadout from "../src/lib/ui/soilReadout";
import * as domain from "../src/types/domain";
import { createEmptyFixture } from "../src/mocks/fixtures";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const unrelated = () => null;
const locales = ["en", "mr"] as const;
const retiredWarnings = /simulat|demo|mock|not a real lab|काल्पनिक|प्रात्यक्षिक|प्रत्यक्ष खताची मात्रा ठरवण्यासाठी हे निकाल वापरू नका/i;

function renderer({ locale = "en", reading = null, sampleDataActive = false, openCalculations = false, lcdSecond = false }: {
  locale?: domain.Locale;
  reading?: domain.SoilKitReading | null;
  sampleDataActive?: boolean;
  openCalculations?: boolean;
  lcdSecond?: boolean;
} = {}) {
  const state = { ...createEmptyFixture(), hydrated: Boolean(reading), now: null, locale, soilKitReading: reading, sampleDataActive };
  const modules: Record<string, unknown> = {
    react: { ...react, useState: (value: unknown) => react.useState(
      openCalculations && value === "soil" ? "calculations" : lcdSecond && value === false ? true : value,
    ) },
    "react/jsx-runtime": jsxRuntime,
    "@/config/i18n": i18n,
    "@/config/cropMatrix": cropMatrix,
    "@/lib/domain/calendar": calendar,
    "@/lib/domain/cropRecommendations": cropRecommendations,
    "@/lib/domain/fieldVoice": fieldVoice,
    "@/lib/domain/geometry": geometry,
    "@/lib/domain/irrigation": irrigation,
    "@/lib/domain/landUnits": landUnits,
    "@/lib/domain/soilChemistry": soilChemistry,
    "@/lib/domain/soilKit": soilKit,
    "@/lib/domain/viz/gaugeZones": gaugeZones,
    "@/lib/domain/viz/waterRibbon": waterRibbon,
    "@/lib/ui/farmRoadmap": farmRoadmap,
    "@/lib/ui/format": format,
    "@/lib/ui/soilReadout": soilReadout,
    "@/lib/ui/useNow": { useNow: () => ({ todayIso: null }) },
    "@/types/domain": domain,
    "@/store/useBalramStore": { useBalramStore: (select: (value: typeof state) => unknown) => select(state) },
    "@/components/ui/FarmCardShareButton": { FarmCardShareButton: unrelated },
    "@/components/ui/ShareSummaryButton": { ShareSummaryButton: unrelated },
    "@/components/journey/CropCalendar": { CropCalendar: unrelated },
    "@/components/viz/WaterDayColumn": { WaterDayBar: unrelated },
  };
  const cache = new Map<string, Record<string, unknown>>();

  function load(file: string) {
    const cached = cache.get(file);
    if (cached) return cached;
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), { fileName: file, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    } });
    const exports: Record<string, unknown> = {};
    cache.set(file, exports);
    const execute = runInThisContext(`(function(exports, require) { ${outputText}\n })`, { filename: file });
    execute(exports, (specifier: string) => {
      if (Object.hasOwn(modules, specifier)) return modules[specifier];
      assert.match(specifier, /^(\.\/|@\/components\/)/);
      return load(specifier.startsWith("@/")
        ? resolve(sourceRoot, specifier.slice(2) + ".tsx")
        : resolve(dirname(file), specifier + ".tsx"));
    });
    return exports;
  }

  return function render(path: string, props: Record<string, unknown> = {}) {
    const name = path.split("/").at(-1)!;
    const component = load(resolve(sourceRoot, "components", path + ".tsx"))[name] as react.ComponentType<typeof props>;
    return renderToStaticMarkup(react.createElement(component, props));
  };
}

const reading = domain.SoilKitReadingSchema.parse({
  testedAt: "2026-11-27", kitType: "balram_inhouse", ph: 7.1,
  nitrogenLevel: "low", phosphorusLevel: "low",
  nitrogenKgPerHa: 0, phosphorusKgPerHa: 0,
  potassiumLevel: "untested", organicCarbon: "untested", salinity: "untested",
  moistureLevel: "moist", moisturePercent: 48, phosphorusBlueIntensity: 4,
  dataStatus: "simulated",
});

test("SoilCard prerenders Soil Test and mounts calculator contents only for the active tab", () => {
  const markup = renderer()("dashboard/SoilCard");
  assert.match(markup, /aria-selected="true"[^>]*>Soil Test<\/button>/);
  assert.match(markup, /aria-selected="false"[^>]*>Calculations<\/button>/);
  assert.match(markup, /role="tabpanel"[^>]+hidden=""[^>]*><\/div>/);
  assert.doesNotMatch(markup, /Nitrogen lab calculator|Simulated demo presets/);
  const open = renderer({ openCalculations: true })("dashboard/SoilCard");
  assert.match(open, /aria-selected="true"[^>]*>Calculations<\/button>/);
  assert.match(open, /Nitrogen lab calculator/);
  for (const locale of locales) {
    const markup = renderer({ locale, openCalculations: true })("dashboard/SoilCard");
    const label = i18n.t(locale).soilLab.regionalPreset.name;
    assert.equal(markup.split(`>${label}</button>`).length, 2);
    assert.doesNotMatch(markup, retiredWarnings);
  }
});

test("five tactile phosphorus swatches show the selected level and map to the expected bands", () => {
  const render = renderer();
  for (const [index, level] of ["low", "low", "medium", "high", "high"].entries()) {
    const value = index + 1;
    const markup = render("dashboard/BlueIntensityPicker", { locale: "en", value });
    const copy = i18n.t("en");
    assert.match(markup, /role="radiogroup"/);
    assert.equal([...markup.matchAll(/type="radio"/g)].length, 5);
    assert.equal([...markup.matchAll(/min-h-12 min-w-12/g)].length, 5);
    assert.match(markup, new RegExp(`<input[^>]*(?:value="${value}"[^>]*checked=""|checked=""[^>]*value="${value}")[^>]*>`));
    assert.match(markup, new RegExp(`aria-live="polite"[^>]*>${copy[level as domain.NutrientLevel]}<`));
    for (const intensity of [1, 2, 3, 4, 5]) assert.match(markup, new RegExp(`aria-hidden="true">${intensity}<`));
  }
});

test("preset ranges are collapsed and show exact reference bands in both languages", () => {
  const render = renderer();
  for (const locale of locales) {
    const markup = render("dashboard/PresetRangesDisclosure", { locale });
    const text = i18n.t(locale);
    assert.match(markup, /<details(?![^>]*\bopen(?:=|\s|>))[^>]*>/);
    for (const label of [text.soilLab.ranges.ph, text.soilLab.moisture.label, text.soilLab.ranges.nitrogen,
      text.soilLab.ranges.phosphorus, text.soilLab.blue.scale]) assert.ok(markup.includes(label), label);
    const n = (value: number) => format.formatNumber(value, 1, locale);
    for (const [min, max, unit] of [[6.5, 7.5, "{0}"], [30, 65, "{0}%"], [280, 560, text.soilLab.units.kgPerHa],
      [10, 25, text.soilLab.units.kgPerHa]] as const) {
      for (const band of [`&lt; ${n(min)}`, `${n(min)}–${n(max)}`, `&gt; ${n(max)}`]) {
        assert.ok(markup.includes(unit.replace("{0}", band)), band);
      }
    }
    for (const [band, level] of [[`${n(1)}–${n(2)}`, text.low], [n(3), text.medium], [`${n(4)}–${n(5)}`, text.high]]) {
      assert.ok(markup.includes(`>${band}</span> · ${level}<`));
    }
  }
});

test("the LCD has two manual screens and keeps invalid input visible without timers", () => {
  const valid = { locale: "en", screen1: ["B: 10.00 mL", "S: 10.00 mL"], screen2: ["N: 0.00 kg/ha", "LOW"], invalid: false };
  const first = renderer()("dashboard/LcdPreview", valid);
  assert.match(first, /Screen 1.*B: 10\.00 mL.*S: 10\.00 mL.*Show screen 2/s);
  const second = renderer({ lcdSecond: true })("dashboard/LcdPreview", valid);
  assert.match(second, /Screen 2.*N: 0\.00 kg\/ha.*LOW.*Show screen 1/s);
  const invalid = renderer({ lcdSecond: true })("dashboard/LcdPreview", {
    ...valid, invalid: true, screen1: ["INVALID INPUT", "Check S and B"],
  });
  assert.match(invalid, /Screen 1.*role="alert".*INVALID INPUT.*Check S and B/s);
  assert.doesNotMatch(invalid, /N: 0\.00/);
  const source = readFileSync(resolve(sourceRoot, "components/dashboard/LcdPreview.tsx"), "utf8");
  assert.doesNotMatch(source, /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/);
});

for (const locale of locales) {
  const copy = i18n.t(locale);
  const n = (value: number) => format.formatNumber(value, 2, locale);
  const zero = locale === "mr" ? "०.००" : "0.00";
  for (const path of ["dashboard/SoilGauges", "report/FarmReport"]) {
    test(`${path} displays zeros, moisture, blue intensity and normal provenance for legacy statuses in ${locale}`, () => {
      const markup = renderer({ locale, reading })(path);
      assert.doesNotMatch(markup, /&lt;(?:0\.01|०\.०१)/);
      assert.ok(markup.split(`${zero} kg/ha`).length >= 3);
      assert.ok(markup.includes(copy.soilLab.moisture.label));
      assert.ok(markup.includes(`${n(48)}% · ${copy.soilLab.moisture.levels.moist}`));
      assert.ok(markup.includes(`${n(4)}/${n(5)} · ${copy.soilLab.blue.swatches[4]}`));
      assert.doesNotMatch(markup, retiredWarnings);
      assert.doesNotMatch(markup, /pat-sample/);
      assert.ok(markup.includes(copy.provenance.measured_by_kit));
      if (path.endsWith("SoilGauges")) {
        const printTable = markup.split('class="hidden print:block"').at(-1)!;
        assert.ok(printTable.includes(copy.soilLab.moisture.label));
        assert.ok(printTable.includes(`${n(30)}–${n(65)}%`));
      } else {
        assert.match(markup, /print:break-inside-avoid/);
        const amount = copy.soilLab.units.kgPerHa.replace("{0}", zero);
        assert.ok(markup.includes(`(${amount})`));
      }
    });
  }
}

test("qualitative soil readings show moisture and optical context without a nutrient quantity", () => {
  const { soilLab } = i18n.t("en");
  const optical = { ...reading, dataStatus: "screening" as const, nitrogenKgPerHa: null,
    phosphorusKgPerHa: null, moistureLevel: "dry" as const, moisturePercent: null,
    labCalculation: { tcs3200RawUs: { r: 1350, g: 1250, b: 1000 }, tcs3200RelativeScore: 50 } };
  const render = renderer({ reading: optical });
  for (const path of ["dashboard/SoilGauges", "report/FarmReport"]) {
    const markup = render(path);
    assert.ok(markup.includes(soilLab.moisture.levels.dry));
    assert.ok(markup.includes(soilLab.savedOpticalNote));
    assert.ok(markup.includes("4/5 · Darker blue"));
    assert.doesNotMatch(markup, /0\.00 kg\/ha|pat-sample|Simulated demo soil data/);
  }
});

test("the sample farm still hatches its readings", () => {
  const render = renderer({ reading: { ...reading, dataStatus: "screening" }, sampleDataActive: true });
  for (const path of ["dashboard/SoilGauges", "report/FarmReport"]) {
    const markup = render(path);
    assert.match(markup, /pat-sample/);
    assert.doesNotMatch(markup, /Simulated demo soil data/);
  }
});

test("legacy soil values omit absent hardware readouts and tiny positive quantities retain their lower bound", () => {
  const legacy = { ...reading, dataStatus: undefined, moistureLevel: undefined, moisturePercent: undefined,
    phosphorusBlueIntensity: undefined, nitrogenKgPerHa: 0.001, phosphorusKgPerHa: null };
  for (const path of ["dashboard/SoilGauges", "report/FarmReport"]) {
    const markup = renderer({ reading: legacy })(path);
    assert.match(markup, /&lt;0\.01 kg\/ha/);
    assert.doesNotMatch(markup, /Soil moisture \(E77A\)|Phosphorus blue intensity|Simulated demo soil data/);
  }
});


test("a saved Pune preset keeps its regional source and participates in report planning", () => {
  const preset = soilChemistry.MIT_WPU_PUNE_PRESET;
  const regional = domain.SoilKitReadingSchema.parse({
    ...reading, regionalPreset: preset.id, dataStatus: preset.dataStatus, ph: preset.ph,
    moisturePercent: preset.moisturePercent, moistureLevel: preset.moistureLevel,
    phosphorusBlueIntensity: preset.phosphorusBlueIntensity, nitrogenLevel: "low", phosphorusLevel: "medium",
    nitrogenKgPerHa: preset.nitrogen.result.nitrogenKgPerHa, phosphorusKgPerHa: 17.95,
  });
  for (const locale of locales) {
    const copy = i18n.t(locale);
    const render = renderer({ locale, reading: regional });
    for (const path of ["dashboard/SoilCard", "dashboard/SoilGauges", "report/FarmReport"]) {
      const markup = render(path);
      assert.ok(markup.includes(copy.soilLab.regionalPreset.source));
      assert.ok(markup.includes(copy.provenance.measured_by_kit));
      assert.doesNotMatch(markup, retiredWarnings);
      assert.doesNotMatch(markup, /pat-sample/);
      if (path === "report/FarmReport") {
        assert.ok(markup.includes(soilKit.interpretSoilKitReading(regional).steps.find(step => step.parameter === "nitrogen")!.badgeLabel[locale]));
      }
    }
  }
});
