import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  commitCheckoutDraftToAllocations,
  pickNextDefaultPlotName,
  resolvePresetGunthas,
  validateCheckoutDraft,
  type CheckoutDraftLine,
} from "../src/lib/domain/checkout";
import { gunthasToSquareMetres } from "../src/lib/domain/geometry";
import { CropAllocationsSchema, type CropAllocation } from "../src/types/domain";
import { createPlotRemovalSnapshot, restorePlotRemoval } from "../src/lib/domain/plotUndo";

test("package manifest identifies release v0.3.2", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(manifest.version, "0.3.2");
});

function draft(overrides: Partial<CheckoutDraftLine> = {}): CheckoutDraftLine {
  return {
    draftId: "draft-onion",
    cropId: "onion",
    plotName: "New Onion Plot",
    areaGunthas: 10,
    alreadyPlanted: false,
    lifecycleStage: "planned",
    plantingDate: null,
    ...overrides,
  };
}

function plot(overrides: Partial<CropAllocation> = {}): CropAllocation {
  return {
    plotId: "plot-existing",
    plotName: "Existing Plot",
    areaGunthas: 40,
    lifecycleStage: "vegetative",
    cropId: "bajra",
    percentage: 61.54,
    season: "kharif",
    growthStage: "development",
    plantingDate: "2026-06-01",
    ...overrides,
  };
}

test("default plot names are picked case-insensitively", () => {
  assert.equal(pickNextDefaultPlotName(["well plot", "BOREWELL PATCH"]), "Canal Plot");
  assert.equal(pickNextDefaultPlotName(["Well Plot", "Borewell Patch", "Canal Plot", "Roadside Field"]), "Plot 5");
});

test("half remaining rounds an odd remainder down and stays within available land", () => {
  assert.equal(resolvePresetGunthas("half_remaining", 0, 25), 12);
  assert.ok(resolvePresetGunthas("half_remaining", 0, 25) <= 25);
  assert.equal(resolvePresetGunthas("half_remaining", 0, null), 40);
});

test("all remaining uses the pool left after an earlier draft line", () => {
  const firstClaim = resolvePresetGunthas("plus_10_gunthas", 10, 80);
  const freeAfterFirstClaim = 80 - firstClaim;
  const secondClaim = resolvePresetGunthas("all_remaining", 0, freeAfterFirstClaim);
  assert.equal(firstClaim, 20);
  assert.equal(secondClaim, 60);
  assert.equal(validateCheckoutDraft([
    draft({ areaGunthas: firstClaim }),
    draft({ draftId: "draft-groundnut", cropId: "groundnut", plotName: "Second Plot", areaGunthas: secondClaim }),
  ], [], gunthasToSquareMetres(80)).ok, true);
});

test("one acre reports exactly 15 gunthas over a 25-guntha free balance", () => {
  const existing = plot({ areaGunthas: 40, percentage: 61.54 });
  const validation = validateCheckoutDraft([draft({ areaGunthas: resolvePresetGunthas("one_acre", 0, 25) })], [existing], gunthasToSquareMetres(65));
  assert.equal(validation.ok, false);
  assert.equal(validation.errorCode, "EXCEEDS_AVAILABLE_LAND");
  assert.equal(validation.overByGunthas, 15);
  assert.match(validation.message?.en ?? "", /Over by 15 Gunthas/);
  assert.match(validation.message?.mr ?? "", /15 गुंठे/);
});

test("zero remaining land distinguishes an empty-size no-land case from an overage", () => {
  const existing = plot({ areaGunthas: 80, percentage: 100 });
  const empty = validateCheckoutDraft([draft({ areaGunthas: 0 })], [existing], gunthasToSquareMetres(80));
  assert.equal(empty.errorCode, "NO_FREE_LAND");
  const requested = validateCheckoutDraft([draft({ areaGunthas: 1 })], [existing], gunthasToSquareMetres(80));
  assert.equal(requested.errorCode, "EXCEEDS_AVAILABLE_LAND");
  assert.equal(requested.overByGunthas, 1);
});

