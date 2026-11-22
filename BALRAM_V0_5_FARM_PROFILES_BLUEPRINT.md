# Balram v0.5.0 — Local Multi-Farm Profiles Blueprint (Source-Validated)

**Status:** Validated against Balram `v0.4.1` (`frontend` branch, `PERSISTENCE_VERSION = 5`)  
**Target Release:** `v0.5.0` (`PERSISTENCE_VERSION = 6`)  
**Dependencies Added:** `0` (Zero new npm packages)  
**Routes Added:** `0` (Single-route `"/"` static shell preserved for CSP + Service Worker)

---

## 1. Product Goal & Design Principles

Allow smallholder farmers, agronomists, and demo reviewers to keep **up to 6 independent farms** on one device—completely offline, zero accounts, zero cloud—while keeping the experience warm, artistic (**Daylight Field Notebook**), and effortless (≤ 3 taps to switch, create, rename, or delete a farm).

### Core Guardrails (All 8 `AGENTS.md` Invariants Preserved)
1. **Local-only & Atomic:** All profiles, active selection, and per-farm stashed slices live inside the single Zustand persisted record (`balram:farm`, `PERSISTENCE_VERSION = 6`). Every create, switch, rename, or delete commits in **one** IndexedDB `db.put` transaction (and works identically in memory-fallback mode).
2. **Global vs. Per-Farm State:**
   - **Global (shared across all farms):** `locale` (`"en" | "mr"`), `landUnit` (`"acres" | "gunthas"`), `profiles`, `activeProfileId`, `farmStash`.
   - **Per-Farm (swapped on switch):** `farmProfile`, `fieldGeometry`, `cropAllocations`, `irrigationSetup`, `weatherSnapshot`, `soilSnapshot`, `planningUpdatedAt`, `soilKitReading`, `soilSkipped`, `setupCompletedAt`, `checkIns`.
3. **Name Rules:** Required, trimmed, `1..30` Unicode graphemes (`Intl.Segmenter` / `Array.from`), unique across existing profiles (case-insensitive, NFKC-normalized). Synchronized to `farmProfile.name` so `FarmReport`, `ShareSummaryButton`, and `FarmCard` PNGs display the active farm name automatically.
4. **Non-HTTPS Safe IDs:** Profile IDs use `createFieldId().replace(/^field-/, "profile-")` from `src/lib/domain/geometry.ts` (never raw `crypto.randomUUID()`, which fails on HTTP LAN mobile browsers).
5. **Read-Only Sample Overlay + Editable Sample Copy:**
   - Existing read-only *Explore Sample Farm* (`sampleDataActive: true`, `writesEnabled: false`) remains intact for zero-commitment browsing.
   - Users can also create an **editable copy** of the Pune sample farm (`origin: "sample_copy"`) from *My Farms* or the Sample banner, converting sample weather provenance safely (clearing `weatherSnapshot` so `PersistedFarmSchema` never stores `provenance: "sample"` on a real farm, while keeping field area, plots, soil kit reading, and irrigation setup).
6. **Non-Destructive Delete with 7s Pausable Undo:** Deleting a farm removes it immediately and shows a `ToastHost` `variant: "undo"` toast (`7000ms`, hover/focus-pausable). Clicking Undo restores the exact stashed farm and metadata; deleting the active farm switches cleanly to the next most-recently-updated farm (or opens *My Farms* / *Name your farm* if 0 remain).
7. **Additive Backup Import:** Exporting a `v6` backup writes all profiles + stashed farms inside the single `PersistedFarm` envelope. Importing a `v5` or `v6` backup **adds** farms up to the 6-farm cap (remapping colliding IDs, deduplicating names with ` (2)` / ` (3)`, tagging `origin: "imported"`, and reporting any skipped farms when the cap is reached) instead of overwriting existing farms.
8. **Artistic Daylight Field Notebook Visual Craft:**
   - Every farm card in *My Farms* acts like a miniature stitched field-notebook tab: forest-green active spine, mini 8px crop-proportion ribbon (`barSegments.ts`), area badge in the user's `landUnit`, plot count, last-updated relative/formatted date, and origin badge (`Sample copy` / `Imported` when applicable).
   - Pure-CSS motion only (`src/styles/motion.css`, `--dur-*` / `--ease-*` tokens, zero literal `ms`/`s`/`cubic-bezier(`), native `<dialog>` switcher sheet with `@starting-style`, and `48×48px` minimum hit targets everywhere.

---

## 2. Schema `v6` & Data Model (`src/types/domain.ts`)

