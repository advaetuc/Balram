import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFarmSlice, createEditableSampleSlice, createProfile, deleteProfile, extractFarmSlice,
  makeUniqueProfileName, mergeImportedProfiles, normalizeProfileName, renameProfile,
  restoreDeletedProfile, summarizeProfile, switchProfile, validateProfileName,
} from "../src/lib/domain/profiles";
import { BACKUP_FORMAT, parseFarmBackup, serializeFarmBackup } from "../src/lib/storage/backup";
import { barSegments } from "../src/lib/domain/viz/barSegments";
import { createEmptyFixture, createSampleFixture } from "../src/mocks/fixtures";
import { migratePersistedFarm } from "../src/store/useBalramStore";
import { PersistedFarmSchema, type PersistedFarm } from "../src/types/domain";

const now = "2026-11-22T12:00:00+05:30";
const later = "2026-11-23T12:00:00+05:30";

function asV5(farm: PersistedFarm) {
  const { profiles: _profiles, activeProfileId: _active, farmStash: _stash, ...v5 } = farm;
  return v5;
}

function addFarm(state: PersistedFarm, id: string, name = id, nowIso = now) {
  return createProfile(state, { id, name, origin: "blank", nowIso });
}

test("v6 defaults omit profiles for empty v5 farms and enforces profile references", () => {
  const empty = createEmptyFixture();
  assert.deepEqual(PersistedFarmSchema.parse(asV5(empty)), empty);
  assert.deepEqual(migratePersistedFarm(asV5(empty), 5), empty);

  const farm = addFarm(empty, "a");
  const sample = createSampleFixture();
  assert.equal(PersistedFarmSchema.safeParse({ ...farm, profiles: [farm.profiles[0], farm.profiles[0]] }).success, false);
  assert.equal(PersistedFarmSchema.safeParse({ ...farm, activeProfileId: "missing" }).success, false);
  assert.equal(PersistedFarmSchema.safeParse({ ...sample, activeProfileId: "missing" }).success, true);
  assert.equal(PersistedFarmSchema.safeParse({ ...farm, farmStash: { missing: extractFarmSlice(empty) } }).success, false);
});

test("v5 migration creates a deterministic profile with localized defaults and preserves farm data", () => {
  const fieldGeometry = createSampleFixture().fieldGeometry;
  for (const [locale, name] of [["en", "My Farm"], ["mr", "माझे शेत"]] as const) {
    const farm = { ...asV5(createEmptyFixture()), fieldGeometry, locale, landUnit: "gunthas" };
    const migrated = migratePersistedFarm(farm, 5);
    const id = "profile-migrated-1";
    const updatedAt = "2026-01-01T00:00:00+05:30";
    assert.deepEqual(migrated.profiles, [{ id, name, updatedAt, createdAt: updatedAt, origin: "blank" }]);
    assert.equal(migrated.activeProfileId, id);
    assert.deepEqual(migrated.farmProfile, { id, name, locale, district: null, timezone: "Asia/Kolkata", updatedAt });
    assert.deepEqual(migrated.fieldGeometry, fieldGeometry);
    assert.equal(migrated.landUnit, "gunthas");
    assert.deepEqual(migrated.farmStash, {});
    assert.deepEqual(migratePersistedFarm(farm, 5), migrated);
    assert.deepEqual(PersistedFarmSchema.parse(migrated), migrated);
  }
});

test("v5 migration truncates normalized names on grapheme boundaries and keeps v5 crop shape", () => {
  const farm = createEditableSampleSlice("mr", now, "profile-old");
  const migrated = migratePersistedFarm({
    ...asV5(createEmptyFixture()),
    ...farm,
    locale: "mr",
    farmProfile: { ...farm.farmProfile!, name: `  ${"क्ष".repeat(31)}  ` },
    cropAllocations: [{ cropId: "bajra", percentage: 100, season: "kharif", growthStage: "initial", plantingDate: null }],
    planningUpdatedAt: later,
  }, 5);
  assert.equal(migrated.activeProfileId, "profile-old");
  assert.equal(migrated.farmProfile?.name, "क्ष".repeat(30));
  assert.equal(migrated.farmProfile.district, "Pune");
  assert.equal(migrated.farmProfile.locale, "mr");
  assert.equal(migrated.farmProfile.updatedAt, later);
  assert.equal(migrated.profiles[0].createdAt, later);
  assert.equal(migrated.cropAllocations[0].plotId, undefined);

  const reservedId = migratePersistedFarm({
    ...asV5(createEmptyFixture()), ...farm, farmProfile: { ...farm.farmProfile!, id: "sample-farm", name: "  " },
  }, 5);
  assert.equal(reservedId.activeProfileId, "profile-migrated-1");
  assert.equal(reservedId.farmProfile?.name, "My Farm");
  assert.equal(reservedId.farmProfile?.updatedAt, now);
});