test("draft and existing plot names must be unique without case differences", () => {
  const duplicateDrafts = validateCheckoutDraft([
    draft({ plotName: "North Plot" }),
    draft({ draftId: "other", cropId: "bajra", plotName: " north plot " }),
  ], [], null);
  assert.equal(duplicateDrafts.errorCode, "DUPLICATE_PLOT_NAME");
  const duplicateExisting = validateCheckoutDraft([draft({ plotName: "EXISTING PLOT" })], [plot()], null);
  assert.equal(duplicateExisting.errorCode, "DUPLICATE_PLOT_NAME");
  assert.equal(validateCheckoutDraft([draft({ plotName: "  " })], [], null).errorCode, "EMPTY_PLOT_NAME");
});

test("land steppers apply minimum and available-land caps", () => {
  assert.equal(resolvePresetGunthas("plus_10_gunthas", 20, 25), 25);
  assert.equal(resolvePresetGunthas("plus_5_gunthas", 23, 25), 25);
  assert.equal(resolvePresetGunthas("minus_5_gunthas", 3, 25), 1);
  assert.equal(resolvePresetGunthas("minus_5_gunthas", 20, 0), 0);
  assert.equal(resolvePresetGunthas("plus_5_gunthas", 20, null), 25);
});

test("two new crop lines commit atomically with valid basis-point percentages", () => {
  const allocations = commitCheckoutDraftToAllocations([
    draft({ areaGunthas: 20 }),
    draft({ draftId: "draft-groundnut", cropId: "groundnut", plotName: "Groundnut Patch", areaGunthas: 10, alreadyPlanted: true, lifecycleStage: "vegetative", plantingDate: "2026-06-01" }),
  ], [], gunthasToSquareMetres(80));
  const parsed = CropAllocationsSchema.parse(allocations);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.percentage, 25);
  assert.equal(parsed[1]?.percentage, 12.5);
  assert.equal(parsed[0]?.season, "rabi");
  assert.equal(parsed[0]?.growthStage, "initial");
  assert.equal(parsed[0]?.plantingDate, null);
  assert.equal(parsed[1]?.growthStage, "development");
  assert.equal(parsed[1]?.plantingDate, "2026-06-01");
  assert.notEqual(parsed[0]?.plotId, parsed[1]?.plotId);
});

test("editing replaces the target plot in place and preserves unrelated allocations", () => {
  const edited = plot();
  const other = plot({ plotId: "plot-other", plotName: "Other Plot", cropId: "onion", areaGunthas: 20, percentage: 25, season: "rabi", lifecycleStage: "planned", growthStage: "initial", plantingDate: null });
  const allocations = commitCheckoutDraftToAllocations([
    draft({ editingPlotId: "plot-existing", plotName: "Existing Plot", cropId: "groundnut", areaGunthas: 35, alreadyPlanted: true, lifecycleStage: "flowering_fruiting", plantingDate: "2026-05-20" }),
  ], [edited, other], gunthasToSquareMetres(80));
  const parsed = CropAllocationsSchema.parse(allocations);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.plotId, "plot-existing");
  assert.equal(parsed[0]?.cropId, "groundnut");
  assert.equal(parsed[0]?.areaGunthas, 35);
  assert.equal(parsed[0]?.growthStage, "mid-season");
  assert.equal(parsed[0]?.plantingDate, "2026-05-20");
  assert.equal(parsed[1]?.plotId, "plot-other");
  assert.equal(parsed.reduce((sum, allocation) => sum + allocation.percentage * 100, 0), 6875);
  assert.ok(parsed.reduce((sum, allocation) => sum + allocation.percentage * 100, 0) <= 10000);
});

test("plot removal undo restores the entire previous allocation state", () => {
  const first = plot();
  const second = plot({ plotId: "plot-second", plotName: "Second Plot", cropId: "onion", areaGunthas: 20, percentage: 25, season: "rabi", lifecycleStage: "planned", growthStage: "initial", plantingDate: null });
  const before = [first, second];
  const removal = createPlotRemovalSnapshot(before, "plot-existing");
  assert.ok(removal);
  assert.deepEqual(removal.remainingAllocations, [second]);
  assert.equal(removal.removedPlot.plotId, "plot-existing");
  assert.deepEqual(restorePlotRemoval(removal), before);
  assert.equal(createPlotRemovalSnapshot(before, "missing-plot"), null);
});
