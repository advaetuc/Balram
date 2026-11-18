import test from "node:test";
import assert from "node:assert/strict";
import { GUNTHAS_PER_ACRE, SQUARE_METRES_PER_ACRE, SQUARE_METRES_PER_GUNTHA } from "../src/lib/domain/geometry";
import { displayPlotName, formatArea, formatIndianNumber, gunthasToUnitValue, parseAreaInput, unitValueToGunthas } from "../src/lib/domain/landUnits";

test("Maharashtra land-unit constants are consistent", () => {
  assert.equal(GUNTHAS_PER_ACRE * SQUARE_METRES_PER_GUNTHA, SQUARE_METRES_PER_ACRE);
  assert.ok(Math.abs(1089 * 0.09290304 - SQUARE_METRES_PER_GUNTHA) < 1e-10);
});

test("area formatting follows Acres and Gunthas examples", () => {
  assert.equal(formatArea(50, "acres", "en"), "1.25 Acres");
  assert.equal(formatArea(50, "acres", "en", { includeSecondary: true }), "1.25 Acres (= 50 Gunthas)");
  assert.equal(formatArea(50, "gunthas", "en"), "50 Gunthas");
  assert.equal(formatArea(50, "gunthas", "en", { includeSecondary: true }), "50 Gunthas (= 1.25 Acres)");
  assert.equal(formatArea(40, "acres", "en"), "1 Acre");
  assert.equal(formatArea(40, "gunthas", "en"), "40 Gunthas");
  assert.equal(formatArea(7, "acres", "en"), "0.18 Acres");
  assert.equal(formatArea(7, "gunthas", "en"), "7 Gunthas");
  assert.equal(formatArea(12.5, "acres", "en"), "0.31 Acres");
  assert.equal(formatArea(12.5, "gunthas", "en"), "12.5 Gunthas");
  assert.equal(formatArea(1, "acres", "en"), "0.03 Acres");
  assert.equal(formatArea(1, "gunthas", "en"), "1 Guntha");
  assert.equal(formatArea(1, "gunthas", "mr"), "1 गुंठा");
  assert.equal(formatArea(5, "gunthas", "mr"), "5 गुंठे");
  assert.equal(formatArea(80, "acres", "mr"), "2 एकर");
  assert.equal(formatArea(0, "acres", "en"), "0 Acres");
  assert.equal(formatArea(0, "gunthas", "en"), "0 Gunthas");
  assert.equal(formatArea(39.98, "acres", "en"), "1 Acre");
  assert.equal(formatArea(39.98, "gunthas", "en"), "40 Gunthas");
});

test("unit conversion rounds to the specified display and storage precision", () => {
  assert.equal(gunthasToUnitValue(39.98, "acres"), 1);
  assert.equal(gunthasToUnitValue(7, "acres"), 0.18);
  assert.equal(unitValueToGunthas(0.33, "acres"), 13.2);
  assert.equal(unitValueToGunthas(1.234, "gunthas"), 1.23);
  assert.equal(gunthasToUnitValue(0.005, "gunthas"), 0);
});

test("Indian number formatting groups digits and trims fraction zeros", () => {
  assert.equal(formatIndianNumber(100000), "1,00,000");
  assert.equal(formatIndianNumber(1234567), "12,34,567");
  assert.equal(formatIndianNumber(1.2), "1.2");
  assert.equal(formatIndianNumber(2), "2");
});

test("area input parses decimal commas and Devanagari digits", () => {
  assert.deepEqual(parseAreaInput("1,25", "acres"), { ok: true, gunthas: 50 });
  assert.deepEqual(parseAreaInput("१.२५", "acres", "mr"), { ok: true, gunthas: 50 });
  assert.deepEqual(parseAreaInput("0.33", "acres"), { ok: true, gunthas: 13.2 });
  for (const value of ["", "-1", "0", "NaN", "10000.01"]) {
    const parsed = parseAreaInput(value, "acres");
    assert.equal(parsed.ok, false, `expected ${JSON.stringify(value)} to be rejected`);
    if (!parsed.ok) {
      assert.ok(parsed.error.en.length > 0);
      assert.ok(parsed.error.mr.length > 0);
    }
  }
});

test("preset plot names localize while custom farmer names stay unchanged", () => {
  assert.equal(displayPlotName("well plot", "mr"), "विहिरीचा प्लॉट");
  assert.equal(displayPlotName("Borewell Patch", "mr"), "बोअरवेल प्लॉट");
  assert.equal(displayPlotName("CANAL PLOT", "mr"), "कालव्याचा प्लॉट");
  assert.equal(displayPlotName("Roadside Field", "mr"), "रस्त्यालगतचा प्लॉट");
  assert.equal(displayPlotName("Plot 12", "mr"), "प्लॉट 12");
  assert.equal(displayPlotName(undefined, "mr", 3), "प्लॉट 3");
  assert.equal(displayPlotName("My Custom Plot", "mr"), "My Custom Plot");
  assert.equal(displayPlotName("  My Custom Plot  ", "mr"), "  My Custom Plot  ");
  assert.equal(displayPlotName("Well Plot", "en"), "Well Plot");
});