test("profile name validation uses graphemes and NFKC-normalized case-insensitive names", () => {
  const conjunct = "क्ष";
  assert.ok(conjunct.repeat(30).length > 30);
  assert.deepEqual(validateProfileName(conjunct.repeat(30), []), { ok: true, name: conjunct.repeat(30) });
  assert.deepEqual(validateProfileName(conjunct.repeat(31), []), { ok: false, reason: "too_long" });
  assert.deepEqual(validateProfileName(" \t ", []), { ok: false, reason: "empty" });

  const { profiles } = addFarm(createEmptyFixture(), "a", "Well Plot");
  assert.equal(normalizeProfileName("  Ｗｅｌｌ\u00a0\t Plot "), "Well Plot");
  assert.deepEqual(validateProfileName(" ＷＥＬＬ plot ", profiles), { ok: false, reason: "duplicate" });
  assert.deepEqual(validateProfileName(" ＷＥＬＬ plot ", profiles, "a"), { ok: true, name: "WELL plot" });
  assert.equal(makeUniqueProfileName("Ｗｅｌｌ Plot", profiles), "Well Plot (2)");
  assert.equal(makeUniqueProfileName("Well Plot", [...profiles, { ...profiles[0], id: "b", name: "well plot (2)" }]), "Well Plot (3)");

  const longName = conjunct.repeat(30);
  assert.equal(makeUniqueProfileName(longName, [{ ...profiles[0], name: longName }]), `${conjunct.repeat(26)} (2)`);
});

test("profile name validation falls back to Unicode code points without Intl.Segmenter", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "Segmenter")!;
  Object.defineProperty(Intl, "Segmenter", { ...descriptor, value: undefined });
  try {
    assert.equal(validateProfileName("🌿".repeat(30), []).ok, true);
    assert.deepEqual(validateProfileName("🌿".repeat(31), []), { ok: false, reason: "too_long" });
  } finally {
    Object.defineProperty(Intl, "Segmenter", descriptor);
  }
});

test("createProfile uses injected IDs and enforces name, ID and six-profile limits", () => {
  const empty = createEmptyFixture();
  let farm = createProfile(empty, { idFactory: () => "a", name: "First", origin: "blank", nowIso: now });
  assert.equal(farm.activeProfileId, "a");
  assert.throws(() => addFarm(farm, "b", "Ｆｉｒｓｔ"), /duplicate/i);
  assert.throws(() => addFarm(farm, "a", "Second"), /duplicate/i);
  for (let index = 2; index <= 6; index++) farm = addFarm(farm, `profile-${index}`);
  assert.equal(farm.profiles.length, 6);
  assert.equal(Object.keys(farm.farmStash).length, 5);
  assert.throws(() => addFarm(farm, "seventh"), /capacity/i);
  assert.deepEqual(PersistedFarmSchema.parse(farm), farm);
  assert.deepEqual(empty, createEmptyFixture());
});

function populatedFarm() {
  const slice = createEditableSampleSlice("mr", now, "a");
  const { fieldId, center } = slice.fieldGeometry!;
  const sampleWeather = createSampleFixture().weatherSnapshot!;
  return createProfile({ ...createEmptyFixture(), locale: "mr", landUnit: "gunthas" }, {
    id: "a", name: "पुणे", origin: "sample_copy", nowIso: now,
    initialSlice: {
      ...slice,
      planningUpdatedAt: now,
      soilSkipped: true,
      checkIns: [{ id: "field-a-note", date: "2026-11-22", plotId: null, stage: null, event: "none", note: "पाणी" }],
      weatherSnapshot: { ...sampleWeather, fieldId, coordinate: center, provenance: "modelled" },
      soilSnapshot: {
        fieldId, coordinate: center, source: "Fixture", fetchedAt: now, validAt: null, expiresAt: later,
        data: { queryCoordinate: center, gridCoordinate: center, depthCm: [0, 5], properties: [] },
      },
    },
  });
}

test("switchProfile swaps all eleven farm fields and preserves global preferences", () => {
  const a = populatedFarm();
  const b = addFarm(a, "b", "दुसरे शेत");
  assert.equal(b.fieldGeometry, null);
  assert.deepEqual(b.cropAllocations, []);
  assert.deepEqual(b.farmStash.a, extractFarmSlice(a));
  const backToA = switchProfile(b, "a", later);
  assert.deepEqual(extractFarmSlice(backToA), extractFarmSlice(a));
  assert.deepEqual(backToA.farmStash, { b: extractFarmSlice(b) });
  assert.deepEqual(switchProfile(backToA, "b", later), b);
  assert.equal(backToA.locale, "mr");
  assert.equal(backToA.landUnit, "gunthas");
  assert.equal(switchProfile(backToA, "a", later), backToA);
  assert.throws(() => switchProfile(backToA, "missing", later), /unknown/i);
  assert.deepEqual(PersistedFarmSchema.parse(backToA), backToA);
});

