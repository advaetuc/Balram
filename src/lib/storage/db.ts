import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StateStorage } from "zustand/middleware";

export const DATABASE_NAME = "balram";
export const DATABASE_VERSION = 1;
const OBJECT_STORE = "state";

interface BalramDatabase extends DBSchema {
  state: { key: string; value: string };
}

let database: Promise<IDBPDatabase<BalramDatabase>> | undefined;

/** Lazy opening prevents IndexedDB access during server rendering. */
export function getDatabase(): Promise<IDBPDatabase<BalramDatabase>> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("Browser storage is unavailable."));
  }
  if (!database) {
    database = new Promise<IDBPDatabase<BalramDatabase>>((resolve, reject) => {
      let abandoned = false;
      const fail = () => {
        abandoned = true;
        reject(new Error("Browser storage could not be opened. Close older Balram tabs and reload."));
      };
      const timer = window.setTimeout(fail, 4000);
      const opening = openDB<BalramDatabase>(DATABASE_NAME, DATABASE_VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) db.createObjectStore(OBJECT_STORE);
        },
        blocked: fail,
        blocking() {
          void opening.then((db) => db.close());
          database = undefined;
        },
        terminated() { database = undefined; },
      });
      void opening.then((db) => {
        window.clearTimeout(timer);
        if (abandoned) db.close();
        else resolve(db);
      }, (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      });
    }).catch((error: unknown) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

export interface StorageStatus {
  mode: "initializing" | "persistent" | "memory";
  message: string | null;
  pendingWrites: number;
}

/** Ordered writes and a session-local fallback; errors never discard in-memory edits. */
export function createIndexedDBStorage() {
  const memory = new Map<string, string>();
  const listeners = new Set<() => void>();
  let status: StorageStatus = { mode: "initializing", message: null, pendingWrites: 0 };
  let queue: Promise<unknown> = Promise.resolve();

  const publish = (next: StorageStatus) => {
    if (next.mode === status.mode && next.message === status.message && next.pendingWrites === status.pendingWrites) return;
    status = next;
    listeners.forEach((listener) => listener());
  };
  const useMemoryOnly = (message = "Changes are kept in this tab only. Browser storage is unavailable.") => {
    publish({ ...status, mode: "memory", message });
  };
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  const storage: StateStorage = {
    getItem: (name) => serialize(async () => {
      if (typeof window === "undefined") return null;
      if (status.mode === "memory") return memory.get(name) ?? null;
      try {
        const db = await getDatabase();
        const value = await db.get(OBJECT_STORE, name);
        if (value !== undefined) memory.set(name, value);
        publish({ ...status, mode: "persistent", message: null });
        return value ?? null;
      } catch {
        useMemoryOnly();
        return memory.get(name) ?? null;
      }
    }),
    setItem: (name, value) => {
      if (typeof window === "undefined" || memory.get(name) === value) return Promise.resolve();
      memory.set(name, value);
      if (status.mode === "memory") return Promise.resolve();
      // Publish after updating the cache: status-only store updates must not enqueue another write.
      publish({ ...status, pendingWrites: status.pendingWrites + 1 });
      return serialize(async () => {
        try {
          if (status.mode !== "memory") {
            const db = await getDatabase();
            await db.put(OBJECT_STORE, value, name);
            publish({ ...status, mode: "persistent", message: null });
          }
        } catch { useMemoryOnly(); }
        finally { publish({ ...status, pendingWrites: status.pendingWrites - 1 }); }
      });
    },
    removeItem: (name) => serialize(async () => {
      if (typeof window === "undefined") return;
      memory.delete(name);
      if (status.mode === "memory") return;
      try {
        const db = await getDatabase();
        await db.delete(OBJECT_STORE, name);
      } catch { useMemoryOnly(); }
    }),
  };

  return {
    storage,
    useMemoryOnly,
    getStatus: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    flush: async () => { await queue; },
  };
}