### New Schemas
```ts
export const MAX_FARM_PROFILES = 6;
export const MAX_PROFILE_NAME_LENGTH = 30;

export const ProfileOriginSchema = z.enum(["blank", "sample_copy", "imported"]);
export type ProfileOrigin = z.infer<typeof ProfileOriginSchema>;

export const ProfileMetaSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(100), // grapheme length <= 30 enforced by profiles.ts
  createdAt: timestamp,
  updatedAt: timestamp,
  origin: ProfileOriginSchema.default("blank"),
});
export type ProfileMeta = z.infer<typeof ProfileMetaSchema>;

/** Per-farm snapshot stored inside `farmStash[profileId]`. */
export const StashedFarmSchema = z.object({
  farmProfile: FarmProfileSchema.nullable(),
  fieldGeometry: FieldGeometrySchema.nullable(),
  cropAllocations: CropAllocationsSchema,
  irrigationSetup: IrrigationSetupSchema.nullable(),
  weatherSnapshot: WeatherSnapshotSchema.nullable(),
  soilSnapshot: SoilSnapshotSchema.nullable().default(null),
  planningUpdatedAt: timestamp.nullable().default(null),
  soilKitReading: SoilKitReadingSchema.nullable().default(null),
  soilSkipped: z.boolean().default(false),
  setupCompletedAt: z.string().date().nullable().default(null),
  checkIns: z.array(CheckInSchema).max(104).default([]),
});
export type StashedFarm = z.infer<typeof StashedFarmSchema>;
```

### Additions to `PersistedFarmSchema` (`PERSISTENCE_VERSION = 6`)
```ts
profiles: z.array(ProfileMetaSchema).max(MAX_FARM_PROFILES).default([]),
activeProfileId: id.nullable().default(null),
farmStash: z.record(id, StashedFarmSchema).default({}),
```
**Cross-field invariants in `PersistedFarmSchema.superRefine`:**
- Profile IDs in `profiles` must be unique.
- If `activeProfileId !== null` and `!sampleDataActive`, `activeProfileId` must exist in `profiles`.
- `farmStash` keys must be a subset of `profiles` IDs (no orphaned stashes after validation/migration).
- Existing field/weather/soil/sample consistency checks remain unchanged.

---

## 3. Migration Rules (`v0..v5` → `v6`)

`migratePersistedFarm(saved, version)` stays **100% pure** (no browser globals, deterministic for unit tests and backup parsing):
1. Run existing `v0..v4` → `v5` normalizations unchanged.
2. When `version < 6`:
   - Inspect whether the `v5` payload contains real user data:
     `hasData = Boolean(fieldGeometry || cropAllocations.length > 0 || soilKitReading || checkIns.length > 0 || setupCompletedAt || farmProfile?.name)`.
   - **If `hasData`:**
     - Create Profile #1:
       - `id`: `farmProfile?.id` (if valid and not `"sample-farm"`) else `"profile-migrated-1"`
       - `name`: sanitized `farmProfile?.name` (truncated to 30 graphemes if longer) else `(locale === "mr" ? "माझे शेत" : "My Farm")`
       - `createdAt` / `updatedAt`: `planningUpdatedAt ?? farmProfile?.updatedAt ?? "2026-01-01T00:00:00+05:30"`
       - `origin`: `"blank"`
     - Sync `farmProfile` with `{ id, name, district: farmProfile?.district ?? null, locale, timezone: "Asia/Kolkata", updatedAt }`.
     - Set `profiles: [meta]`, `activeProfileId: id`, `farmStash: {}`.
   - **If empty (`!hasData`):**
     - Set `profiles: []`, `activeProfileId: null`, `farmStash: {}` so first-time users land on *Name your farm*.
3. **Rollback Safety in `useBalramStore.ts`:** Before persisting the first `v6` payload over a `v5` IndexedDB record, save a one-time read-only safety copy to `"balram:legacy-v5"` (best-effort, ignored in memory mode) and delete `"balram:legacy-v5"` on the next clean `v6` boot.

---

## 4. Pure Domain Engine (`src/lib/domain/profiles.ts`)

Zero React, zero Zustand, zero `Date.now()` (accept `nowIso: string` and `idFactory: () => string` as parameters for deterministic testing):