test("renameProfile synchronizes metadata and active or stashed names", () => {
  const farm = addFarm(populatedFarm(), "b", "River");
  const renamedActive = renameProfile(farm, "b", " Ｒｉｖｅｒ Plot ", later);
  assert.equal(renamedActive.farmProfile?.name, "River Plot");
  assert.equal(renamedActive.profiles[1].updatedAt, later);
  assert.equal(renamedActive.farmProfile.updatedAt, later);
  assert.equal(renamedActive.farmStash, farm.farmStash);

  const renamedInactive = renameProfile(renamedActive, "a", "Well Plot", later);
  assert.equal(renamedInactive.farmProfile?.name, "River Plot");
  assert.equal(renamedInactive.farmStash.a.farmProfile?.name, "Well Plot");
  assert.equal(renamedInactive.profiles[0].updatedAt, later);
  assert.equal(switchProfile(renamedInactive, "a", later).farmProfile?.name, "Well Plot");
  assert.throws(() => renameProfile(renamedInactive, "b", "WELL PLOT", later), /duplicate/i);
});

test("deleteProfile selects the most recent remaining farm and undo restores active data exactly", () => {
  const older = addFarm(createEmptyFixture(), "older", "Older", "2026-11-22T22:00:00+05:30");
  const recent = addFarm(older, "recent", "Recent", "2026-11-22T17:00:00Z");
  const farm = createProfile(recent, {
    id: "a", name: "Pune", origin: "sample_copy", nowIso: later, initialSlice: extractFarmSlice(populatedFarm()),
  });
  const { nextState, undoSnapshot } = deleteProfile(farm, "a", later);
  assert.equal(nextState.activeProfileId, "recent");
  assert.deepEqual(extractFarmSlice(nextState), extractFarmSlice(recent));
  assert.deepEqual(undoSnapshot, { meta: farm.profiles[2], slice: extractFarmSlice(farm), wasActive: true });
  assert.deepEqual(restoreDeletedProfile(nextState, undoSnapshot, later), farm);
});

test("deleting an inactive farm preserves the current farm and undo restores the exact stashed data", () => {
  const farm = addFarm(populatedFarm(), "b", "Second");
  const { nextState, undoSnapshot } = deleteProfile(farm, "a", later);
  assert.deepEqual(extractFarmSlice(nextState), extractFarmSlice(farm));
  assert.deepEqual(nextState.farmStash, {});
  assert.equal(nextState.activeProfileId, "b");
  assert.equal(undoSnapshot.wasActive, false);

  const restored = restoreDeletedProfile(nextState, undoSnapshot, later);
  assert.equal(restored.activeProfileId, "b");
  assert.deepEqual(restored.farmStash, farm.farmStash);
  assert.deepEqual(restored.profiles.find(({ id }) => id === "a"), farm.profiles[0]);
  assert.throws(() => restoreDeletedProfile(restored, undoSnapshot, later), /duplicate/i);
  assert.throws(() => restoreDeletedProfile(addFarm(nextState, "c", "पुणे"), undoSnapshot, later), /duplicate/i);
  let full = nextState;
  for (let index = 1; index <= 5; index++) full = addFarm(full, `new-${index}`);
  assert.throws(() => restoreDeletedProfile(full, undoSnapshot, later), /capacity/i);

  const last = deleteProfile(nextState, "b", later);
  assert.equal(last.nextState.activeProfileId, null);
  assert.deepEqual(extractFarmSlice(last.nextState), extractFarmSlice(createEmptyFixture()));
  assert.equal(last.nextState.locale, "mr");
  assert.equal(last.nextState.landUnit, "gunthas");
  assert.deepEqual(restoreDeletedProfile(last.nextState, last.undoSnapshot, later), nextState);
});

