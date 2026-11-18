# Balram v0.3.3 Blueprint: Full Marathi Coverage & Land Unit Toggle (Source-Validated Edition)

*Prepared 18 November 2026 · Overseer: Claude · Source Reviewer & Architect: Gemini · Implementer: Codex*

## 0. Step 0 Preflight Audit & Source Validation Summary (Gemini Architect)

All 12 assumptions (A1–A12) in Claude's draft were audited against `/Users/advaet/Projects/Balram` (`v0.3.2`):

| # | Assumption | Verdict | Source-Code Finding & Architectural Impact |
| :--- | :--- | :--- | :--- |
| **A1** | `src/config/i18n.ts` holds `en` and `mr` dictionaries | **CONFIRMED** | Has top-level keys plus nested objects (`stages`, `cropNames`, `stageNames`, `stationNames`, `stationStatuses`, `dailyTabs`, `provenance`, `roadmapBuckets`, `checkInEvents`). **Keep the nested structure** so existing callers don't break while adding missing keys. |
| **A2** | `locale` is in Zustand with `setLocale` working in Sample Mode | **CONFIRMED** | `setLocale` works in Sample Mode; `setLandUnit` will mirror `setLocale` (updating active state + `realFarmBackup` if active, without calling `invalidate()`). |
| **A3** | Domain engines build English strings internally | **REFUTED (Already Bilingual!)** | `soilKit.ts`, `cropRecommendations.ts`, `fieldVoice.ts`, `roadmap.ts`, and `checkout.ts` **already return `{ en, mr }` objects**. Do **NOT** change their function signatures to inject `t` (which would break 35 existing tests). Instead, fix the remaining English leaks inside `.mr` fields (e.g., interpolating `crop.marathiName` instead of `crop.name` in `fieldVoice.ts`, and localizing `alertStatus.ts` and `client.ts`). |
| **A4** | Area formatting is duplicated across components | **CONFIRMED** | Found in 6 UI/helper files (`MapClient.tsx`, `PortfolioCard.tsx`, `CropAdvisorCard.tsx`, `CropCheckoutSheet.tsx`, `IrrigationPanel.tsx`, `FarmReport.tsx`, `shareSummary.ts`). All will route through `formatArea()` in `src/lib/domain/landUnits.ts`. |
| **A5** | Existing tests assert English text | **CONFIRMED** | Because we preserve the `{ en, mr }` return shape on domain functions, all 35 existing tests remain unbroken. |
| **A6** | `typescript` is a devDependency importable in Node tests | **CONFIRMED** | `"typescript": "^5.9.0"` is installed and available for AST/source checks in `npm test`. |
| **A7** | Backup/restore validates via `PersistedFarmSchema` & `migratePersistedFarm` | **CONFIRMED** | `src/lib/storage/backup.ts` checks `version <= PERSISTENCE_VERSION` and delegates to `migratePersistedFarm`, so bumping `PERSISTENCE_VERSION = 5` and accepting `v0–v4` automatically supports `v4` backup files. |
| **A8** | Land inputs use `type="number"` | **CONFIRMED** | `MapClient.tsx` and `CropCheckoutSheet.tsx` use `type="number"`. Will be replaced by a single-unit `AreaInput` (`type="text" inputMode="decimal"`) using `parseAreaInput()` (supporting Devanagari digits `०–९` and comma decimals). |
| **A9** | Pump-flow input unit in `IrrigationPanel.tsx` | **CONFIRMED** | Unit is **`L/hour`** (`लिटर/तास`), currently hardcoded in English on lines 80 & 94 of `IrrigationPanel.tsx` alongside the Advanced Measured Flow form. |
| **A10** | Sample Mode is a read-only overlay | **CONFIRMED** | `setLandUnit` will be allowed during Sample Mode just like `setLocale` without writing to IndexedDB. |
| **A11** | Weather API / client & `alertStatus.ts` emit English errors | **CONFIRMED** | `providerErrorMessage` (`src/lib/api/client.ts`) and `alertStatusMessages` (`src/lib/ui/alertStatus.ts`) emit English strings; will be localized via `locale`. |
| **A12** | `FarmReport.tsx` and `shareSummary.ts` format area independently | **CONFIRMED** | Both will be wired to `formatArea(..., { includeSecondary: true })` and `displayPlotName(name, locale)`. |

---

## 1. Core Decisions Locked for `v0.3.3`

1. **Two Land Unit Modes (`acres` | `gunthas`), Default `acres`:**
   - Persisted in `PersistedFarmSchema` as `landUnit: z.enum(["acres", "gunthas"]).default("acres")` (`PERSISTENCE_VERSION = 5`).
   - Canonical storage remains **square metres** for `fieldGeometry` and **gunthas** for `cropAllocations`. Switching `landUnit` is strictly a display and input preference—it never mutates stored geometry/gunthas and never calls `invalidate()`.