| Function | Responsibility |
| :--- | :--- |
| `extractFarmSlice(farm)` / `applyFarmSlice(farm, slice)` | Extract or inject the 11 per-farm fields without touching `locale`, `landUnit`, `profiles`, `activeProfileId`, or `farmStash`. |
| `normalizeProfileName(raw)` | Trim, collapse internal whitespace, NFKC normalize. |
| `validateProfileName(raw, profiles, excludeId?)` | Returns `{ ok: true, name }` or `{ ok: false, reason: "empty" \| "too_long" \| "duplicate" }` using `Intl.Segmenter` grapheme count ≤ 30. |
| `makeUniqueProfileName(base, profiles)` | Generates a unique ≤ 30-grapheme name by appending ` (2)`, ` (3)`, etc. (used for Sample Copy & Backup Import). |
| `createProfile(state, { name, origin, initialSlice?, nowIso, id })` | Enforces `profiles.length < 6`, stashes current active farm (if any), adds new `ProfileMeta`, sets `activeProfileId`, syncs `farmProfile.name`, resets per-farm fields to `initialSlice ?? emptySlice`. |
| `switchProfile(state, targetId, nowIso)` | No-op if `targetId === activeProfileId`; otherwise stashes current active farm into `farmStash[activeProfileId]`, loads `farmStash[targetId]`, deletes `targetId` from `farmStash`, updates `activeProfileId`, syncs `farmProfile.name`. |
| `renameProfile(state, targetId, nextName, nowIso)` | Validates unique name, updates `profiles` entry + `updatedAt`, updates `farmProfile.name` (in active state or in `farmStash[targetId]`). |
| `deleteProfile(state, targetId, nowIso)` | Removes profile and returns `{ nextState, undoSnapshot: { meta, slice, wasActive } }`. If deleted profile was active, switches to the most recently updated remaining profile (or sets `activeProfileId: null` + empty slice if none remain). |
| `restoreDeletedProfile(state, undoSnapshot, nowIso)` | Re-inserts `undoSnapshot` (guarding cap & name collision) and restores active status if `wasActive`. |
| `createEditableSampleSlice(locale, nowIso, id)` | Clones `createSampleFixture()` into a real `StashedFarm` with `weatherSnapshot: null` (so `sampleDataActive: false` passes `PersistedFarmSchema`), fresh `fieldId`, and localized farm name. |
| `mergeImportedProfiles(current, imported, nowIso, idFactory)` | Extracts all farms from an imported `v5`/`v6` `PersistedFarm`, adds up to `6 - current.profiles.length` farms with fresh IDs, unique names, and `origin: "imported"`, returning `{ nextState, addedCount, skippedCount, addedNames }`. |
| `summarizeProfile(meta, slice)` | Pure view-model helper returning `{ id, name, origin, updatedAt, areaGunthas, plotCount, setupComplete, segments }` (using `barSegments.ts`) for rendering rich *My Farms* cards. |

---

## 5. Store Actions & Transient Reset (`src/store/useBalramStore.ts`)

Add `resetTransient()` helper (called on every profile switch, create, delete, or sample toggle):
- Increments `generation` and aborts active `weatherController` / `soilController`.
- Resets `weatherStatus` and `soilStatus` to `idle`, clears `hydrationError`.

New Store Actions:
- `createFarmProfile(name: string, options?: { fromSample?: boolean })`
- `switchFarmProfile(profileId: string)`
- `renameFarmProfile(profileId: string, name: string)`
- `deleteFarmProfile(profileId: string)` → returns `DeletedProfileSnapshot | null` for Undo toast
- `restoreFarmProfile(snapshot: DeletedProfileSnapshot)`
- `importFarmProfiles(imported: PersistedFarm)` → returns `{ addedCount, skippedCount, addedNames }`

**Sample Mode Interaction:**
- While `sampleDataActive === true`, `createFarmProfile`, `switchFarmProfile`, `renameFarmProfile`, and `deleteFarmProfile` automatically exit Sample Mode first (restoring `realFarmBackup` and re-enabling writes) or, for "Save editable copy", exit Sample Mode and immediately invoke `createFarmProfile(uniqueName, { fromSample: true })`.

---

## 6. UI Architecture & Artistic Visual Polish (Single Route `"/"`)

`AppShell.tsx` extends `View` to:
```ts
type View = "landing" | "name-farm" | "farms" | "journey" | "daily";
```
1. **First-Run Flow (*Name your farm* — `src/components/profiles/NameFarmView.tsx`):**
   - Shown when `profiles.length === 0` and user clicks *Start Setup* (or *Add farm* from *My Farms*).
   - Warm Daylight Field Notebook card with botanical sprout crest, large `48px+` input (`maxLength` soft + live grapheme counter `0 / 30`), instant inline validation, quick-tap suggestion chips (e.g., *Home Field*, *Well Plot*, *River Farm* / *घरचे शेत*, *विहिरीचे शेत*, *नदीकाठचे शेत*), primary CTA (*Continue to setup*), and secondary option (*Start with an editable copy of Pune sample*).
