"use client";
import { useRef, useState } from "react";
import { t } from "@/config/i18n";
import { serializeFarmBackup, parseFarmBackup } from "@/lib/storage/backup";
import { indiaDate } from "@/lib/ui/format";
import { useBalramStore } from "@/store/useBalramStore";
import type { PersistedFarm } from "@/types/domain";

export function BackupControls() {
  const state = useBalramStore(s => s), copy = t(state.locale), inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const persisted: PersistedFarm = { farmProfile:state.farmProfile, fieldGeometry:state.fieldGeometry, cropAllocations:state.cropAllocations, irrigationSetup:state.irrigationSetup, weatherSnapshot:state.weatherSnapshot, soilSnapshot:state.soilSnapshot, sampleDataActive:state.sampleDataActive, planningUpdatedAt:state.planningUpdatedAt, soilKitReading:state.soilKitReading, locale:state.locale, landUnit:state.landUnit, soilSkipped:state.soilSkipped, setupCompletedAt:state.setupCompletedAt, checkIns:state.checkIns };
  function exportBackup() {
    try {
      const json = serializeFarmBackup(persisted, new Date().toISOString());
      const url = URL.createObjectURL(new Blob([json], { type:"application/json" }));
      const anchor = document.createElement("a"); anchor.href=url; anchor.download=`balram-farm-backup-${indiaDate(state.now)??"2026-11-16"}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage(copy.backupExported);
    } catch { setMessage(copy.backupFailure); }
  }
  async function importBackup(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setMessage(copy.backupFileTooLarge); if(inputRef.current)inputRef.current.value=""; return; }
    try { const next = parseFarmBackup(await file.text()); state.replacePersistedState(next); setMessage(copy.backupSuccess); }
    catch { setMessage(copy.backupFailure); }
    finally { if(inputRef.current)inputRef.current.value=""; }
  }
  return <section className="bento-card space-y-3" aria-labelledby="backup-title"><h2 id="backup-title" className="text-xl font-bold">{copy.backupTitle}</h2><p className="notice">{copy.backupCoordinateWarning}</p><div className="flex flex-wrap gap-3"><button type="button" className="button-secondary min-h-12" disabled={!state.hydrated||state.sampleDataActive||state.sampleOverlayActive} onClick={exportBackup}>{copy.backupExport}</button><button type="button" className="button-secondary min-h-12" disabled={!state.hydrated||state.sampleDataActive||state.sampleOverlayActive} onClick={()=>inputRef.current?.click()}>{copy.backupImport}</button><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" aria-label={copy.backupImport} onChange={e=>void importBackup(e.currentTarget.files?.[0])}/></div>{message&&<p role="status" className="text-sm">{message}</p>}</section>;
}
