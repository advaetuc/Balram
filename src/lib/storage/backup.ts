import { z } from "zod";
import { PersistedFarmSchema, type PersistedFarm } from "@/types/domain";
import { migratePersistedFarm, PERSISTENCE_VERSION } from "@/store/useBalramStore";

export const BACKUP_FORMAT = "balram-farm-backup" as const;
export interface BalramBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  farm: PersistedFarm;
}

export function serializeFarmBackup(farm: PersistedFarm, exportedAtIso: string): string {
  let validated: PersistedFarm;
  try {
    validated = PersistedFarmSchema.parse(farm);
    z.string().datetime({ offset: true }).parse(exportedAtIso);
  } catch {
    throw new Error("Farm data or export timestamp is invalid; no backup was created.");
  }
  if (validated.sampleDataActive) throw new Error("Exit Sample Farm before exporting a real farm backup.");
  const envelope: BalramBackupEnvelope = {
    format: BACKUP_FORMAT,
    version: PERSISTENCE_VERSION,
    exportedAt: exportedAtIso,
    farm: { ...validated, sampleDataActive: false },
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseFarmBackup(rawJson: string): PersistedFarm {
  if (typeof rawJson !== "string" || new TextEncoder().encode(rawJson).byteLength > 2_000_000) {
    throw new Error("This backup file is larger than the supported 2 MB limit.");
  }
  let payload: unknown;
  try { payload = JSON.parse(rawJson); }
  catch { throw new Error("The selected file is not valid JSON. Your farm data was not changed."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("This file is not a Balram farm backup. Your farm data was not changed.");
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.format !== BACKUP_FORMAT) throw new Error("This file is not a Balram farm backup. Your farm data was not changed.");
  if (typeof envelope.version !== "number" || !Number.isSafeInteger(envelope.version) || envelope.version < 0) {
    throw new Error("The backup version is invalid. Your farm data was not changed.");
  }
  if (envelope.version > PERSISTENCE_VERSION) throw new Error("This backup is from a newer Balram version. Update Balram before restoring it.");
  if (typeof envelope.exportedAt !== "string" || !z.string().datetime({ offset: true }).safeParse(envelope.exportedAt).success) {
    throw new Error("The backup timestamp is invalid. Your farm data was not changed.");
  }
  let farm: PersistedFarm;
  try { farm = migratePersistedFarm(envelope.farm, envelope.version); }
  catch { throw new Error("The backup farm data is invalid or incomplete. Your current farm was not changed."); }
  if (farm.sampleDataActive) throw new Error("Sample Farm data cannot be restored as a real farm.");
  return farm;
}