test("editable sample copies have fresh field IDs and retain farm data without sample weather", () => {
  const editable = createEditableSampleSlice("mr", now, "profile-copy");
  const sample = createSampleFixture();
  assert.equal(editable.farmProfile?.name, "नमुना शेत · पुणे");
  assert.equal(editable.farmProfile?.updatedAt, now);
  assert.equal(editable.fieldGeometry?.fieldId, "field-copy");
  assert.notEqual(editable.fieldGeometry?.fieldId, sample.fieldGeometry?.fieldId);
  assert.equal(editable.fieldGeometry?.areaSquareMetres, sample.fieldGeometry?.areaSquareMetres);
  assert.deepEqual(editable.cropAllocations, sample.cropAllocations);
  assert.deepEqual(editable.soilKitReading, sample.soilKitReading);
  assert.deepEqual(editable.irrigationSetup, sample.irrigationSetup);
  assert.equal(editable.weatherSnapshot, null);
  const realFarm = applyFarmSlice(createEmptyFixture(), editable);
  assert.equal(realFarm.sampleDataActive, false);
  assert.deepEqual(PersistedFarmSchema.parse(realFarm), realFarm);
});

test("mergeImportedProfiles adds raw and parsed v5 farms, deduplicating names and remapping IDs", () => {
  const current = addFarm(createEmptyFixture(), "a", "Well Plot");
  const source = applyFarmSlice(createEmptyFixture(), createEditableSampleSlice("en", now, "incoming"));
  const legacy = asV5({ ...source, farmProfile: { ...source.farmProfile!, name: "Ｗｅｌｌ Plot" } });
  const importedBackup = parseFarmBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 5, exportedAt: now, farm: legacy }));
  const merged = mergeImportedProfiles(current, legacy, later, () => "a");
  assert.deepEqual(merged, mergeImportedProfiles(current, importedBackup, later, () => "a"));
  assert.deepEqual([merged.addedCount, merged.skippedCount, merged.addedNames], [1, 0, ["Well Plot (2)"]]);
  assert.equal(merged.nextState.activeProfileId, "a");
  assert.deepEqual(extractFarmSlice(merged.nextState), extractFarmSlice(current));
  const added = merged.nextState.profiles[1];
  assert.equal(added.id, "a-2");
  assert.equal(added.origin, "imported");
  assert.equal(merged.nextState.farmStash[added.id].farmProfile?.name, added.name);
  assert.deepEqual(merged.nextState.farmStash[added.id].fieldGeometry, source.fieldGeometry);
  assert.deepEqual(PersistedFarmSchema.parse(merged.nextState), merged.nextState);

  const first = mergeImportedProfiles(createEmptyFixture(), legacy, later, () => "first");
  assert.equal(first.nextState.activeProfileId, "first");
  assert.deepEqual(first.nextState.fieldGeometry, source.fieldGeometry);
  const unprofiled = mergeImportedProfiles(source, legacy, later, () => "second");
  assert.equal(unprofiled.nextState.activeProfileId, "incoming");
  assert.deepEqual(unprofiled.nextState.fieldGeometry, source.fieldGeometry);
});

test("mergeImportedProfiles adds active and stashed v6 farms up to the remaining capacity", () => {
  let current = { ...createEmptyFixture(), locale: "mr" as const, landUnit: "gunthas" as const } as PersistedFarm;
  for (let index = 1; index <= 4; index++) current = addFarm(current, `current-${index}`);
  let incoming = addFarm(populatedFarm(), "b", "Second");
  incoming = addFarm(incoming, "c", "Third");
  incoming = switchProfile(incoming, "b", later);
  const importedBackup = parseFarmBackup(serializeFarmBackup(incoming, now));
  const merged = mergeImportedProfiles(current, importedBackup, later, () => "incoming");
  const { nextState } = merged;
  assert.deepEqual([merged.addedCount, merged.skippedCount, merged.addedNames], [2, 1, ["पुणे", "Second"]]);
  assert.equal(nextState.profiles.length, 6);
  assert.equal(nextState.activeProfileId, current.activeProfileId);
  assert.equal(nextState.locale, "mr");
  assert.equal(nextState.landUnit, "gunthas");
  assert.deepEqual(nextState.farmStash.incoming.checkIns, incoming.farmStash.a.checkIns);
  assert.deepEqual(nextState.farmStash["incoming-2"].fieldGeometry, incoming.fieldGeometry);
  assert.deepEqual(nextState.profiles.slice(-2).map(({ origin }) => origin), ["imported", "imported"]);
  assert.deepEqual(PersistedFarmSchema.parse(nextState), nextState);
  assert.deepEqual(mergeImportedProfiles(nextState, importedBackup, later), {
    nextState, addedCount: 0, skippedCount: 3, addedNames: [],
  });
});

test("summarizeProfile uses canonical area and barSegments with the farm's plots", () => {
  const farm = populatedFarm();
  const meta = farm.profiles[0];
  const { createdAt: _createdAt, ...summaryMeta } = meta;
  assert.deepEqual(summarizeProfile(meta, extractFarmSlice(farm)), {
    ...summaryMeta, areaGunthas: 80, plotCount: 2, setupComplete: true,
    segments: barSegments(80, farm.cropAllocations).segments,
  });
});
