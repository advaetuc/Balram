"use client";

import { z } from "zod";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { createIndexedDBStorage, type StorageStatus } from "@/lib/storage/db";
import { upgradeLegacyFarmProfiles } from "@/lib/domain/profileMigration";
import {
  createEditableSampleSlice, createProfile, createProfileId, deleteProfile, mergeImportedProfiles,
  renameProfile, restoreDeletedProfile, switchProfile, validateProfileName, type DeletedProfileSnapshot,
} from "@/lib/domain/profileOperations";
import { createEmptyFixture, createSampleFixture } from "@/mocks/fixtures";
import {
  CropAllocationsSchema, FarmProfileSchema, FieldGeometrySchema, LandUnitSchema, LocaleSchema, SoilKitReadingSchema, growthToLifecycleStage,
  lifecycleToGrowthStage, CheckInSchema, IrrigationSetupSchema, PersistedFarmSchema, WeatherSnapshotSchema, SoilSnapshotSchema, type CheckIn, type SoilSnapshot,
  type CropAllocation, type DataSourceStatus, type FarmProfile,
  type FieldGeometry, type IrrigationSetup, type PersistedFarm, type WeatherSnapshot, type SoilKitReading, type Locale, type LandUnit,
} from "@/types/domain";

export const PERSISTENCE_VERSION = 6;
export const STORAGE_KEY = "balram:farm";
export const LEGACY_V5_BACKUP_KEY = "balram:legacy-v5";

export interface WeatherRequest {
  id: string;
  generation: number;
  fieldKey: string;
  signal: AbortSignal;
}

export interface BalramState extends PersistedFarm {
  hydrated: boolean;
  sampleOverlayActive: boolean;
  hydrationError: string | null;
  storageStatus: StorageStatus;
  connection: "unknown" | "online" | "offline";
  weatherStatus: DataSourceStatus;
  weatherCached: boolean;
  weatherStale: boolean;
  soilStatus: DataSourceStatus;
  now: number | null;
  setFarmProfile(profile: FarmProfile): void;
  setFieldGeometry(geometry: FieldGeometry | null): void;
  setCropAllocations(allocations: CropAllocation[]): void;
  setIrrigationSetup(setup: IrrigationSetup | null): void;
  setSoilKitReading(reading: SoilKitReading | null): void;
  setSoilSkipped(skipped: boolean): void;
  setSetupCompletedAt(dateIso: string | null): void;
  addCheckIn(checkIn: CheckIn): void;
  replacePersistedState(next: PersistedFarm): void;
  setLocale(locale: Locale): void;
  setLandUnit(unit: LandUnit): void;
  resetDerivedForFieldChange(): void;
  setSampleData(active: boolean): Promise<void>;
  createFarmProfile(name: string, options?: { fromSample?: boolean }): Promise<void>;
  switchFarmProfile(profileId: string): Promise<void>;
  renameFarmProfile(profileId: string, name: string): Promise<void>;
  deleteFarmProfile(profileId: string): Promise<DeletedProfileSnapshot | null>;
  restoreFarmProfile(snapshot: DeletedProfileSnapshot): void;
  importFarmProfiles(imported: PersistedFarm): { addedCount: number; skippedCount: number; addedNames: string[] };
  beginWeatherRequest(): WeatherRequest;
  commitWeatherRequest(request: WeatherRequest, snapshot: WeatherSnapshot, cached?: boolean): boolean;
  failWeatherRequest(request: WeatherRequest, message?: string): boolean;
  beginSoilRequest(): WeatherRequest;
  commitSoilRequest(request: WeatherRequest, snapshot: SoilSnapshot): boolean;
  failSoilRequest(request: WeatherRequest, message: string): boolean;
}

const idleWeather = (): DataSourceStatus => ({
  provider: "weather", state: "idle", provenance: "unavailable",
  requestId: null, updatedAt: null, error: null,
});
const idleSoil = (): DataSourceStatus => ({ ...idleWeather(), provider: "soil" });

export function isWeatherStale(snapshot: WeatherSnapshot, now: number): boolean {
  return now >= Date.parse(snapshot.expiresAt) || now >= Date.parse(snapshot.validTo) ||
    now < Date.parse(snapshot.fetchedAt);
}

