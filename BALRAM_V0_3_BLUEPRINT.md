# Balram v0.3 Blueprint: Brand, Navigation and Technical Spec (Source-Validated Edition)

*Prepared 16 November 2026 · Overseer: Claude · Source Reviewer & Architect: Gemini · Implementer: Codex*

## 0. Source Validation Resolution Summary (Gemini Architect Audit)

All 10 **VERIFY** items from the initial draft have been verified against `/Users/advaet/Projects/Balram`:

1. **Test Runner (VERIFY #1 — Modified for Zero-Network Execution):** `package.json` has no test runner installed, and Codex runs in a network-restricted sandbox. Instead of adding `vitest` via `npm install`, use **Node 22's built-in `node:test` and `node:assert/strict`** (`node --experimental-strip-types --test` or compiled via `tsc`), requiring **zero new npm dependencies**.
2. **Sample Farm Behavior (VERIFY #2 — Confirmed Destructive Today):** In `src/store/useBalramStore.ts`, `setSampleData(true)` currently throws if any real data exists and overwrites the persisted store slice with `createSampleFixture()`. In Release B (B4), Sample Mode must be refactored into a **non-persisted, read-only in-memory overlay** (`sampleOverlayActive`) that never mutates IndexedDB and can be entered/exited even when a real farm is saved.
3. **Route Map & Offline Service Worker Constraint (VERIFY #3 — Critical Modification):** `scripts/finalize-release.mjs` only hashes `.next/server/app/index.html` (`"/"`) into the Service Worker navigation fallback, and `scripts/service-worker.js` rejects RSC (`request.headers.get("RSC") === "1"`) and non-root offline navigations. **Do NOT create 10 separate Next.js URL routes (`/journey/*`, `/home/*`)**—that would break offline navigation and Service Worker caching. Instead, implement the **Setup Journey (6 Stations)** and **Daily Home (4 Tabs)** as **state-driven views inside the single `/` route (`src/app/(app)/page.tsx`)** backed by `useBalramStore`.
4. **Season Casing & Perennial Mapping (VERIFY #4 — Confirmed):** `MaharashtraCropMatrix` uses capitalized `"Kharif" | "Rabi" | "Zaid" | "Perennial"`, whereas `CropAllocationSchema` uses lowercase `"kharif" | "rabi" | "zaid" | "perennial"`. Convert via `MaharashtraCropMatrix[cropId].season.toLowerCase() as CropAllocation["season"]`.
5. **Store `invalidate()` & `persistedSlice()` (VERIFY #5 — Confirmed):** `invalidate()` preserves unmentioned fields, but `persistedSlice(state)` in `src/store/useBalramStore.ts` explicitly whitelists persisted keys. In Release B (B1), `soilSkipped`, `setupCompletedAt`, and `checkIns` must be added to `persistedSlice`, `createEmptyFixture`, `createSampleFixture`, and `migrate`.
6. **SSR `new Date()` Invariant 1 Violation Found (VERIFY #6 — Bug Confirmed in Live Code):** In `src/components/dashboard/CropAdvisorCard.tsx` line 9, when `state.now === null` (SSR), `monthZeroIndexed` is passed as `undefined`, causing `getSeasonalCropRecommendations()` in `src/lib/domain/cropRecommendations.ts` line 8 to execute `new Date().getMonth()` during render! Fix in Release A (A6): default `monthZeroIndexed` to a deterministic constant (`9` = October / Rabi) when `undefined` or `null`, never calling `new Date()` in domain functions.
7. **Backup / `storage.persist` (VERIFY #7 — Confirmed Absent):** Neither JSON export/import nor `navigator.storage.persist()` exists yet; scheduled for Release B (B7).
8. **Vertisol pH Ranges & Gypsum Gating (VERIFY #8 — Confirmed):** `onion` (`[6.0, 7.5]`) and `groundnut` (`[6.0, 7.8]`) currently penalize typical Pune black Vertisols (`pH 7.9–8.1`), and `soilKit.ts` recommends gypsum at `pH > 8.2` without checking `salinity`. Fix in Release A (A6): add `tolerablePhRange` to `CropThresholds` and gate gypsum advice on `salinity === "elevated" || salinity === "high"`.
9. **Devanagari Print Rendering (VERIFY #9 — Confirmed):** `src/app/globals.css` uses system sans fonts and `print-color-adjust: exact` under `@media print`.
10. **`CONTEXT.md` Line Alignment (VERIFY #10 — Confirmed):** All 7 audit flaws in `CONTEXT.md` §3 match the exact live files in `src/`.

## 1. Decisions Locked

| # | Decision |
| --- | --- |
| 1 | **Single farm.** Home shows one **My Farm** workspace and a read-only **Sample Farm (Pune)** overlay. No multi-farm this release. |
| 2 | No accounts. The landing view is language-first, then Start (or Continue). |
| 3 | Two navigation modes inside the single-page shell (`/`): **Setup Journey** (first time, until `setupCompletedAt` is set) and **Daily Home** (after setup). |
| 4 | Weather is **fetched automatically** once the land is saved. The farmer never has to click a separate fetch button during setup. |
| 5 | Soil is **skippable**. Soil Health Card values (`kg/ha`) can be typed in. No OCR, no camera. |
| 6 | **One** schema migration in Release B: `PERSISTENCE_VERSION = 3` to `4`. |
| 7 | **Release A (`v0.2.1`, stabilise)** ships before **Release B (`v0.3.0`, new shell)**. |
| 8 | No revenue estimation this release (`ENABLE_MARKET = false`). |
| 9 | No push notifications. Check-ins are an in-app banner shown when the app opens. |

## 2. Product Thesis and Brand

* **Maxim:** Chemistry generates the soil result; Balram makes it understandable and actionable in the field.
* **Audience:** Smallholder farmer (2 to 10 acres) in Maharashtra, on a budget Android phone, in bright sunlight, on intermittent 3G, often one-handed, Marathi-first.
* **Brand Idea — The Growing Path:** A farm season is a path with six stations (*seed, sprout, leaf, flower, fruit, grain*).
* **Copy Rules:** Concise plain-language sentences; never show raw `ET₀`, `Kc`, or basis points in the primary UI (keep technical formulas tucked inside collapsible `<details>` blocks); every figure carries a provenance badge; Marathi (`मराठी`) is a first-class language with zero English leaks when `locale === "mr"`.

## 3. Release A: `v0.2.1` (Stabilise Current Codebase)

Execute all 7 items below as **Phase 1 (`v0.2.1`)**:

* **A1. Zero-Dependency Test Harness (`node:test`)**:
  * Add a test script in `package.json` using Node's built-in test runner (`node:test` + `node:assert/strict`) that compiles/runs unit tests against `src/lib/domain/*` and `src/config/*` without installing external npm packages.
* **A2. Marathi Integrity (Fixes Flaws #1 & #5)**:
  * Update `src/components/dashboard/AlertsCard.tsx` to use `t(state.locale).voice`, `t(state.locale).voiceEyebrow`, and render `a.headline[state.locale]`, `a.message[state.locale]`, and `a.actionLabel[state.locale]`, plus localized priority badges and system status checks.
  * Update `src/lib/domain/fieldVoice.ts` so every one of the 7 rules + fallback has a distinct, natural headline in both English (`en`) and Marathi (`mr`).
  * Update `src/lib/domain/soilKit.ts` so `ph`, `potassium`, `organic_carbon`, and `salinity` steps provide genuine Marathi (`mr`) explanations and action steps rather than repeating the English strings.
* **A3. Irrigation Selects by `plotId` (Fixes Flaw #2)**:
  * In `src/components/irrigation/IrrigationPanel.tsx`, replace the `cropId` state selector with `selectedPlotId` (`plot.plotId ?? "plot-1"`), looking up the selected plot by `plotId` so multiple plots growing the same crop (e.g., two Onion plots) calculate independently.
* **A4. Canonical Gunthas & Safe `±5 Gunthas` Rebalancing (Fixes Flaw #3)**:
  * Add a single canonical helper `updatePlotGunthas(plots, targetPlotId, nextGunthas, totalAreaSquareMetres)` in `src/lib/domain/allocation.ts` that clamps/validates `nextGunthas > 0`, refuses to let total allocated gunthas exceed `totalFarmGunthas`, and recomputes `percentage` in basis points for all plots. Wire all plot size edits and `+5 Gunthas` / `−5 Gunthas` / `Use remaining land` buttons in `PortfolioCard.tsx` through this helper.
* **A5. Season Derived from Crop Matrix (Fixes Flaw #4)**:
  * In `src/lib/domain/allocation.ts` (`upsertPlotAllocation`), derive `season` from `MaharashtraCropMatrix[input.cropId as CropId]?.season.toLowerCase() ?? "kharif"` instead of hardcoding `"kharif"`.
* **A6. Deccan Vertisol pH Tolerance, Gypsum Gating & Invariant 1 Date Fix**:
  * In `src/config/cropMatrix.ts`, add `tolerablePhRange: readonly [number, number]` to `CropThresholds` reflecting Maharashtra black Vertisol tolerance (e.g., `onion`: optimal `[6.0, 7.5]`, tolerable `[5.8, 8.1]`; `groundnut`: optimal `[6.0, 7.8]`, tolerable `[5.8, 8.1]`; `sugarcane`: optimal `[6.5, 8.0]`, tolerable `[6.0, 8.3]`; `rabi_jowar`: `[6.0, 8.5]` / `[5.8, 8.6]`; `bajra`: `[6.5, 8.5]` / `[6.0, 8.6]`; `pomegranate`: `[6.5, 8.5]` / `[6.0, 8.7]`).
  * In `src/lib/domain/cropRecommendations.ts`:
    * Eliminate `new Date().getMonth()` fallback (Invariant 1 violation); default `monthZeroIndexed` to `9` (October / Rabi) when `undefined`.
    * Only apply the `-12` score penalty and `amend = true` when `soil.ph` is outside `tolerablePhRange`; if `soil.ph` is outside `optimalPhRange` but within `tolerablePhRange`, apply a mild `-4` adjustment without flagging a mandatory pH amendment.
  * In `src/lib/domain/soilKit.ts`:
    * Gate agricultural gypsum advice on `r.salinity === "elevated" || r.salinity === "high"` (for high pH without elevated salinity, recommend well-decomposed FYM/compost, green manure, and root-zone banded fertilizer placement instead of gypsum).
* **A7. Illustrative Drought Simulator Label & Version Bump (`0.2.1`)**:
  * In `src/components/irrigation/IrrigationPanel.tsx` and `src/lib/domain/irrigation.ts`, clearly label the Drought Simulator as an **Illustrative Planning Scenario / उदाहरणात्मक दुष्काळ नियोजन** in both English and Marathi.
  * Bump `"version"` in `package.json` from `"0.1.0"` to `"0.2.1"`.

## 4. Release B: `v0.3.0` (Growing Path Shell, Stations, Check-Ins & Backup)

Executed in subsequent phases after Release A (`v0.2.1`) is committed:

* **Phase B1 & B2 — Schema v4 (`PERSISTENCE_VERSION = 4`) & Pure Engines**:
  * Add `soilSkipped`, `setupCompletedAt`, and `checkIns` (`CheckInSchema`) to `PersistedFarmSchema`, plus `soil_health_card` kit mode and optional `nitrogenKgPerHa` / `phosphorusKgPerHa` to `SoilKitReadingSchema`.
  * Add `classifyNitrogenKgPerHa` (`<280` low, `280–560` medium, `>560` high) and `classifyPhosphorusKgPerHa` (`<10` low, `10–25` medium, `>25` high) to `soilKit.ts`.
  * Add `sowingWindows` to `cropMatrix.ts`, `reason` to `fieldVoice.ts`, and create `src/lib/domain/journey.ts` (`deriveJourney`) and `src/lib/domain/roadmap.ts` (`generateRoadmap`).
* **Phase B3, B4 & B5 — Single-Route Growing Path Shell, 6 Stations, Today View & Non-Destructive Sample Overlay**:
  * Build the state-driven **Setup Journey (6 Stations: My Land, Weather Auto-Fetch, My Soil, My Crops, Balram's Advice, My Roadmap)** and **Daily Home (4 Tabs: Today, My Farm, Water, Report)** inside `/` so offline Service Worker caching remains 100% intact.
  * Convert Sample Mode into a read-only, non-persisted overlay that never overwrites saved real-farm data.
* **Phase B6, B7 & B8 — Check-Ins, JSON Backup/Restore, Web Share & Printable Report Sync**:
  * Add the 30-second plot Check-In flow, local JSON export/import, post-hydration `navigator.storage.persist()`, coordinate-free Web Share summary, and full A4 report synchronization.