2. **Exact Display, Rounding & Parsing Rules (`src/lib/domain/landUnits.ts`):**
   - `AREA_EPSILON_GUNTHAS = 0.01`.
   - **Acres mode:** `Math.round(gunthas * 2.5) / 100` (half-up to 2 decimals, trailing zeros trimmed: `50 gunthas -> "1.25 Acres"`, `40 gunthas -> "1 Acre"`, `7 gunthas -> "0.18 Acres"`, `0 -> "0 Acres"`; Marathi: `"1.25 एकर"`, `"1 एकर"`).
   - **Gunthas mode:** `Math.round(gunthas * 10) / 10` (up to 1 decimal, trailing zeros trimmed: `50 -> "50 Gunthas"`, `1 -> "1 Guntha"`, `12.5 -> "12.5 Gunthas"`; Marathi: `"1 गुंठा"` when exactly `1`, otherwise `"X गुंठे"`).
   - **Near-integer snapping:** Within `AREA_EPSILON_GUNTHAS` (`0.01` gunthas) of a whole acre (`39.99`–`40.01` gunthas), snap cleanly (`39.98` gunthas rounds to `1 Acre` in Acres mode and `40 Gunthas` in Gunthas mode when using half-up display rounding).
   - **Dual Display (`includeSecondary: true`):** Appends `(= 50 Gunthas)` in Acres mode or `(= 1.25 Acres)` in Gunthas mode on the three primary surfaces: Land station headline, Checkout sheet land meter, and `FarmReport.tsx`.
   - **`parseAreaInput(raw, unit)`:** Normalizes Devanagari digits (`०`–`९` $\rightarrow$ `0`–`9`), accepts a single comma as decimal separator (`"1,25"` $\rightarrow$ `1.25`), rejects negative/`NaN`/`> 10,000 acres` (`400,000 gunthas`), and converts to gunthas rounded to `0.01` guntha (`Math.round(g * 100) / 100`).
3. **Preset Plot Name Localization (`displayPlotName`):**
   - Translates the 4 default preset plot names (`Well Plot` $\rightarrow$ `विहिरीचा प्लॉट`, `Borewell Patch` $\rightarrow$ `बोअरवेल प्लॉट`, `Canal Plot` $\rightarrow$ `कालव्याचा प्लॉट`, `Roadside Field` $\rightarrow$ `रस्त्यालगतचा प्लॉट`) and numbered default `Plot N` $\rightarrow$ `प्लॉट N` when `locale === "mr"`, while leaving custom farmer-typed names untouched.
4. **100% Marathi Surface Coverage (Invariant 8):**
   - When `locale === "mr"`, zero raw English sentences, labels, placeholders, error messages, season tags, or drought tolerance strings remain across `MapClient`, `WeatherCard`, `SoilCard`, `CropAdvisorCard`, `CropCheckoutSheet`, `PortfolioCard`, `AlertsCard`, `IrrigationPanel`, `DailyHome`, `JourneyShell`, `FarmReport`, and `shareSummary`.
   - Post-hydration effect sets `document.documentElement.lang = state.locale` and localized `document.title`, with `html[lang="mr"]` typography rules in `globals.css`.

---

## 2. Three-Phase Execution Plan (Gemini -> Codex)

* **Phase 1 (Docs Sync, `landUnits.ts` Engine, Schema `v5` Migration & Unit Tests):**
  * Update `AGENTS.md` (`v0.3.3`, `PERSISTENCE_VERSION = 5`, Invariant 4 addendum, Invariant 8).
  * Create `src/lib/domain/landUnits.ts` (`LandUnit`, `AREA_EPSILON_GUNTHAS`, `gunthasToUnitValue`, `unitValueToGunthas`, `formatArea`, `parseAreaInput`, `displayPlotName`, `formatIndianNumber`).
  * Upgrade `src/types/domain.ts`, `src/store/useBalramStore.ts`, `src/mocks/fixtures.ts`, and `src/lib/storage/backup.ts` to `PERSISTENCE_VERSION = 5` with `landUnit` and `setLandUnit`.
  * Add `tests/units.test.ts` and `tests/store-v5.test.ts`.
* **Phase 2 (`LandUnitToggle`, Single-Unit `AreaInput`, Unit-Aware Presets & All Area Surfaces):**
  * Create `src/components/ui/LandUnitToggle.tsx` and `src/components/ui/AreaInput.tsx`.
  * Mount `LandUnitToggle` in `Header.tsx` and `CropCheckoutSheet.tsx`.
  * Wire `formatArea`, `AreaInput`, and unit-specific preset labels across `MapClient.tsx`, `PortfolioCard.tsx`, `CropAdvisorCard.tsx`, `CropCheckoutSheet.tsx`, `IrrigationPanel.tsx`, `FarmReport.tsx`, and `shareSummary.ts`.
* **Phase 3 (Full Marathi Sweep Across Engines & Components, Devanagari Typography & Hardcoded-String Gate):**
  * Eliminate all remaining English leaks when `locale === "mr"` in `fieldVoice.ts` (crop Marathi name interpolation), `alertStatus.ts`, `client.ts`, `MapClient.tsx`, `WeatherCard.tsx`, `CropAdvisorCard.tsx`, `IrrigationPanel.tsx`, `FarmReport.tsx`, and `FarmMap.tsx` (`L.drawLocal` Marathi strings).
  * Add `html[lang="mr"]` Devanagari line-height/font stack in `globals.css` and post-hydration `<html lang>` + `document.title` sync.
  * Add `tests/i18n.test.ts` verifying full Marathi coverage and bump version to `0.3.3`.