function statusFor(snapshot: WeatherSnapshot | null, now = Date.now()): DataSourceStatus {
  if (!snapshot) return idleWeather();
  return {
    provider: "weather", state: isWeatherStale(snapshot, now) ? "stale" : "success",
    provenance: snapshot.provenance, requestId: null, updatedAt: snapshot.fetchedAt, error: null,
  };
}

function snapshotStatuses(farm: PersistedFarm) {
  const weatherStatus = statusFor(farm.weatherSnapshot);
  return {
    weatherStatus,
    weatherCached: !!farm.weatherSnapshot && !farm.sampleDataActive,
    weatherStale: weatherStatus.state === "stale",
    soilStatus: farm.soilSnapshot
      ? { ...idleSoil(), state: "success" as const, provenance: "modelled" as const, updatedAt: farm.soilSnapshot.fetchedAt }
      : idleSoil(),
  };
}

function persistedSlice(state: BalramState): PersistedFarm {
  return {
    farmProfile: state.farmProfile, fieldGeometry: state.fieldGeometry,
    cropAllocations: state.cropAllocations, irrigationSetup: state.irrigationSetup,
    weatherSnapshot: state.weatherSnapshot, sampleDataActive: state.sampleDataActive,
    soilSnapshot: state.soilSnapshot, planningUpdatedAt: state.planningUpdatedAt,
    soilKitReading: state.soilKitReading, locale: state.locale, landUnit: state.landUnit,
    soilSkipped: state.soilSkipped, setupCompletedAt: state.setupCompletedAt, checkIns: state.checkIns,
    profiles: state.profiles, activeProfileId: state.activeProfileId, farmStash: state.farmStash,
  };
}

/** Pure persisted-slice upgrader so old local snapshots can be verified without browser storage. */
export function migratePersistedFarm(saved: unknown, version: number): PersistedFarm {
  if (!saved || typeof saved !== "object") {
    throw new Error("Unsupported saved data version.");
  }
  if (version === PERSISTENCE_VERSION) return PersistedFarmSchema.parse(saved);
  if (version === 5) return upgradeLegacyFarmProfiles(saved);
  if (![0, 1, 2, 3, 4].includes(version)) throw new Error("Unsupported saved data version.");
  const legacy = saved as Partial<PersistedFarm> & Record<string, unknown>;
  const cropAllocations = Array.isArray(legacy.cropAllocations) ? legacy.cropAllocations.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    const crop = item as Record<string, unknown>;
    const growth = typeof crop.growthStage === "string" ? crop.growthStage : "unknown";
    return {
      ...crop,
      plotId: crop.plotId ?? `plot-${index + 1}`,
      plotName: crop.plotName ?? `Plot ${index + 1}`,
      lifecycleStage: crop.lifecycleStage ?? growthToLifecycleStage(growth as import("@/types/domain").GrowthStage),
    };
  }) : legacy.cropAllocations;
  const soilKitReading = legacy.soilKitReading && typeof legacy.soilKitReading === "object"
    ? (() => {
      const oldReading = legacy.soilKitReading as Record<string, unknown>;
      return { ...oldReading, nitrogenKgPerHa: oldReading.nitrogenKgPerHa ?? null, phosphorusKgPerHa: oldReading.phosphorusKgPerHa ?? null };
    })()
    : legacy.soilKitReading ?? null;
  return upgradeLegacyFarmProfiles({
    sampleDataActive: false,
    locale: "en",
    soilSkipped: false,
    setupCompletedAt: null,
    checkIns: [],
    ...legacy,
    landUnit: legacy.landUnit ?? "acres",
    soilKitReading,
    cropAllocations,
  });
}

