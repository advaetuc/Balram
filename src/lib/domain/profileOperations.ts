import { createEmptyFixture, createSampleFixture } from "@/mocks/fixtures";
import {
  MAX_FARM_PROFILES, PersistedFarmSchema, ProfileMetaSchema,
  type Locale, type PersistedFarm, type ProfileMeta, type ProfileOrigin, type StashedFarm,
} from "@/types/domain";
import type { z } from "zod";
import { createFieldId } from "./fieldId";
import { upgradeLegacyFarmProfiles } from "./profileMigration";
import { makeUniqueProfileName, validateProfileName } from "./profileNames";

export { makeUniqueProfileName, normalizeProfileName, validateProfileName } from "./profileNames";

export const createProfileId = () => createFieldId().replace(/^field-/, "profile-");

export function extractFarmSlice(farm: StashedFarm): StashedFarm {
  return {
    farmProfile: farm.farmProfile,
    fieldGeometry: farm.fieldGeometry,
    cropAllocations: farm.cropAllocations,
    irrigationSetup: farm.irrigationSetup,
    weatherSnapshot: farm.weatherSnapshot,
    soilSnapshot: farm.soilSnapshot,
    planningUpdatedAt: farm.planningUpdatedAt,
    soilKitReading: farm.soilKitReading,
    soilSkipped: farm.soilSkipped,
    setupCompletedAt: farm.setupCompletedAt,
    checkIns: farm.checkIns,
  };
}

export function applyFarmSlice(farm: PersistedFarm, slice: StashedFarm): PersistedFarm {
  return { ...farm, ...extractFarmSlice(slice) };
}

function withProfile(slice: StashedFarm, meta: ProfileMeta, locale: Locale, updatedAt: string): StashedFarm {
  return {
    ...slice,
    farmProfile: {
      id: meta.id, name: meta.name, district: slice.farmProfile?.district ?? null,
      locale, timezone: "Asia/Kolkata", updatedAt,
    },
  };
}

function requireProfile(state: PersistedFarm, id: string): ProfileMeta {
  const meta = state.profiles.find((profile) => profile.id === id);
  if (!meta) throw new Error("Unknown farm profile.");
  return meta;
}

function requireProfileName(raw: string, profiles: readonly ProfileMeta[], excludeId?: string): string {
  const result = validateProfileName(raw, profiles, excludeId);
  if (!result.ok) throw new Error(`Invalid farm profile name: ${result.reason}.`);
  return result.name;
}

function stashedSlice(state: PersistedFarm, id: string): StashedFarm {
  return Object.hasOwn(state.farmStash, id) ? state.farmStash[id] : extractFarmSlice(createEmptyFixture());
}

function stashActiveFarm(state: PersistedFarm): Record<string, StashedFarm> {
  return state.activeProfileId === null
    ? { ...state.farmStash }
    : { ...state.farmStash, [state.activeProfileId]: extractFarmSlice(state) };
}

export interface CreateProfileOptions {
  name: string;
  origin: ProfileOrigin;
  initialSlice?: StashedFarm;
  nowIso: string;
  id?: string;
  idFactory?: () => string;
}

export function createProfile(state: PersistedFarm, options: CreateProfileOptions): PersistedFarm {
  if (state.profiles.length >= MAX_FARM_PROFILES) throw new RangeError("Farm profile capacity reached.");
  const { origin, initialSlice = extractFarmSlice(createEmptyFixture()), nowIso } = options;
  const name = requireProfileName(options.name, state.profiles);
  const meta = ProfileMetaSchema.parse({
    id: options.id ?? (options.idFactory ?? createProfileId)(),
    name, origin, createdAt: nowIso, updatedAt: nowIso,
  });
  if (state.profiles.some((profile) => profile.id === meta.id)) throw new Error("Duplicate farm profile ID.");

  return {
    ...applyFarmSlice(state, withProfile(initialSlice, meta, state.locale, nowIso)),
    profiles: [...state.profiles, meta],
    activeProfileId: meta.id,
    farmStash: stashActiveFarm(state),
  };
}

export function switchProfile(state: PersistedFarm, targetId: string, nowIso: string): PersistedFarm {
  if (targetId === state.activeProfileId) return state;

  const meta = requireProfile(state, targetId);
  const slice = stashedSlice(state, targetId);
  const farmStash = stashActiveFarm(state);
  delete farmStash[targetId];
  const synchronized = slice.farmProfile
    ? { ...slice, farmProfile: { ...slice.farmProfile, name: meta.name } }
    : withProfile(slice, meta, state.locale, nowIso);
  return { ...applyFarmSlice(state, synchronized), activeProfileId: targetId, farmStash };
}

export function renameProfile(state: PersistedFarm, targetId: string, nextName: string, nowIso: string): PersistedFarm {
  const previous = requireProfile(state, targetId);
  const name = requireProfileName(nextName, state.profiles, targetId);
  const meta = { ...previous, name, updatedAt: nowIso };
  const next = { ...state, profiles: state.profiles.map((profile) => profile.id === targetId ? meta : profile) };
  if (targetId === state.activeProfileId) {
    return applyFarmSlice(next, withProfile(extractFarmSlice(state), meta, state.locale, nowIso));
  }
  return {
    ...next,
    farmStash: { ...state.farmStash, [targetId]: withProfile(stashedSlice(state, targetId), meta, state.locale, nowIso) },
  };
}

