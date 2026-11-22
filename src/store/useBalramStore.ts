"use client";

import { z } from "zod";
import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { createIndexedDBStorage, type StorageStatus } from "@/lib/storage/db";
import { upgradeLegacyFarmProfiles } from "@/lib/domain/profileMigration";
import { createEmptyFixture, createSampleFixture } from "@/mocks/fixtures";
import {
  CropAllocationsSchema, FarmProfileSchema, FieldGeometrySchema, LandUnitSchema, LocaleSchema, SoilKitReadingSchema, growthToLifecycleStage,
  lifecycleToGrowthStage, CheckInSchema, IrrigationSetupSchema, PersistedFarmSchema, WeatherSnapshotSchema, SoilSnapshotSchema, type CheckIn, type SoilSnapshot,
  type CropAllocation, type DataSourceStatus, type FarmProfile,
  type FieldGeometry, type IrrigationSetup, type PersistedFarm, type WeatherSnapshot, type SoilKitReading, type Locale, type LandUnit,
} from "@/types/domain";

export const PERSISTENCE_VERSION = 6;
export const STORAGE_KEY = "balram:farm";

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

function statusFor(snapshot: WeatherSnapshot | null): DataSourceStatus {
  if (!snapshot) return idleWeather();
  return {
    provider: "weather", state: isWeatherStale(snapshot, Date.now()) ? "stale" : "success",
    provenance: snapshot.provenance, requestId: null, updatedAt: snapshot.fetchedAt, error: null,
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
export function createBalramStore() {
  const disk = createIndexedDBStorage();
  let writesEnabled = false;
  let hydration: Promise<void> | undefined;
  let hydrationFailure: unknown;
  let generation = 0;
  let sequence = 0;
  let active: { request: WeatherRequest; controller: AbortController } | null = null;
  let activeSoil: { request: WeatherRequest; controller: AbortController } | null = null;
  let realFarmBackup: PersistedFarm | null = null;
  let sampleTransition = false;

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
      if (sampleTransition || get().sampleDataActive || get().sampleOverlayActive) throw new Error("Sample farm is read-only. Exit sample mode to edit your farm.");
    };
    const invalidate = (patch: Partial<PersistedFarm> = {}) => {
      requireWritable();
      const previous = active;
      const previousSoil = activeSoil;
      active = null;
      activeSoil = null;
      generation++;
      set({ ...patch, weatherSnapshot: null, weatherStatus: idleWeather(), weatherCached: false, weatherStale: false,
        soilSnapshot: null, soilStatus: idleSoil(), planningUpdatedAt: new Date().toISOString() });
      previous?.controller.abort();
      previousSoil?.controller.abort();
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
      setFarmProfile: (profile) => { requireWritable(); set({ farmProfile: FarmProfileSchema.parse(profile), planningUpdatedAt: new Date().toISOString() }); },
      setFieldGeometry: (geometry) => {
        requireWritable();
        const next = geometry === null ? null : FieldGeometrySchema.parse(geometry);
        if (JSON.stringify(next) !== JSON.stringify(get().fieldGeometry)) invalidate({ fieldGeometry: next });
      },
      setCropAllocations: (allocations) => { requireWritable(); set({ cropAllocations: CropAllocationsSchema.parse(allocations), planningUpdatedAt: new Date().toISOString() }); },
      setIrrigationSetup: (setup) => {
        requireWritable();
        set({ irrigationSetup: setup === null ? null : IrrigationSetupSchema.parse(setup), planningUpdatedAt: new Date().toISOString() });
      },
      setSoilKitReading: (reading) => { requireWritable(); set({ soilKitReading: reading === null ? null : SoilKitReadingSchema.parse(reading), soilSkipped: reading === null ? get().soilSkipped : false, planningUpdatedAt: new Date().toISOString() }); },
      setSoilSkipped: (skipped) => { requireWritable(); set({ soilSkipped: z.boolean().parse(skipped), planningUpdatedAt: new Date().toISOString() }); },
      setSetupCompletedAt: (dateIso) => {
        requireWritable();
        const parsed = z.string().date().nullable().parse(dateIso);
        set({ setupCompletedAt: parsed });
      },
      addCheckIn: (input) => {
        requireWritable();
        const checkIn = CheckInSchema.parse(input);
        const cropAllocations = checkIn.plotId && checkIn.stage
          ? get().cropAllocations.map((plot) => plot.plotId === checkIn.plotId
            ? { ...plot, lifecycleStage: checkIn.stage!, growthStage: lifecycleToGrowthStage(checkIn.stage!) }
            : plot)
          : get().cropAllocations;
        set({ checkIns: [checkIn, ...get().checkIns].slice(0, 104), cropAllocations,
          planningUpdatedAt: new Date().toISOString() });
      },
      replacePersistedState: (input) => {
        requireWritable();
        const next = PersistedFarmSchema.parse(input);
        const previous = active;
        const previousSoil = activeSoil;
        active = null;
        activeSoil = null;
        generation++;
        set({ ...next, weatherStatus: statusFor(next.weatherSnapshot), weatherCached: !!next.weatherSnapshot,
          weatherStale: !!next.weatherSnapshot && isWeatherStale(next.weatherSnapshot, Date.now()),
          soilStatus: next.soilSnapshot
            ? { provider: "soil", state: "success", provenance: "modelled", requestId: null, updatedAt: next.soilSnapshot.fetchedAt, error: null }
            : idleSoil() });
        previous?.controller.abort();
        previousSoil?.controller.abort();
      },
      setLocale: (locale) => { requireReady(); set({ locale: LocaleSchema.parse(locale) }); },
      setLandUnit: (unit) => {
        requireReady();
        const landUnit = LandUnitSchema.parse(unit);
        if (realFarmBackup && (get().sampleOverlayActive || get().sampleDataActive)) {
          realFarmBackup = { ...realFarmBackup, landUnit };
        }
        set({ landUnit });
      },
      resetDerivedForFieldChange: () => invalidate(),
      setSampleData: async (enabled) => {
        requireReady();
        const current = get();
        if (current.sampleOverlayActive === enabled) return;
        const previous = active;
        const previousSoil = activeSoil;
        active = null;
        activeSoil = null;
        generation++;
        let next: PersistedFarm;
        if (enabled) {
          realFarmBackup = current.sampleDataActive ? createEmptyFixture() : persistedSlice(current);
          writesEnabled = false;
          sampleTransition = true;
          set({ sampleOverlayActive: true });
          await disk.flush();
          if (!get().sampleOverlayActive) return;
          next = createSampleFixture();
          sampleTransition = false;
          set({ ...next, sampleOverlayActive: true, soilStatus: idleSoil(), weatherStatus: statusFor(next.weatherSnapshot), weatherCached: false,
            weatherStale: !!next.weatherSnapshot && isWeatherStale(next.weatherSnapshot, Date.now()) });
        } else {
          sampleTransition = true;
          next = realFarmBackup ?? (current.sampleDataActive ? createEmptyFixture() : persistedSlice(current));
          next = { ...next, sampleDataActive: false };
          realFarmBackup = null;
          writesEnabled = true;
          set({ ...next, sampleOverlayActive: false, soilStatus: next.soilSnapshot
              ? { provider: "soil", state: "success", provenance: "modelled", requestId: null, updatedAt: next.soilSnapshot.fetchedAt, error: null }
              : idleSoil(),
            weatherStatus: statusFor(next.weatherSnapshot), weatherCached: !!next.weatherSnapshot,
            weatherStale: !!next.weatherSnapshot && isWeatherStale(next.weatherSnapshot, Date.now()) });
          sampleTransition = false;
        }
        previous?.controller.abort();
        previousSoil?.controller.abort();
      },
      beginWeatherRequest: () => {
        requireReady();
        if (!get().fieldGeometry || get().sampleDataActive) {
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
        if (!get().fieldGeometry || get().sampleDataActive) throw new Error("Select a real field before requesting soil data.");
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
      return { ...current, ...data, weatherStatus: statusFor(data.weatherSnapshot), weatherCached: !!data.weatherSnapshot,
        soilStatus: data.soilSnapshot ? { ...idleSoil(), state: "success", provenance: "modelled", updatedAt: data.soilSnapshot.fetchedAt } : idleSoil(),
        weatherStale: !!data.weatherSnapshot && isWeatherStale(data.weatherSnapshot, Date.now()) };
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
