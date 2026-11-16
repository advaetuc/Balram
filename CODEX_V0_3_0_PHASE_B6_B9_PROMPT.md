# Balram v0.3.0 — Codex Implementation Prompt (Phase B6–B9: Check-Ins, Backup/Restore, Share, Report Sync & Release Gate)

Copy and paste the prompt below into **Codex** to complete the final phases (**B6 through B9**) of **Balram `v0.3.0`**.

```markdown
You are the Lead Systems Engineer completing **Release B — Phases B6, B7, B8, and B9** of **Balram (`v0.3.0`)**. Read `AGENTS.md` and `BALRAM_V0_3_BLUEPRINT.md` in the repository root, and inspect:
- `src/store/useBalramStore.ts`
- `src/components/app-shell/AppShell.tsx`
- `src/components/home/DailyHome.tsx`
- `src/components/report/FarmReport.tsx`
- `src/components/ui/ProvenanceBadge.tsx`
- `src/lib/domain/roadmap.ts`
- `src/config/i18n.ts`
- `package.json` & `README.md`

---

## PHASE B6: 30-Second Plot Check-Ins & Check-In Due Banner

### 1. Create `src/lib/domain/checkIns.ts` (Pure Check-In Due Logic)
- Export `isCheckInDue(checkIns: readonly CheckIn[], nowIso: string | null, cadenceDays?: 7 | 30): boolean`:
  - **Invariant 1 Safe**: If `nowIso === null` (SSR) or `checkIns` check cannot parse dates, return `false` so no banner flashes during SSR.
  - Otherwise, if `checkIns.length === 0`, return `true` (when the farm has at least one plot); if the most recent `checkIns[0].date` is `>= cadenceDays` (default `7` days) older than `nowIso.slice(0, 10)`, return `true`.

### 2. Create `src/components/home/CheckInCard.tsx`
- **Check-In Due Banner**:
  - Displayed at the top of `DailyHome` (`Today / आज` tab) when `!state.sampleDataActive && state.cropAllocations.length > 0 && isCheckInDue(state.checkIns, nowIso, cadenceDays)`.
  - Includes a toggle between `7-day (Weekly)` and `30-day (Monthly)` check-in reminder cadence (local state or simple preference) and a **"Start 30-sec check-in / ३० सेकंद तपासणी"** button (`min-h-12`).
- **3-Tap Check-In Flow** (replaces the disabled `"Quick check-in · Coming soon"` button in `DailyHome.tsx`):
  1. **Select Plot & Confirm/Update Lifecycle Stage**: Choose plot (if >1 plot) and tap one of the 4 lifecycle stage pills (*Planned*, *Vegetative*, *Flowering/Fruiting*, *Harvesting*).
  2. **Pick Recent Field Event**: 6 large `min-h-12` pill buttons (`none`, `heavy_rain`, `hail`, `heat_wave`, `cold_night`, `water_shortage`) in English & Marathi.
  3. **Optional Short Note (`maxLength={280}`)** + **Save Check-In** button.
- Submitting calls `state.addCheckIn({ id: createFieldId().replace(/^field-/, "checkin-"), date: indiaDate(state.now) ?? "2026-11-16", plotId, stage, event, note })`, which updates `checkIns` AND updates the plot's `lifecycleStage` + `growthStage` together via `lifecycleToGrowthStage`.
- Render recent check-ins with `<ProvenanceBadge provenance="you_entered" locale={state.locale} />`. Check-ins are farmer-confirmed records and never overwrite `weatherSnapshot`.

---

## PHASE B7: Backup/Restore, `navigator.storage.persist()`, & Coordinate-Free Web Share

### 3. Create `src/lib/storage/backup.ts`
- Export `BACKUP_FORMAT = "balram-farm-backup"` and `export interface BalramBackupEnvelope { format: typeof BACKUP_FORMAT; version: number; exportedAt: string; farm: PersistedFarm }`.
- Export `serializeFarmBackup(farm: PersistedFarm, exportedAtIso: string): string`:
  - Validates `PersistedFarmSchema.parse(farm)` (with `sampleDataActive: false` enforced so sample data is never exported as a real farm) and returns pretty-printed JSON.
- Export `parseFarmBackup(rawJson: string): PersistedFarm`:
  - Checks payload size (`<= 2_000_000` bytes), parses JSON safely, validates `format === BACKUP_FORMAT` and integer `version >= 0 && version <= PERSISTENCE_VERSION`, runs `migratePersistedFarm(envelope.farm, envelope.version)`, and returns the validated `PersistedFarm`.
  - Throws a clean, user-friendly `Error` on malformed JSON, wrong format, or unsupported future version so the caller never mutates store state on failure.

### 4. Create `src/lib/ui/shareSummary.ts`
- Export `buildShareSummary(state: PersistedFarm, roadmap: readonly RoadmapItem[], locale: Locale): string`:
  - Generates a clean, plain-language summary containing:
    - Farm name (or `"My Farm"` / `"माझे शेत"`) and total land in Acres & Gunthas (if known).
    - Plot list: Plot Name, Crop Name, Land Size (Acres & Gunthas), and Lifecycle Stage.
    - Soil Kit summary (if tested) or `"Soil not tested"`.
    - Top 3 Roadmap actions (`roadmap.slice(0, 3)`).
  - **Privacy Invariant 6 (Mandatory)**: Must **NEVER** include latitude, longitude, GeoJSON `center`, or `boundary` polygon coordinates anywhere in the shared text.

### 5. Wire Backup, `storage.persist()`, and Share into `AppShell.tsx` & `DailyHome.tsx`
- **Persistent Storage Request**: In `src/components/app-shell/AppShell.tsx` (inside a post-hydration `useEffect`), call `void navigator.storage?.persist?.()` once if available, without blocking render.
- **Backup & Restore UI (`DailyHome` -> `My Farm` tab)**:
  - **Export Backup (`.json`)**: Displays a clear warning in `en`/`mr` that the downloaded JSON file contains map coordinates, then triggers a Blob download (`balram-farm-backup-YYYY-MM-DD.json`).
  - **Import Backup (`.json`)**: `<input type="file" accept="application/json,.json" />` that reads the file, runs `parseFarmBackup()`, calls `state.replacePersistedState(farm)`, and shows a plain confirmation or error notice without altering existing data if invalid.
- **Share Summary UI (`DailyHome` -> `Report` tab & `FarmReport.tsx`)**:
  - Add a **Share Summary / सारांश शेअर करा** button (`min-h-12 print:hidden`) using `navigator.share({ title, text })` with `navigator.clipboard.writeText(text)` fallback and clear `"Copied to clipboard"` feedback.

---

## PHASE B8: Printable A4 Farm Report Sync (`src/components/report/FarmReport.tsx`)

Update `src/components/report/FarmReport.tsx` so the printable A4 report is 100% synchronized with `v0.3.0`:
1. **Roadmap Actions Section**:
   - Include the `generateRoadmap` items grouped by bucket (`This Week`, `Next Two Weeks`, `Later`) with text provenance labels (*Measured by kit*, *Forecast*, *Estimated*, *You entered*, *Assumed*).
2. **Recent Check-Ins Section**:
   - Display up to the 5 most recent `state.checkIns` (date, plot name, confirmed stage, event, note, and `"You entered"` provenance).
3. **Soil Skipped Notice**:
   - If `state.soilSkipped && !state.soilKitReading`, render a clear `"Soil not tested"` notice in the report.
4. **Print & Devanagari Integrity**:
   - Ensure all interactive buttons (Print, Share) carry `print:hidden` and sections use `break-inside-avoid` cleanly for A4 portrait output in both English and Marathi (`मराठी`).

---

## PHASE B9: Final Test Suite, Version Bump (`0.3.0`), README Sync & Release Gate

### 6. Add Tests in `tests/release-b-final.test.ts`
Write unit tests covering:
- `isCheckInDue` (`nowIso === null` returns `false`, empty check-ins with plots returns `true`, recent check-in `< 7` days returns `false`, stale check-in `>= 7` days returns `true`).
- `addCheckIn` via `createBalramStore()` / domain logic updates both `checkIns` and the matching plot's `lifecycleStage` + `growthStage` together.
- `serializeFarmBackup` / `parseFarmBackup` round-trips an identical `PersistedFarm` and rejects corrupted JSON, wrong `format`, or unsupported future `version` without throwing unhandled errors.
- `buildShareSummary` includes plot names, crops, and top 3 roadmap items, and strictly contains **zero** coordinate substrings (`18.52`, `73.85`, etc.).

### 7. Update `package.json` & `README.md`
- Bump `"version"` in `package.json` from `"0.2.1"` to `"0.3.0"`.
- Update `README.md` to document `v0.3.0` (Growing Path 6-station setup, read-only Sample Farm overlay, Soil Health Card `kg/ha` classifiers, Check-ins, JSON backup/restore, coordinate-free share, and `npm test`).

### 8. Final Verification Gate (Mandatory)
Run all four checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build` (verify `scripts/finalize-release.mjs` exits `0` and regenerates `public/sw.js`)
4. `git diff --check`
```
