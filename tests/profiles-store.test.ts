import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { extractFarmSlice, createProfile } from "../src/lib/domain/profiles";
import { BACKUP_FORMAT, importFarmBackup, parseFarmBackup, serializeFarmBackup } from "../src/lib/storage/backup";
import type { StorageStatus } from "../src/lib/storage/db";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { createBalramStore, LEGACY_V5_BACKUP_KEY, STORAGE_KEY } from "../src/store/useBalramStore";
import { PersistedFarmSchema, type PersistedFarm, type SoilSnapshot } from "../src/types/domain";

const now = "2026-10-01T06:15:00+05:30";
const nowMs = Date.parse(now);

function browser(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { indexedDB: undefined } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  t.mock.timers.enable({ apis: ["Date"], now: nowMs });
}

function testDisk(records = new Map<string, string>(), mode: StorageStatus["mode"] = "persistent") {
  const operations: string[] = [];
  const disk = {
    storage: {
      getItem(key: string) { return records.get(key) ?? null; },
      setItem(key: string, value: string) { operations.push(`write:${key}`); records.set(key, value); },
      removeItem(key: string) { operations.push(`remove:${key}`); records.delete(key); },
    },
    getStatus: (): StorageStatus => ({ mode, message: null, pendingWrites: 0 }),
    useMemoryOnly: () => { mode = "memory"; },
    subscribe: () => () => {},
    flush: async () => {},
  };
  return { disk, records, operations };
}

function v5Farm() {
  const { profiles: _profiles, activeProfileId: _active, farmStash: _stash, ...legacy } = createEmptyFixture();
  return { ...legacy, fieldGeometry: createSampleFixture().fieldGeometry, locale: "mr", landUnit: "gunthas" };
}

test("createFarmProfile creates a blank farm and an editable copy after leaving Sample Mode", async (t) => {
  browser(t);
  const { disk, operations, records } = testDisk();
  const api = createBalramStore(disk);
  await api.initialize();
  const state = api.store.getState;

  state().setLocale("mr");
  state().setLandUnit("gunthas");
  operations.length = 0;
  await state().createFarmProfile("घरचे शेत");
  const originalId = state().activeProfileId!;
  assert.match(originalId, /^profile-/);
  assert.equal(state().profiles[0].origin, "blank");
  assert.equal(state().fieldGeometry, null);
  assert.deepEqual(operations, [`write:${STORAGE_KEY}`]);
  state().setFieldGeometry(createSampleFixture().fieldGeometry);

  const original = extractFarmSlice(state());
  const raw = records.get(STORAGE_KEY);
  await state().setSampleData(true);
  assert.equal(state().sampleDataActive, true);
  assert.equal(state().activeProfileId, null);
  assert.deepEqual(state().profiles.map(({ id }) => id), [originalId]);
  assert.deepEqual(state().farmStash[originalId], original);
  assert.equal(records.get(STORAGE_KEY), raw);

  await state().createFarmProfile("नमुना प्रत", { fromSample: true });
  assert.equal(state().sampleDataActive, false);
  assert.equal(state().sampleOverlayActive, false);
  assert.equal(state().locale, "mr");
  assert.equal(state().landUnit, "gunthas");
  assert.equal(state().profiles.find(({ id }) => id === state().activeProfileId)?.origin, "sample_copy");
  assert.equal(state().farmProfile?.name, "नमुना प्रत");
  assert.notEqual(state().fieldGeometry?.fieldId, original.fieldGeometry?.fieldId);
  assert.equal(state().weatherSnapshot, null);
  assert.equal(state().weatherStatus.state, "idle");
  assert.deepEqual(state().farmStash[originalId], original);
  assert.deepEqual(PersistedFarmSchema.parse(JSON.parse(records.get(STORAGE_KEY)!).state).farmStash[originalId], original);

  await state().setSampleData(true);
  await state().switchFarmProfile(originalId);
  assert.deepEqual(extractFarmSlice(state()), original);
});

test("creating the first profile preserves existing unprofiled v6 farm data", async (t) => {
  browser(t);
  const api = createBalramStore();
  await api.initialize();
  const state = api.store.getState;
  const fieldGeometry = createSampleFixture().fieldGeometry;
  state().setFieldGeometry(fieldGeometry);
  await state().createFarmProfile("River Farm");
  assert.equal(state().profiles.length, 2);
  assert.equal(state().fieldGeometry, null);
  await state().switchFarmProfile(state().profiles[0].id);
  assert.deepEqual(state().fieldGeometry, fieldGeometry);
});

