"use client";

import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { createIndexedDBStorage, type StorageStatus } from "@/lib/storage/db";
import { createEmptyFixture, createSampleFixture } from "@/mocks/fixtures";
import {
  CropAllocationsSchema, FarmProfileSchema, FieldGeometrySchema,
  IrrigationSetupSchema, PersistedFarmSchema, WeatherSnapshotSchema,
  type CropAllocation, type DataSourceStatus, type FarmProfile,
  type FieldGeometry, type IrrigationSetup, type PersistedFarm, type WeatherSnapshot,
} from "@/types/domain";

export const PERSISTENCE_VERSION = 1;
export const STORAGE_KEY = "balram:farm";

export interface WeatherRequest {
  id: string;
  generation: number;
  fieldKey: string;
  signal: AbortSignal;
}

export interface BalramState extends PersistedFarm {
  hydrated: boolean;
  hydrationError: string | null;
  storageStatus: StorageStatus;
  connection: "unknown" | "online" | "offline";
  weatherStatus: DataSourceStatus;
  weatherCached: boolean;
  weatherStale: boolean;
  setFarmProfile(profile: FarmProfile): void;
  setFieldGeometry(geometry: FieldGeometry | null): void;
  setCropAllocations(allocations: CropAllocation[]): void;
  setIrrigationSetup(setup: IrrigationSetup | null): void;
  resetDerivedForFieldChange(): void;
  setSampleData(active: boolean): void;
  beginWeatherRequest(): WeatherRequest;
  commitWeatherRequest(request: WeatherRequest, snapshot: WeatherSnapshot): boolean;
  failWeatherRequest(request: WeatherRequest): boolean;
}

const idleWeather = (): DataSourceStatus => ({
  provider: "weather", state: "idle", provenance: "unavailable",
  requestId: null, updatedAt: null, error: null,
});

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
  };
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
    const invalidate = (patch: Partial<PersistedFarm> = {}) => {
      requireReady();
      const previous = active;
      active = null;
      generation++;
      set({ ...patch, weatherSnapshot: null, weatherStatus: idleWeather(), weatherCached: false, weatherStale: false });
      previous?.controller.abort();
    };
    const isCurrent = (request: WeatherRequest) => active?.request === request &&
      !request.signal.aborted && request.generation === generation &&
      request.fieldKey === JSON.stringify(get().fieldGeometry);

    return {
      ...createEmptyFixture(), hydrated: false, hydrationError: null,
      storageStatus: disk.getStatus(), connection: "unknown", weatherStatus: idleWeather(), weatherCached: false, weatherStale: false,
      setFarmProfile: (profile) => { requireReady(); set({ farmProfile: FarmProfileSchema.parse(profile) }); },
      setFieldGeometry: (geometry) => {
        requireReady();
        const next = geometry === null ? null : FieldGeometrySchema.parse(geometry);
        if (JSON.stringify(next) !== JSON.stringify(get().fieldGeometry)) invalidate({ fieldGeometry: next });
      },
      setCropAllocations: (allocations) => { requireReady(); set({ cropAllocations: CropAllocationsSchema.parse(allocations) }); },
      setIrrigationSetup: (setup) => {
        requireReady();
        set({ irrigationSetup: setup === null ? null : IrrigationSetupSchema.parse(setup) });
      },
      resetDerivedForFieldChange: () => invalidate(),
      setSampleData: (enabled) => {
        requireReady();
        const current = get();
        if (current.sampleDataActive === enabled) return;
        if (enabled && (current.farmProfile || current.fieldGeometry || current.cropAllocations.length || current.irrigationSetup)) {
          throw new Error("Sample mode is available only for an empty workspace.");
        }
        const next = enabled ? createSampleFixture() : createEmptyFixture();
        const previous = active;
        active = null;
        generation++;
        set({ ...next, weatherStatus: statusFor(next.weatherSnapshot), weatherCached: false,
          weatherStale: !!next.weatherSnapshot && isWeatherStale(next.weatherSnapshot, Date.now()) });
        previous?.controller.abort();
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
      commitWeatherRequest: (request, input) => {
        requireReady();
        if (!isCurrent(request)) return false;
        const snapshot = WeatherSnapshotSchema.parse(input);
        const validated = PersistedFarmSchema.parse({ ...persistedSlice(get()), weatherSnapshot: snapshot });
        active = null;
        set({ weatherSnapshot: validated.weatherSnapshot, weatherStatus: statusFor(snapshot), weatherCached: false,
          weatherStale: isWeatherStale(snapshot, Date.now()) });
        return true;
      },
      failWeatherRequest: (request) => {
        requireReady();
        if (!isCurrent(request)) return false;
        active = null;
        set({ weatherStatus: {
          ...get().weatherStatus, state: "error", requestId: null,
          error: "Weather is unavailable. Any saved values retain their original dates.",
        } });
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
    migrate: (saved, version) => {
      if (version !== 0 || !saved || typeof saved !== "object") throw new Error("Unsupported saved data version.");
      return PersistedFarmSchema.parse({ sampleDataActive: false, ...saved });
    },
    merge: (saved, current) => {
      if (saved === undefined) return current;
      const data = PersistedFarmSchema.parse(saved);
      return { ...current, ...data, weatherStatus: statusFor(data.weatherSnapshot), weatherCached: !!data.weatherSnapshot,
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
        if (connection !== state.connection || stale !== state.weatherStale || (stale && state.weatherStatus.state === "success")) {
          store.setState({ connection, weatherStale: stale, ...(stale && state.weatherStatus.state === "success"
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
