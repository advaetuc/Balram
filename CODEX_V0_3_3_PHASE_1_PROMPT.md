# Balram v0.3.3 — Codex Implementation Prompt (Phase 1: Docs Sync, `landUnits.ts` Engine & Schema `v5` Migration)

Copy and paste the prompt below into **Codex**. It reads `BALRAM_V0_3_3_BLUEPRINT.md` directly from your repository root.

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.2` -> `v0.3.3` — Phase 1)**. Read `BALRAM_V0_3_3_BLUEPRINT.md` and `AGENTS.md`, and inspect:
- `src/types/domain.ts`
- `src/store/useBalramStore.ts`
- `src/mocks/fixtures.ts`
- `src/lib/storage/backup.ts`
- `src/lib/domain/geometry.ts`
- `src/lib/domain/checkout.ts`

Your objective in **Phase 1 of `v0.3.3`** is to execute:
1. **Task 1**: Update `AGENTS.md` to `v0.3.3` (`PERSISTENCE_VERSION = 5`, Invariant 4 Land-Unit Display Addendum, and Invariant 8 Full Marathi Coverage).
2. **Task 2**: Create `src/lib/domain/landUnits.ts` with pure, deterministic land-unit conversion, formatting, Devanagari-aware input parsing, preset plot name localization, and Indian number grouping.
3. **Task 3**: Upgrade `PersistedFarmSchema` and `useBalramStore.ts` to `PERSISTENCE_VERSION = 5` with `landUnit: z.enum(["acres", "gunthas"]).default("acres")` and `setLandUnit(unit)`.
4. **Task 4**: Write unit tests in `tests/units.test.ts` and `tests/store-v5.test.ts`.

Do not modify React UI components in this phase.

---

## TASK 1: Update `AGENTS.md` for `v0.3.3` (`PERSISTENCE_VERSION = 5`)
1. Update the target version in `AGENTS.md` to `v0.3.3` and `PERSISTENCE_VERSION = 5` (migrating `v0–v4` blobs).
2. Under **Invariant 4**, document that canonical storage remains square metres (`fieldGeometry`) and gunthas (`cropAllocations`), while `state.landUnit` (`"acres" | "gunthas"`, default `"acres"`) controls display and input entry only without mutating stored gunthas or triggering `invalidate()`.
3. Add **Invariant 8 (Full Marathi Coverage)**: Every string visible to the farmer when `locale === "mr"` must render in Marathi (`मराठी`) with only approved technical symbols (`pH`, `ET₀`, `NPK`, `DAP`, `SSP`, `FYM`, `kg/ha`, `mm`, `L`, `°C`, `JSON`, `Balram`) permitted in Latin script.

---

## TASK 2: Create `src/lib/domain/landUnits.ts`
Reuse `GUNTHAS_PER_ACRE` (`40`), `SQUARE_METRES_PER_GUNTHA` (`101.17141056`), and `SQUARE_METRES_PER_ACRE` (`4046.8564224`) from `./geometry` (do not duplicate constants). Export:

1. **Types & Constants**:
   ```ts
   import { z } from "zod";
   import type { Locale } from "@/types/domain";
   import { GUNTHAS_PER_ACRE } from "./geometry";

   export const LandUnitSchema = z.enum(["acres", "gunthas"]);
   export type LandUnit = z.infer<typeof LandUnitSchema>;
   export const AREA_EPSILON_GUNTHAS = 0.01;
   export const MAX_AREA_GUNTHAS = 400_000; // 10,000 acres
   export const MR_NUMERALS: "latn" | "deva" = "latn";
   ```

2. **Conversion & Rounding Helpers**:
   - `gunthasToUnitValue(gunthas: number, unit: LandUnit): number`:
     - Treat `Math.abs(gunthas) < AREA_EPSILON_GUNTHAS` as `0`.
     - If `gunthas` is within `0.025` gunthas of a whole multiple of `40` (e.g., `39.98` gunthas from a drawn map boundary near 1 acre), snap to the nearest integer guntha (`Math.round(gunthas)`) before formatting so `39.98` displays as `1 Acre` in `"acres"` mode and `40 Gunthas` in `"gunthas"` mode!
     - In `"acres"` mode: half-up to 2 decimal places (`Math.round((snappedGunthas / GUNTHAS_PER_ACRE) * 100 + Number.EPSILON) / 100`, where `7` gunthas = `0.175` acres rounds half-up to `0.18`).
     - In `"gunthas"` mode: half-up to 1 decimal place (`Math.round(snappedGunthas * 10 + Number.EPSILON) / 10`).
   - `unitValueToGunthas(value: number, unit: LandUnit): number`:
     - Converts a numeric input in `unit` to gunthas, rounded to `0.01` guntha (`Math.round(rawGunthas * 100) / 100`).
     - For example, `0.33` in `"acres"` mode (`0.33 * 40 = 13.2`) returns `13.2`.

3. **Deterministic Formatting (`formatArea` & `formatIndianNumber`)**:
   - `formatIndianNumber(value: number, maxFractionDigits = 2): string`:
     - Pure string formatter (no `Intl`) that trims trailing fraction zeros (e.g., `1.20 -> "1.2"`, `2.00 -> "2"`) and applies Indian digit grouping (`1,00,000` for `100000`, `12,34,567` for `1234567`) using Latin digits (`0–9`).
   - `unitNoun(value: number, unit: LandUnit, locale: Locale): string`:
     - `locale === "en"`:
       - `unit === "acres"`: `value === 1 ? "Acre" : "Acres"`
       - `unit === "gunthas"`: `value === 1 ? "Guntha" : "Gunthas"`
     - `locale === "mr"`:
       - `unit === "acres"`: `"एकर"` (for all values)
       - `unit === "gunthas"`: `value === 1 ? "गुंठा" : "गुंठे"`
   - `formatArea(gunthas: number, unit: LandUnit, locale: Locale, options?: { includeSecondary?: boolean }): string`:
     - Formats the primary value as `"${formattedVal} ${unitNoun(val, unit, locale)}"`.
     - When `options?.includeSecondary` is `true`, appends `" (= ${secondaryFormatted})"` in the opposite unit (e.g., `50` gunthas in `"acres"` mode -> `"1.25 Acres (= 50 Gunthas)"` in English, or `"1.25 एकर (= 50 गुंठे)"` in Marathi).

4. **Devanagari & Comma-Safe Input Parser (`parseAreaInput`)**:
   - `parseAreaInput(rawInput: string, unit: LandUnit, locale: Locale = "en"): { ok: true; gunthas: number } | { ok: false; error: { en: string; mr: string } }`:
     - Normalizes Devanagari digits (`\u0966`–`\u096F`) to ASCII `0`–`9`.
     - Trims whitespace; if there is a single comma and no dot (e.g. `"1,25"`), replaces the comma with `"."`.
     - Rejects empty strings, non-numeric text, negative or zero values, and values exceeding `MAX_AREA_GUNTHAS` (`10,000 Acres` / `4,00,000 Gunthas`), returning a clear bilingual error `{ en, mr }`.
     - Returns `{ ok: true, gunthas: unitValueToGunthas(parsed, unit) }`.

5. **Preset Plot Name Localization (`displayPlotName`)**:
   - `displayPlotName(name: string | null | undefined, locale: Locale, fallbackIndex = 1): string`:
     - If `!name?.trim()`, returns `locale === "mr" ? "प्लॉट " + fallbackIndex : "Plot " + fallbackIndex`.
     - When `locale === "mr"`, maps the known preset names case-insensitively:
       - `"Well Plot"` -> `"विहिरीचा प्लॉट"`
       - `"Borewell Patch"` -> `"बोअरवेल प्लॉट"`
       - `"Canal Plot"` -> `"कालव्याचा प्लॉट"`
       - `"Roadside Field"` -> `"रस्त्यालगतचा प्लॉट"`
       - `"Plot N"` -> `"प्लॉट N"`
     - Returns any custom farmer-typed name unchanged.

---

## TASK 3: Upgrade Schema & Store to `PERSISTENCE_VERSION = 5`
1. **`src/types/domain.ts`**:
   - Import `LandUnitSchema` (or define `export const LandUnitSchema = z.enum(["acres", "gunthas"]); export type LandUnit = z.infer<typeof LandUnitSchema>;`) in `src/types/domain.ts`.
   - Add `landUnit: LandUnitSchema.default("acres")` to `PersistedFarmSchema`.
2. **`src/mocks/fixtures.ts`**:
   - Add `landUnit: "acres"` to `createEmptyFixture()` and `createSampleFixture()`.
3. **`src/store/useBalramStore.ts`**:
   - Bump `export const PERSISTENCE_VERSION = 5;`.
   - Include `landUnit: state.landUnit` in `persistedSlice(state)`.
   - Add `setLandUnit(unit: LandUnit): void` to `BalramState`:
     - Validates `LandUnitSchema.parse(unit)`.
     - Updates `landUnit` on the store (and if `sampleOverlayActive` / `realFarmBackup` is active in memory, also updates `realFarmBackup.landUnit = unit` just like `setLocale` so toggling units in Sample Mode works smoothly without mutating IndexedDB).
     - Does **NOT** call `invalidate()`, does **NOT** increment `generation`, and does **NOT** clear `weatherSnapshot` or `soilSnapshot`.
   - Update `migratePersistedFarm(saved, version)` to accept versions `[0, 1, 2, 3, 4]` and default `landUnit: "acres"` when missing.

---

## TASK 4: Add Unit Tests (`tests/units.test.ts` & `tests/store-v5.test.ts`)
1. **`tests/units.test.ts`**:
   - Verify `GUNTHAS_PER_ACRE * SQUARE_METRES_PER_GUNTHA === SQUARE_METRES_PER_ACRE` and `1089 * 0.09290304` consistency.
   - Verify all worked examples from Section 4.5 of `BALRAM_V0_3_3_BLUEPRINT.md`:
     - `50` gunthas -> `"1.25 Acres"`, `"1.25 Acres (= 50 Gunthas)"`, `"50 Gunthas"`, `"50 Gunthas (= 1.25 Acres)"`
     - `40` gunthas -> `"1 Acre"`, `"40 Gunthas"`
     - `7` gunthas -> `"0.18 Acres"`, `"7 Gunthas"`
     - `12.5` gunthas -> `"0.31 Acres"`, `"12.5 Gunthas"`
     - `1` guntha -> `"0.03 Acres"`, `"1 Guntha"`, and in Marathi `"1 गुंठा"` vs `"5 गुंठे"` vs `"2 एकर"`
     - `0` gunthas -> `"0 Acres"`, `"0 Gunthas"`
     - `39.98` gunthas -> `"1 Acre"`, `"40 Gunthas"`
   - Verify `parseAreaInput`: `"1,25"` and `"१.२५"` in `"acres"` mode -> `50` gunthas; `"0.33"` in `"acres"` mode -> `13.2` gunthas; negative, `NaN`, and `> 10000` acres fail with bilingual error messages.
   - Verify `displayPlotName` maps preset names in `"mr"` and preserves custom names.
2. **`tests/store-v5.test.ts`**:
   - Verify `PERSISTENCE_VERSION === 5` and `migratePersistedFarm` upgrades versions `0` through `4` by injecting `landUnit: "acres"`.
   - Verify `createEmptyFixture()` and `createSampleFixture()` validate against `PersistedFarmSchema`.
   - Verify `parseFarmBackup` restores a `v4` backup envelope (without `landUnit` in `farm`) and defaults `landUnit` to `"acres"`.
   - Verify calling `setLandUnit("gunthas")` updates `state.landUnit` while leaving `weatherSnapshot`, `soilSnapshot`, and `weatherStatus` completely untouched.

---

## VERIFICATION GATE (MANDATORY)
Run all four checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `git diff --check`
```