test("switchFarmProfile rejects stale weather and soil requests even when the farms share geometry", async (t) => {
  browser(t);
  const api = createBalramStore();
  await api.initialize();
  const state = api.store.getState;
  const sample = createSampleFixture();
  const field = sample.fieldGeometry!;
  const weather = { ...sample.weatherSnapshot!, provenance: "modelled" as const };
  const soil: SoilSnapshot = {
    fieldId: field.fieldId, coordinate: field.center, source: "Fixture",
    fetchedAt: now, validAt: null, expiresAt: "2026-10-02T00:00:00+05:30",
    data: { queryCoordinate: field.center, gridCoordinate: field.center, depthCm: [0, 5], properties: [] },
  };

  state().setLocale("mr");
  state().setLandUnit("gunthas");
  await state().createFarmProfile("पहिले शेत");
  const first = state().activeProfileId!;
  state().setFieldGeometry(field);
  assert.equal(state().commitWeatherRequest(state().beginWeatherRequest(), weather), true);
  assert.equal(state().commitSoilRequest(state().beginSoilRequest(), soil), true);
  await state().createFarmProfile("दुसरे शेत");
  state().setFieldGeometry(field);
  const pendingWeather = state().beginWeatherRequest();
  const pendingSoil = state().beginSoilRequest();
  await state().switchFarmProfile(state().activeProfileId!);
  assert.equal(pendingWeather.signal.aborted, false);
  assert.equal(pendingSoil.signal.aborted, false);

  await state().switchFarmProfile(first);
  assert.equal(pendingWeather.signal.aborted, true);
  assert.equal(pendingSoil.signal.aborted, true);
  assert.equal(state().commitWeatherRequest(pendingWeather, weather), false);
  assert.equal(state().commitSoilRequest(pendingSoil, soil), false);
  assert.equal(state().locale, "mr");
  assert.equal(state().landUnit, "gunthas");
  assert.deepEqual(state().weatherSnapshot, weather);
  assert.equal(state().weatherStatus.state, "success");
  assert.equal(state().weatherCached, true);
  assert.equal(state().weatherStale, false);
  assert.deepEqual(state().soilSnapshot, soil);
  assert.equal(state().soilStatus.state, "success");
  assert.ok(state().beginWeatherRequest().generation > pendingWeather.generation);
});

test("renameFarmProfile and farm edits synchronize the appropriate profile metadata", async (t) => {
  browser(t);
  const api = createBalramStore();
  await api.initialize();
  const state = api.store.getState;
  await state().createFarmProfile("First");
  const first = state().activeProfileId!;
  await state().createFarmProfile("Second");
  const second = state().activeProfileId!;
  await state().setSampleData(true);
  t.mock.timers.tick(1);
  await state().renameFarmProfile(first, "Stashed");
  assert.equal(state().sampleOverlayActive, false);
  assert.equal(state().farmStash[first].farmProfile?.name, "Stashed");
  assert.equal(state().profiles[0].updatedAt, new Date(nowMs + 1).toISOString());
  await state().renameFarmProfile(second, "Active");
  assert.equal(state().farmProfile?.name, "Active");
  assert.deepEqual(state().profiles.map(({ name }) => name), ["Stashed", "Active"]);

  const sample = createSampleFixture();
  const edits = [
    () => state().setFarmProfile({ ...sample.farmProfile!, name: "  Ｅｄｉｔｅｄ  " }),
    () => state().setFieldGeometry(sample.fieldGeometry),
    () => state().setCropAllocations(sample.cropAllocations),
    () => state().setIrrigationSetup(sample.irrigationSetup),
    () => state().setSoilKitReading(sample.soilKitReading),
    () => state().setSoilSkipped(true),
    () => state().setSetupCompletedAt("2026-10-01"),
    () => state().addCheckIn({ id: "note", date: "2026-10-01", plotId: null, stage: null, event: "none", note: "" }),
  ];
  const beforeInactive = state().profiles[0];
  for (const edit of edits) {
    t.mock.timers.tick(1);
    edit();
    const updatedAt = new Date().toISOString();
    assert.deepEqual(state().profiles[0], beforeInactive);
    assert.equal(state().profiles[1].updatedAt, updatedAt);
    assert.equal(state().farmProfile?.updatedAt, updatedAt);
    assert.equal(state().planningUpdatedAt, updatedAt);
  }
  assert.equal(state().farmProfile?.id, second);
  assert.equal(state().profiles[1].name, "Edited");
  assert.equal(state().locale, "en");
  assert.equal(state().landUnit, "acres");
});

test("deleteFarmProfile selects the most recently edited farm and undo restores data and profile order", async (t) => {
  browser(t);
  const api = createBalramStore();
  await api.initialize();
  const state = api.store.getState;
  await state().createFarmProfile("First");
  const first = state().activeProfileId!;
  t.mock.timers.tick(1);
  await state().createFarmProfile("Second");
  const second = state().activeProfileId!;
  t.mock.timers.tick(1);
  await state().createFarmProfile("Third", { fromSample: true });
  const third = state().activeProfileId!;
  t.mock.timers.tick(1);
  await state().renameFarmProfile(first, "First Updated");
  await state().switchFarmProfile(second);
  const saved = PersistedFarmSchema.parse(state());

  await state().setSampleData(true);
  const deleted = await state().deleteFarmProfile(second);
  assert.ok(deleted);
  assert.equal(state().activeProfileId, first);
  assert.equal(state().farmProfile?.name, "First Updated");
  state().restoreFarmProfile(deleted);
  assert.deepEqual(PersistedFarmSchema.parse(state()), saved);
  assert.equal(await state().deleteFarmProfile("unknown"), null);

  await state().deleteFarmProfile(first);
  await state().deleteFarmProfile(second);
  const onlyFarm = PersistedFarmSchema.parse(state());
  const last = await state().deleteFarmProfile(third);
  assert.ok(last);
  assert.deepEqual(PersistedFarmSchema.parse(state()), createEmptyFixture());
  state().restoreFarmProfile(last);
  assert.deepEqual(PersistedFarmSchema.parse(state()), onlyFarm);
});

