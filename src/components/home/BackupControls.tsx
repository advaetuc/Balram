"use client";

import { useRef, useState } from "react";
import { t } from "@/config/i18n";
import { importFarmBackup, serializeFarmBackup } from "@/lib/storage/backup";
import { formatNumber, indiaDate } from "@/lib/ui/format";
import { persistedSlice, useBalramStore } from "@/store/useBalramStore";

type ImportResult = ReturnType<typeof importFarmBackup>;
type BackupNotice = "backupExported" | "backupExportFailed" | "backupImportFailed" | "backupFileTooLarge" | ImportResult;

export function BackupControls() {
  const state = useBalramStore((value) => value);
  const copy = t(state.locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<BackupNotice | null>(null);
  const [importing, setImporting] = useState(false);
  const disabled = !state.hydrated || state.sampleDataActive || state.sampleOverlayActive;

  function exportBackup() {
    try {
      const persisted = persistedSlice(state);
      const json = serializeFarmBackup(persisted, new Date().toISOString());
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `balram-farm-backup-${indiaDate(state.now) ?? "2026-11-16"}.json`;
        anchor.click();
        setNotice("backupExported");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setNotice("backupExportFailed");
    }
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || disabled || importing) return;
    if (file.size > 2_000_000) {
      setNotice("backupFileTooLarge");
      return;
    }

    setImporting(true);
    setNotice(null);
    try {
      setNotice(importFarmBackup(await file.text(), state));
    } catch {
      setNotice("backupImportFailed");
    } finally {
      setImporting(false);
    }
  }

  let message = "";
  let names = "";
  if (typeof notice === "string") {
    message = copy[notice];
  } else if (notice) {
    const { addedCount, skippedCount, addedNames } = notice;
    const template = addedCount === 0
      ? skippedCount > 0 ? copy.backupImportAtCap : copy.backupImportEmpty
      : skippedCount > 0 ? copy.backupImportPartial
        : addedCount === 1 ? copy.backupImportOne : copy.backupImportMany;
    message = template.replace("{0}", formatNumber(addedCount || skippedCount, 0, state.locale))
      .replace("{1}", formatNumber(skippedCount, 0, state.locale));
    names = new Intl.ListFormat(state.locale).format(addedNames);
  }

  return <section className="bento-card space-y-3" aria-labelledby="backup-title">
    <h2 id="backup-title" className="text-xl font-bold">{copy.backupTitle}</h2>
    <p className="notice">{copy.backupCoordinateWarning}</p>
    <p className="text-sm text-muted-foreground">{copy.backupImportHint}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="button-secondary min-h-12" disabled={disabled || importing}
        onClick={exportBackup}>{copy.backupExport}</button>
      <button type="button" className="button-secondary min-h-12" disabled={disabled || importing}
        onClick={() => inputRef.current?.click()}>{copy.backupImport}</button>
      <input ref={inputRef} hidden type="file" accept="application/json,.json" aria-label={copy.backupImport}
        onChange={(event) => { void importBackup(event); }} />
    </div>
    <div role="status" aria-atomic="true" className={message ? "text-sm [overflow-wrap:anywhere]" : "sr-only"}>
      {message}{names && <p className="font-semibold" dir="auto">{names}</p>}
    </div>
  </section>;
}
