import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_FORMAT, parseFarmBackup } from "../src/lib/storage/backup";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { createRegionalBaselineWeatherSnapshot } from "../src/lib/domain/irrigation";
import { createBalramStore, migratePersistedFarm, PERSISTENCE_VERSION } from "../src/store/useBalramStore";
import { PersistedFarmSchema } from "../src/types/domain";

test("persistence v5 migrates versions zero through four with Acres as the land-unit default", () => {
  assert.equal(PERSISTENCE_VERSION, 5);
  const { landUnit: _landUnit, ...oldFarm } = createEmptyFixture();
  for (const version of [0, 1, 2, 3, 4]) {
    const migrated = migratePersistedFarm({ ...oldFarm, landUnit: undefined }, version);
    assert.equal(migrated.landUnit, "acres", `version ${version}`);
  }
});

test("empty and sample fixtures conform to the v5 farm schema", () => {
  assert.equal(PersistedFarmSchema.parse(createEmptyFixture()).landUnit, "acres");
  assert.equal(PersistedFarmSchema.parse(createSampleFixture()).landUnit, "acres");
});

test("v4 JSON backups restore with the default Acres preference", () => {
  const { landUnit: _landUnit, ...v4Farm } = createEmptyFixture();
  const envelope = {
    format: BACKUP_FORMAT,
    version: 4,
    exportedAt: "2026-11-18T12:00:00.000Z",
    farm: v4Farm,
  };
  assert.equal(parseFarmBackup(JSON.stringify(envelope)).landUnit, "acres");
});

test("setting a land unit leaves active weather and soil data and request status untouched", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { indexedDB: undefined } });
  try {
    const api = createBalramStore();
    await api.initialize();
    const coordinate: [number, number] = [73.8567, 18.5204];
    const fieldGeometry = { fieldId: "field-unit-test", center: coordinate, boundary: null, areaSquareMetres: 8093.7128448 };
    const weatherSnapshot = createRegionalBaselineWeatherSnapshot({ fieldId: fieldGeometry.fieldId, coordinate, nowMs: Date.parse("2026-11-18T06:00:00+05:30") });
    const soilSnapshot = {
      fieldId: fieldGeometry.fieldId,
      coordinate,
      source: "Unit test fixture",
      fetchedAt: "2026-11-18T06:00:00.000Z",
      validAt: null,
      expiresAt: "2026-11-19T06:00:00.000Z",
      data: { queryCoordinate: coordinate, gridCoordinate: coordinate, depthCm: [0, 5] as [0, 5], properties: [] },
    };
    const farm = PersistedFarmSchema.parse({
      ...createEmptyFixture(), fieldGeometry, weatherSnapshot, soilSnapshot, sampleDataActive: false,
    });
    api.store.getState().replacePersistedState(farm);
    const request = api.store.getState().beginWeatherRequest();
    const before = api.store.getState();
    const weatherStatus = before.weatherStatus;
    const savedWeather = before.weatherSnapshot;
    const savedSoil = before.soilSnapshot;

    api.store.getState().setLandUnit("gunthas");
    const after = api.store.getState();
    assert.equal(after.landUnit, "gunthas");
    assert.equal(after.weatherSnapshot, savedWeather);
    assert.equal(after.soilSnapshot, savedSoil);
    assert.deepEqual(after.weatherStatus, weatherStatus);
    assert.equal(request.signal.aborted, false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("land-unit changes made in Sample Mode return with the saved farm", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { indexedDB: undefined } });
  try {
    const api = createBalramStore();
    await api.initialize();
    await api.store.getState().setSampleData(true);
    api.store.getState().setLandUnit("gunthas");
    assert.equal(api.store.getState().landUnit, "gunthas");
    await api.store.getState().setSampleData(false);
    assert.equal(api.store.getState().landUnit, "gunthas");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