2. **Farm Gallery (*My Farms* — `src/components/profiles/MyFarmsView.tsx`):**
   - Accessible from the Landing screen, Header switcher sheet (*Manage all farms*), and Daily Home.
   - Displays a responsive grid (`1 col` mobile, `2 cols` desktop) of tactile **Field Notebook Farm Cards**:
     - Left accent spine (`bg-forest` for active farm, `bg-border-strong` for others).
     - Farm name, active pill, origin badge (`Sample copy` / `Imported`), total area in `landUnit`, plot count, and an **8px live crop-proportion mini LandBar** powered by `barSegments.ts` (zero extra layout math).
     - Quick action row (`48px` buttons): *Open*, *Rename* (inline or native `<dialog>`), *Delete* (triggers immediate delete + 7s pausable Undo toast via `ToastHost`).
   - Top summary bar shows `X / 6 farms` with a subtle progress meter + *New Farm* button (disabled with friendly `capReached` notice at 6/6) + *Editable Sample Copy* button.
3. **Header Farm Switcher Chip & Native `<dialog>` Sheet (`src/components/profiles/FarmSwitcher.tsx`):**
   - Compact pill in `Header.tsx` showing the active farm name (truncated cleanly on 360px mobile with `max-w-[140px] sm:max-w-[200px]`), a small sprout/layers icon, and chevron.
   - Opens a native `<dialog>` sheet (styled with `@starting-style` in `motion.css`) listing all saved farms with 1-tap switching, *+ New farm* (if `< 6`), and *Manage farms*.
   - Hidden cleanly when `profiles.length === 0` and `!sampleDataActive`.
4. **Marathi (`mr`) Copy Fix:**
   - All new strings live under `profiles` in `src/config/i18n.ts` with 100% `en`/`mr` key parity and zero unapproved Latin text in `mr`.
   - Corrected `capReached` (Marathi): `"तुम्ही जास्तीत जास्त 6 शेते ठेवू शकता."` (replacing the draft's `"तुम्ही काहीही सहा शेते ठेवू शकता"`).

---

## 7. Phased Execution Plan (1 Prompt Per Phase)

| Phase | Scope | Key Files |
| :--- | :--- | :--- |
| **Phase 1 (P0–P2)** | Schema `v6`, pure `v0..v5 → v6` migration, pure `profiles.ts` engine + unit tests | `src/types/domain.ts`, `src/mocks/fixtures.ts`, `src/lib/domain/profiles.ts`, `src/store/useBalramStore.ts` (migration only), `tests/profiles-domain.test.ts` |
| **Phase 2 (P3)** | Store multi-farm actions, `resetTransient()`, legacy-v5 safety backup, additive backup import (`backup.ts`) + store/backup tests | `src/store/useBalramStore.ts`, `src/lib/storage/backup.ts`, `tests/profiles-store.test.ts` |
| **Phase 3 (P4)** | Bilingual `i18n.ts` copy, artistic Daylight Field Notebook UI (`NameFarmView`, `MyFarmsView`, `FarmSwitcher`), `motion.css` sheet tokens, `Header.tsx` & `AppShell.tsx` wiring | `src/config/i18n.ts`, `src/styles/motion.css`, `src/components/profiles/*`, `src/components/app-shell/{Header,AppShell}.tsx`, `tests/i18n.test.ts`, `tests/motion-tokens.test.ts` |
| **Phase 4 (P5)** | `BackupControls.tsx` additive import feedback, Sample banner *Save editable copy* CTA, `ToastHost` Undo wiring, `FarmReport`/`FarmCard`/`ShareSummary` farm-name verification + end-to-end profile UI tests | `src/components/home/BackupControls.tsx`, `src/components/app-shell/Header.tsx`, `src/components/ui/ToastHost.tsx`, `tests/profiles-ui.test.ts` |
| **Phase 5 (P6)** | `v0.5.0` release gate: `package.json` bump, `tests/release-v034-design.test.ts` version sync, `AGENTS.md`, `README.md`, `CONTEXT.md`, full 4-check gate & `public/sw.js` verification | `package.json`, `AGENTS.md`, `README.md`, `CONTEXT.md`, `public/sw.js` |