/** Each factory owns request controllers; none enter JSON or shared server state. */
export function createBalramStore(disk = createIndexedDBStorage()) {
  let writesEnabled = false;
  let hydration: Promise<void> | undefined;
  let hydrationFailure: unknown;
  let storedVersion: number | undefined;
  let generation = 0;
  let sequence = 0;
  let active: { request: WeatherRequest; controller: AbortController } | null = null;
  let activeSoil: { request: WeatherRequest; controller: AbortController } | null = null;
  let realFarmBackup: PersistedFarm | null = null;
  let sampleRevision = 0;

  function resetTransient(nextFarm: PersistedFarm) {
    const previous = active;
    const previousSoil = activeSoil;
    active = null;
    activeSoil = null;
    generation++;
    const transient = { ...snapshotStatuses(nextFarm), hydrationError: null };
    return {
      transient,
      abort: () => {
        previous?.controller.abort();
        previousSoil?.controller.abort();
      },
    };
  }

  const storage = createJSONStorage<PersistedFarm>(() => ({
    getItem: async (name) => {
      const raw = await disk.storage.getItem(name);
      if (raw === null) return null;
      if (raw.length > 2_000_000) throw new Error("Saved farm data exceeds the supported size.");
      const envelope: unknown = JSON.parse(raw);
      if (!envelope || typeof envelope !== "object" || !("state" in envelope)) {
        throw new Error("Invalid saved farm envelope.");
      }
      const version = "version" in envelope ? envelope.version : 0;
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
        throw new Error("Invalid saved farm version.");
      }
      storedVersion = version;
      if (version < PERSISTENCE_VERSION && disk.getStatus().mode === "persistent") {
        try {
          if (await disk.storage.getItem(LEGACY_V5_BACKUP_KEY) === null && disk.getStatus().mode === "persistent") {
            await disk.storage.setItem(LEGACY_V5_BACKUP_KEY, raw);
          }
        } catch {
          // The legacy copy is best-effort; the regular hydration path still validates the farm.
        }
      }
      return JSON.stringify({ state: envelope.state, version });
    },
    setItem: (name, value) => writesEnabled ? disk.storage.setItem(name, value) : Promise.resolve(),
    removeItem: disk.storage.removeItem,
  }));

  const store = createStore<BalramState>()(persist((set, get) => {
    const requireReady = () => {
      if (typeof window === "undefined" || !get().hydrated) {
        throw new Error("Wait for local data to finish loading before editing.");
      }
    };
    const requireWritable = () => {
      requireReady();
      if (get().sampleDataActive || get().sampleOverlayActive) throw new Error("Sample farm is read-only. Exit sample mode to edit your farm.");
    };
    const leaveSampleMode = async () => {
      requireReady();
      if (get().sampleDataActive || get().sampleOverlayActive) await get().setSampleData(false);
    };
    const commitFarm = (next: PersistedFarm, sampleOverlayActive = get().sampleOverlayActive) => {
      const { transient, abort } = resetTransient(next);
      try {
        set({ ...next, ...transient, sampleOverlayActive });
      } finally {
        // Abort listeners run synchronously and must see the newly selected farm.
        abort();
      }
    };
    const farmEdit = (patch: Partial<PersistedFarm>, nowIso = new Date().toISOString()): Partial<PersistedFarm> => {
      const current = get();
      if (current.activeProfileId === null) return { ...patch, planningUpdatedAt: nowIso };
      const farmProfile = patch.farmProfile ?? current.farmProfile;
      return {
        ...patch,
        planningUpdatedAt: nowIso,
        farmProfile: farmProfile && { ...farmProfile, updatedAt: nowIso },
        profiles: current.profiles.map((meta) => meta.id === current.activeProfileId
          ? { ...meta, name: farmProfile?.name ?? meta.name, updatedAt: nowIso }
          : meta),
      };
    };
    const invalidate = (patch: Partial<PersistedFarm> = {}) => {
      requireWritable();
      commitFarm({ ...persistedSlice(get()), ...farmEdit(patch), weatherSnapshot: null, soilSnapshot: null });
    };
    const isCurrent = (request: WeatherRequest) => active?.request === request &&
      !request.signal.aborted && request.generation === generation &&
      request.fieldKey === JSON.stringify(get().fieldGeometry);
    const isCurrentSoil = (request: WeatherRequest) => activeSoil?.request === request &&
      !request.signal.aborted && request.generation === generation && request.fieldKey === JSON.stringify(get().fieldGeometry);

    return {
      ...createEmptyFixture(), hydrated: false, sampleOverlayActive: false, hydrationError: null,
      storageStatus: disk.getStatus(), connection: "unknown", weatherStatus: idleWeather(), weatherCached: false, weatherStale: false,
      soilStatus: idleSoil(), now: null,
      setFarmProfile: (input) => {
        requireWritable();
        const profile = FarmProfileSchema.parse(input);
        const { activeProfileId, profiles } = get();
        if (activeProfileId !== null) {
          const name = validateProfileName(profile.name, profiles, activeProfileId);
          if (!name.ok) throw new Error(`Invalid farm profile name: ${name.reason}.`);
          set(farmEdit({ farmProfile: { ...profile, id: activeProfileId, name: name.name } }));
        } else {
          set(farmEdit({ farmProfile: profile }));
        }
      },
      setFieldGeometry: (geometry) => {
        requireWritable();
        const next = geometry === null ? null : FieldGeometrySchema.parse(geometry);
        if (JSON.stringify(next) !== JSON.stringify(get().fieldGeometry)) invalidate({ fieldGeometry: next });
      },
      setCropAllocations: (allocations) => { requireWritable(); set(farmEdit({ cropAllocations: CropAllocationsSchema.parse(allocations) })); },
      setIrrigationSetup: (setup) => {
        requireWritable();
        set(farmEdit({ irrigationSetup: setup === null ? null : IrrigationSetupSchema.parse(setup) }));
      },
      setSoilKitReading: (reading) => { requireWritable(); set(farmEdit({ soilKitReading: reading === null ? null : SoilKitReadingSchema.parse(reading), soilSkipped: reading === null ? get().soilSkipped : false })); },
      setSoilSkipped: (skipped) => { requireWritable(); set(farmEdit({ soilSkipped: z.boolean().parse(skipped) })); },
      setSetupCompletedAt: (dateIso) => {
        requireWritable();
        const parsed = z.string().date().nullable().parse(dateIso);
        set(farmEdit({ setupCompletedAt: parsed }));
      },
      addCheckIn: (input) => {
        requireWritable();
        const checkIn = CheckInSchema.parse(input);
        const cropAllocations = checkIn.plotId && checkIn.stage
          ? get().cropAllocations.map((plot) => plot.plotId === checkIn.plotId
            ? { ...plot, lifecycleStage: checkIn.stage!, growthStage: lifecycleToGrowthStage(checkIn.stage!) }
            : plot)
          : get().cropAllocations;
        set(farmEdit({ checkIns: [checkIn, ...get().checkIns].slice(0, 104), cropAllocations }));
      },
      replacePersistedState: (input) => {
        requireWritable();
        commitFarm(PersistedFarmSchema.parse(input));
      },
      setLocale: (locale) => { requireReady(); set({ locale: LocaleSchema.parse(locale) }); },
      setLandUnit: (unit) => { requireReady(); set({ landUnit: LandUnitSchema.parse(unit) }); },
      resetDerivedForFieldChange: () => invalidate(),
      setSampleData: async (enabled) => {
        requireReady();
        const current = persistedSlice(get());
        const overlayActive = get().sampleOverlayActive;
        if (enabled ? overlayActive : !overlayActive && !current.sampleDataActive) return;
        const revision = ++sampleRevision;
        if (enabled) {
          realFarmBackup = current.sampleDataActive ? createEmptyFixture() : current;
          writesEnabled = false;
          commitFarm(current, true);
          await disk.flush();
          if (revision !== sampleRevision) return;
          const { locale, landUnit } = get();
          const next = { ...createSampleFixture(), locale, landUnit };
          set({ ...next, ...snapshotStatuses(next) });
        } else {
          const next = realFarmBackup ?? (current.sampleDataActive ? createEmptyFixture() : current);
          realFarmBackup = null;
          writesEnabled = true;
          commitFarm({ ...next, locale: current.locale, landUnit: current.landUnit }, false);
        }
      },
      createFarmProfile: async (name, options) => {
        await leaveSampleMode();
        requireWritable();
        const current = persistedSlice(get());
        const farm = current.profiles.length === 0 ? upgradeLegacyFarmProfiles(current) : current;
        const nowIso = new Date().toISOString();
        const id = createProfileId();
        const fromSample = options?.fromSample === true;
        const initialSlice = fromSample ? createEditableSampleSlice(farm.locale, nowIso, id) : undefined;
        commitFarm(createProfile(farm, { name, origin: fromSample ? "sample_copy" : "blank", initialSlice, nowIso, id }));
      },
      switchFarmProfile: async (profileId) => {
        await leaveSampleMode();
        requireWritable();
        const current = persistedSlice(get());
        const next = switchProfile(current, profileId, new Date().toISOString());
        if (next !== current) commitFarm(next);
      },
      renameFarmProfile: async (profileId, name) => {
        await leaveSampleMode();
        requireWritable();
        set(renameProfile(persistedSlice(get()), profileId, name, new Date().toISOString()));
      },
      deleteFarmProfile: async (profileId) => {
        await leaveSampleMode();
        requireWritable();
        const current = persistedSlice(get());
        if (!current.profiles.some(({ id }) => id === profileId)) return null;
        const { nextState, undoSnapshot } = deleteProfile(current, profileId, new Date().toISOString());
        commitFarm(nextState);
        return undoSnapshot;
      },
      restoreFarmProfile: (snapshot) => {
        requireWritable();
        commitFarm(restoreDeletedProfile(persistedSlice(get()), snapshot, new Date().toISOString()));
      },
      importFarmProfiles: (imported) => {
        requireWritable();
        const { nextState, ...report } = mergeImportedProfiles(persistedSlice(get()), imported, new Date().toISOString());
        if (report.addedCount > 0) commitFarm(nextState);
        return report;
      },
      beginWeatherRequest: () => {
        requireReady();
        if (!get().fieldGeometry || get().sampleDataActive || get().sampleOverlayActive) {
          throw new Error("Select a real field before requesting weather.");
        }
        const previous = active;
        const controller = new AbortController();
        const request: WeatherRequest = {
          id: `weather-${generation}-${++sequence}`, generation,
          fieldKey: JSON.stringify(get().fieldGeometry), signal: controller.signal,
        };
        active = { request, controller };
        set({ weatherStatus: { ...get().weatherStatus, state: "loading", requestId: request.id, error: null } });
        previous?.controller.abort();
        return request;
      },
      commitWeatherRequest: (request, input, cached = false) => {
        requireReady();
        if (!isCurrent(request)) return false;
        const snapshot = WeatherSnapshotSchema.parse(input);
        const validated = PersistedFarmSchema.parse({ ...persistedSlice(get()), weatherSnapshot: snapshot });
        active = null;
        set({ weatherSnapshot: validated.weatherSnapshot, weatherStatus: statusFor(snapshot), weatherCached: cached,
          weatherStale: isWeatherStale(snapshot, Date.now()) });
        return true;
      },
      failWeatherRequest: (request, message) => {
        requireReady();
        if (!isCurrent(request)) return false;
        active = null;
        set({ weatherStatus: {
          ...get().weatherStatus, state: "error", requestId: null,
          error: message?.slice(0, 300) || "Weather is unavailable. Any saved values retain their original dates.",
        } });
        return true;
      },
      beginSoilRequest: () => {
        requireReady();
        if (!get().fieldGeometry || get().sampleDataActive || get().sampleOverlayActive) throw new Error("Select a real field before requesting soil data.");
        const previous = activeSoil;
        const controller = new AbortController();
        const request: WeatherRequest = { id: `soil-${generation}-${++sequence}`, generation,
          fieldKey: JSON.stringify(get().fieldGeometry), signal: controller.signal };
        activeSoil = { request, controller };
        set({ soilStatus: { ...get().soilStatus, state: "loading", requestId: request.id, error: null } });
        previous?.controller.abort();
        return request;
      },
      commitSoilRequest: (request, input) => {
        requireReady();
        if (!isCurrentSoil(request)) return false;
        const snapshot = SoilSnapshotSchema.parse(input);
        PersistedFarmSchema.parse({ ...persistedSlice(get()), soilSnapshot: snapshot });
        activeSoil = null;
        set({ soilSnapshot: snapshot, soilStatus: { provider: "soil", state: "success", provenance: "modelled",
          requestId: null, updatedAt: snapshot.fetchedAt, error: null } });
        return true;
      },
      failSoilRequest: (request, message) => {
        requireReady();
        if (!isCurrentSoil(request)) return false;
        activeSoil = null;
        set({ soilStatus: { ...get().soilStatus, state: "error", requestId: null, error: message.slice(0, 300) } });
        return true;
      },
    };
  }, {
    name: STORAGE_KEY,
    version: PERSISTENCE_VERSION,
    storage,
    skipHydration: true,
    partialize: persistedSlice,
    // Accept unversioned inputs only when they validate against the current contract.
    migrate: migratePersistedFarm,
    merge: (saved, current) => {
      if (saved === undefined) return current;
      const data = PersistedFarmSchema.parse(saved);
      return { ...current, ...data, ...snapshotStatuses(data) };
    },
    onRehydrateStorage: () => (_state, error) => { hydrationFailure = error; },
  }));

  const serverSnapshot = store.getInitialState();

  const initialize = (): Promise<void> => {
    if (typeof window === "undefined") return Promise.resolve();
    if (!hydration) {
      hydration = (async () => {
        try { await store.persist.rehydrate(); }
        catch (error) { hydrationFailure = error; }
        if (hydrationFailure) {
          disk.useMemoryOnly("Saved data could not be read. It has been preserved; new changes stay in this tab only.");
        } else if (storedVersion === PERSISTENCE_VERSION && disk.getStatus().mode === "persistent") {
          try { await disk.storage.removeItem(LEGACY_V5_BACKUP_KEY); }
          catch { /* A later healthy boot can retry cleanup. */ }
        }
        // Only enable writes after merge/validation, so empty defaults cannot overwrite saved data.
        writesEnabled = true;
        store.setState({
          hydrated: true,
          hydrationError: hydrationFailure ? "Saved data could not be loaded." : null,
          storageStatus: disk.getStatus(),
        });
      })();
    }
    return hydration;
  };

  let subscribers = 0;
  let stopRuntime: (() => void) | undefined;
  const subscribe = (listener: () => void) => {
    const unsubscribe = store.subscribe(listener);
    subscribers++;
    if (subscribers === 1 && typeof window !== "undefined") {
      const refresh = () => {
        if (!store.getState().hydrated) return;
        const state = store.getState();
        const connection = navigator.onLine ? "online" : "offline";
        const stale = !!state.weatherSnapshot && isWeatherStale(state.weatherSnapshot, Date.now());
        const now = Date.now();
        if (connection !== state.connection || now !== state.now || stale !== state.weatherStale || (stale && state.weatherStatus.state === "success")) {
          store.setState({ connection, now, weatherStale: stale, ...(stale && state.weatherStatus.state === "success"
            ? { weatherStatus: { ...state.weatherStatus, state: "stale" as const } } : {}) });
        }
      };
      const stopDisk = disk.subscribe(() => {
        if (store.getState().hydrated) store.setState({ storageStatus: disk.getStatus() });
      });
      window.addEventListener("online", refresh);
      window.addEventListener("offline", refresh);
      document.addEventListener("visibilitychange", refresh);
      const timer = window.setInterval(refresh, 30_000);
      stopRuntime = () => {
        stopDisk();
        window.removeEventListener("online", refresh);
        window.removeEventListener("offline", refresh);
        document.removeEventListener("visibilitychange", refresh);
        window.clearInterval(timer);
      };
      void initialize().then(refresh);
    }
    return () => {
      unsubscribe();
      if (--subscribers === 0) { stopRuntime?.(); stopRuntime = undefined; }
    };
  };

  return { store, initialize, subscribe, getServerSnapshot: () => serverSnapshot, flush: disk.flush };
}

let clientStore: ReturnType<typeof createBalramStore> | undefined;
const serverStore = createBalramStore();

function getStore() {
  if (typeof window === "undefined") return serverStore;
  return clientStore ??= createBalramStore();
}

/** Stable snapshots hydrate against the deterministic server state, never browser data. */
export function useBalramStore<T>(selector: (state: BalramState) => T): T {
  const api = getStore();
  const state = useSyncExternalStore(api.subscribe, api.store.getState, api.getServerSnapshot);
  return selector(state);
}