export interface DeletedProfileSnapshot {
  meta: ProfileMeta;
  slice: StashedFarm;
  wasActive: boolean;
  index?: number;
}

export function deleteProfile(state: PersistedFarm, targetId: string, nowIso: string): {
  nextState: PersistedFarm;
  undoSnapshot: DeletedProfileSnapshot;
} {
  const meta = requireProfile(state, targetId);
  const wasActive = targetId === state.activeProfileId;
  const slice = wasActive ? extractFarmSlice(state) : stashedSlice(state, targetId);
  const profiles = state.profiles.filter((profile) => profile.id !== targetId);
  const farmStash = { ...state.farmStash };
  delete farmStash[targetId];
  let nextState = { ...state, profiles, farmStash };

  if (wasActive) {
    nextState = { ...nextState, activeProfileId: null };
    const mostRecent = profiles.reduce<ProfileMeta | undefined>((recent, profile) =>
      !recent || Date.parse(profile.updatedAt) > Date.parse(recent.updatedAt) ? profile : recent, undefined);
    nextState = mostRecent
      ? switchProfile(nextState, mostRecent.id, nowIso)
      : applyFarmSlice(nextState, extractFarmSlice(createEmptyFixture()));
  }

  const index = state.profiles.indexOf(meta);
  return {
    nextState,
    undoSnapshot: { meta, slice, wasActive, ...(index < profiles.length ? { index } : {}) },
  };
}

export function restoreDeletedProfile(
  state: PersistedFarm, { meta, slice, wasActive, index }: DeletedProfileSnapshot, _nowIso: string,
): PersistedFarm {
  if (state.profiles.length >= MAX_FARM_PROFILES) throw new RangeError("Farm profile capacity reached.");
  if (state.profiles.some((profile) => profile.id === meta.id)) throw new Error("Duplicate farm profile ID.");
  requireProfileName(meta.name, state.profiles);

  const profiles = [...state.profiles];
  profiles.splice(index ?? profiles.length, 0, meta);
  const next = { ...state, profiles };
  if (!wasActive) {
    return { ...next, farmStash: { ...state.farmStash, [meta.id]: slice } };
  }
  return { ...applyFarmSlice(next, slice), activeProfileId: meta.id, farmStash: stashActiveFarm(state) };
}

export function createEditableSampleSlice(locale: Locale, nowIso: string, id = createProfileId()): StashedFarm {
  const sample = createSampleFixture();
  const name = locale === "mr" ? "नमुना शेत · पुणे" : "Sample farm · Pune";
  const meta: ProfileMeta = { id, name, createdAt: nowIso, updatedAt: nowIso, origin: "sample_copy" };
  return withProfile({
    ...extractFarmSlice(sample),
    fieldGeometry: { ...sample.fieldGeometry!, fieldId: `field-${id.replace(/^profile-/, "").slice(0, 122)}` },
    weatherSnapshot: null,
  }, meta, locale, nowIso);
}

export function mergeImportedProfiles(
  current: PersistedFarm, imported: z.input<typeof PersistedFarmSchema>, nowIso: string, idFactory = createProfileId,
): { nextState: PersistedFarm; addedCount: number; skippedCount: number; addedNames: string[] } {
  if (imported.sampleDataActive) throw new Error("Sample Farm data cannot be imported as a real farm.");
  const incoming = imported.profiles?.length ? PersistedFarmSchema.parse(imported) : upgradeLegacyFarmProfiles(imported);
  const addedNames: string[] = [];
  if (incoming.profiles.length === 0) return { nextState: current, addedCount: 0, skippedCount: 0, addedNames };

  // Single-farm workflows can still produce unprofiled data during the v6 rollout.
  let nextState = current.profiles.length ? current : upgradeLegacyFarmProfiles(current);
  const reservedIds = new Set([...nextState.profiles, ...incoming.profiles].map(({ id }) => id));
  for (const profile of incoming.profiles.slice(0, MAX_FARM_PROFILES - nextState.profiles.length)) {
    const baseId = ProfileMetaSchema.shape.id.parse(idFactory());
    let id = baseId;
    for (let suffix = 2; reservedIds.has(id); suffix++) {
      const ending = `-${suffix}`;
      id = baseId.slice(0, 128 - ending.length) + ending;
    }
    reservedIds.add(id);
    const name = makeUniqueProfileName(profile.name, nextState.profiles);
    const meta: ProfileMeta = { id, name, origin: "imported", createdAt: nowIso, updatedAt: nowIso };
    const source = profile.id === incoming.activeProfileId ? extractFarmSlice(incoming) : stashedSlice(incoming, profile.id);
    const slice = withProfile(source, meta, nextState.locale, nowIso);
    nextState = nextState.activeProfileId === null
      ? createProfile(nextState, { ...meta, initialSlice: slice, nowIso })
      : {
        ...nextState,
        profiles: [...nextState.profiles, meta],
        farmStash: { ...nextState.farmStash, [id]: slice },
      };
    addedNames.push(name);
  }
  return { nextState, addedCount: addedNames.length, skippedCount: incoming.profiles.length - addedNames.length, addedNames };
}