test("importFarmProfiles adds v5 and v6 farms, reports capacity and preserves the active farm", async (t) => {
  browser(t);
  const api = createBalramStore();
  await api.initialize();
  const state = api.store.getState;
  for (const name of ["माझे शेत", "River", "Orchard", "Hill"]) await state().createFarmProfile(name);
  const currentId = state().activeProfileId;
  const currentSlice = extractFarmSlice(state());
  const legacy = JSON.stringify({ format: BACKUP_FORMAT, version: 5, exportedAt: now, farm: v5Farm() });
  assert.deepEqual(state().importFarmProfiles(parseFarmBackup(legacy)), {
    addedCount: 1, skippedCount: 0, addedNames: ["माझे शेत (2)"],
  });

  const external = (farm: PersistedFarm, name: string) => createProfile(farm, { name, id: name, nowIso: now, origin: "blank" });
  const incoming = external(external(createEmptyFixture(), "River"), "Pasture");
  const backup = serializeFarmBackup(incoming, now);
  assert.deepEqual(importFarmBackup(backup, state()), {
    addedCount: 1, skippedCount: 1, addedNames: ["River (2)"],
  });
  assert.deepEqual(importFarmBackup(backup, state()), { addedCount: 0, skippedCount: 2, addedNames: [] });
  assert.equal(state().activeProfileId, currentId);
  assert.deepEqual(extractFarmSlice(state()), currentSlice);
  assert.deepEqual(state().profiles.slice(-2).map(({ origin }) => origin), ["imported", "imported"]);
  assert.deepEqual(parseFarmBackup(serializeFarmBackup(state(), now)), PersistedFarmSchema.parse(state()));
});

test("hydration saves the original v5 envelope before writing v6 and cleans it up on a healthy v6 boot", async (t) => {
  browser(t);
  const raw = JSON.stringify({ version: 5, state: v5Farm() }, null, 2);
  const { disk, records, operations } = testDisk(new Map([[STORAGE_KEY, raw]]));
  const migrated = createBalramStore(disk);
  await migrated.initialize();
  await migrated.flush();
  assert.deepEqual(operations, [`write:${LEGACY_V5_BACKUP_KEY}`, `write:${STORAGE_KEY}`]);
  assert.equal(records.get(LEGACY_V5_BACKUP_KEY), raw);
  assert.equal(JSON.parse(records.get(STORAGE_KEY)!).version, 6);
  assert.equal(migrated.store.getState().farmProfile?.name, "माझे शेत");

  const healthy = createBalramStore(disk);
  await healthy.initialize();
  assert.equal(healthy.store.getState().hydrationError, null);
  assert.equal(records.has(LEGACY_V5_BACKUP_KEY), false);
  assert.equal(operations[2], `remove:${LEGACY_V5_BACKUP_KEY}`);
});

test("legacy safety copy survives failed v6 hydration and is written only once outside memory mode", async (t) => {
  browser(t);
  const raw = JSON.stringify({ version: 5, state: v5Farm() });
  const existing = "original v5 envelope";
  const existingDisk = testDisk(new Map([[STORAGE_KEY, raw], [LEGACY_V5_BACKUP_KEY, existing]]));
  await createBalramStore(existingDisk.disk).initialize();
  assert.equal(existingDisk.records.get(LEGACY_V5_BACKUP_KEY), existing);
  assert.deepEqual(existingDisk.operations, [`write:${STORAGE_KEY}`]);

  const invalidDisk = testDisk(new Map([[STORAGE_KEY, '{"version":6,"state":{}}'], [LEGACY_V5_BACKUP_KEY, raw]]));
  const corrupt = createBalramStore(invalidDisk.disk);
  await corrupt.initialize();
  assert.ok(corrupt.store.getState().hydrationError);
  assert.equal(invalidDisk.records.get(LEGACY_V5_BACKUP_KEY), raw);
  assert.equal(invalidDisk.operations.includes(`remove:${LEGACY_V5_BACKUP_KEY}`), false);

  const memory = testDisk(new Map([[STORAGE_KEY, raw]]), "memory");
  await createBalramStore(memory.disk).initialize();
  assert.equal(memory.records.has(LEGACY_V5_BACKUP_KEY), false);
});
