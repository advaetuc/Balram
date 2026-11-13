# AGENTS.md — System Architect & Coding Agent Contract for Balram (v0.2.0)

This document is the authoritative engineering specification and operational contract for AI coding agents (Codex, Cursor, Claude Code, and automated subagents) working on the **Balram** codebase (`v0.1.0` $\rightarrow$ `v0.2.0`). Read this file completely before modifying any source code, Zod schemas, domain engines, UI components, API routes, or build scripts.

## 1. Architectural Philosophy & Non-Negotiable Invariants

Balram is a **local-first, zero-database, chemistry-integrated agritech platform** built for smallholder farmers in Maharashtra. The `v0.2.0` evolution transitions the user experience from raw agronomic jargon ($ET_0$, $K_c$, abstract percentage sliders) to **plain-language field guidance, In-House Chemistry Soil Kit integration, Acres & Gunthas plot management, and conversational advisories ("Balram's Field Voice")**. Every code change must preserve seven hard invariants:

### Invariant 1: Strict SSR/Client Hydration Parity (`useSyncExternalStore`)
* **Never** read `window`, `localStorage`, `indexedDB`, `navigator.onLine`, or `Date.now()` directly during initial React component render.
* All state consumption must go through `useBalramStore(selector)` in `src/store/useBalramStore.ts`, which uses [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) backed by a deterministic `serverSnapshot` (`createEmptyFixture()`).
* **Never** remove `skipHydration: true` from the [Zustand](https://www.npmjs.com/package/zustand) `persist` configuration, and **never** enable IndexedDB writes before `store.persist.rehydrate()` resolves (`writesEnabled` guard).

### Invariant 2: Coordinate Axis Anti-Corruption (`[Lng, Lat]` vs. `[Lat, Lng]`)
* **Domain & GeoJSON Standard**: Every persisted coordinate in `src/types/domain.ts` (`CoordinateSchema`), [Turf.js](https://turfjs.org/docs/api/area) calculation, and provider cache key strictly uses **`[longitude, latitude]`** (`[X, Y]`).
* **Leaflet UI Boundary**: [Leaflet](https://leafletjs.com/reference.html) components (`src/components/map/FarmMap.tsx`) and user-facing Latitude/Longitude inputs (`src/components/map/MapClient.tsx`) operate in **`[latitude, longitude]`** (`[Y, X]`).
* Always convert Leaflet rings through `leafletToGeoJSON()` and `calculateFieldGeometry()` in `src/lib/domain/geometry.ts`. Never pass raw Leaflet `LatLng` tuples directly into Turf.js or Zustand state.

### Invariant 3: Generation-Guarded Asynchronous State Transitions
* Whenever `fieldGeometry` changes (via map polygon draw/edit, manual coordinate/guntha entry, vertex list edit, or sample mode toggle), the store **must** call `invalidate()` in `src/store/useBalramStore.ts`.
* `invalidate()` increments `generation`, aborts any in-flight `AbortController` (`active` weather request and `activeSoil` request), and clears `weatherSnapshot` and `soilSnapshot` (while preserving the farmer's physical `soilKitReading`, `cropAllocations`, and `locale`).
* Every asynchronous commit (`commitWeatherRequest`, `commitSoilRequest`) must verify `isCurrent(request)` (matching request reference, non-aborted signal, `generation`, and serialized `fieldKey`) before mutating state.

### Invariant 4: Local Land Units (Acres & Gunthas) + Basis-Point Compatibility
* In Maharashtra, **`1 Acre = 40 Gunthas`** (`GUNTHAS_PER_ACRE = 40`, `SQUARE_METRES_PER_GUNTHA = 101.17141056`, `SQUARE_METRES_PER_ACRE = 4046.8564224`).
* `v0.2.0` allows farmers to divide their land into named **Plots** (`plotId`, `plotName`, `areaGunthas`, `lifecycleStage`) where $\sum \text{areaGunthas} \le \text{totalFarmGunthas}$ (allowing unassigned/fallow gunthas without throwing validation errors).
* When deriving proportional shares or synchronizing with legacy percentage consumers, preserve exact basis-point math (`10,000 bps = 100.00%`) in `src/lib/domain/allocation.ts` and map user-facing `lifecycleStage` tags bidirectionally to internal [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm) `growthStage` values (`planned` $\leftrightarrow$ `initial`, `vegetative` $\leftrightarrow$ `development`, `flowering_fruiting` $\leftrightarrow$ `mid-season`, `harvesting` $\leftrightarrow$ `late-season`).

### Invariant 5: Data Provenance, Plain-Language Translation & Honest Fallbacks
* Never silently conflate **on-site physical soil test kit readings** (`SoilKitReading`), **modeled regional weather telemetry** ([Open-Meteo](https://open-meteo.com/en/docs)), **deterministic empirical fallbacks** (Hargreaves-Samani $ET_0$), **farmer-confirmed irrigation inputs**, and **illustrative sample fixtures**.
* Never expose raw agronomic numbers in isolation when a plain-language interpretation is required: always pair pH, N, P, K, and $ET_0$ figures with actionable layman explanations and explicit provenance badges.
* Missing provider values must be represented as `null`—never coerced to `0`—and handled via `calculateHargreavesEt0()` or clear UI notices.

### Invariant 6: Privacy & Edge Security Boundary
* All Edge routes (`src/app/api/*/route.ts`) are `POST`-only (`submitOnly()` returns `405` for `GET`/`HEAD`/`OPTIONS`/`PUT`/`PATCH`/`DELETE`), validate same-origin headers (`sec-fetch-site !== "cross-site"` and matching `origin`), and read bodies via `readJson(request, 4096, signal)` in `src/lib/api/http.ts`.
* Outbound provider coordinates must be rounded via `queryCoordinate()` to `COORDINATE_DECIMALS = 4` (`~11 m` precision) before leaving the server or entering the in-memory `cachedRequest` map. Personal `fieldId` values, full polygon rings, `soilKitReading` data, and `farmProfile` records must **never** be sent to external APIs or stored in shared server memory.

### Invariant 7: CSP Hash & Service Worker Finalizer Contract
* `next.config.ts` and `scripts/finalize-release.mjs` enforce a strict Content Security Policy (`default-src 'none'`, `script-src-attr 'none'`, per-document SHA-256 inline script hashes in static HTML, and `style-src 'self' 'unsafe-inline'` required by Leaflet).
* **Never** add inline event handlers, external CDN scripts, or unapproved remote image/connect origins without updating `next.config.ts`.
* Every production build must run `npm run build` (`next build && node scripts/finalize-release.mjs`) so `public/sw.js` and HTML `<meta data-balram-csp="true">` tags stay synchronized.

## 2. Target v0.2.0 Codebase Map & Module Responsibilities

| File Path | Status in `v0.2.0` | Primary Responsibility & Key Exports |
| :--- | :--- | :--- |
| `src/types/domain.ts` | **Modify (Phase 1)** | Canonical Zod schemas: `SoilKitReadingSchema`, `LifecycleStageSchema`, upgraded `CropAllocationSchema` (with `plotId`, `plotName`, `areaGunthas`, `lifecycleStage`), and `PersistedFarmSchema` (`v3` with `soilKitReading` & `locale`) |
| `src/store/useBalramStore.ts` | **Modify (Phase 1)** | Vanilla Zustand store, `PERSISTENCE_VERSION = 3`, `v1`/`v2` $\rightarrow$ `v3` migration in `migrate()`, `setSoilKitReading()`, `setLocale()`, and `useSyncExternalStore` hook |
| `src/mocks/fixtures.ts` | **Modify (Phase 1)** | Deterministic `createEmptyFixture()` and upgraded Pune `createSampleFixture()` with named Guntha plots and sample In-House Soil Kit readout |
| `src/config/cropMatrix.ts` | **Modify (Phase 2)** | `MaharashtraCropMatrix` enriched with `kcByStage` (`initial`, `development`, `mid-season`, `late-season`), `optimalPhRange`, `npkDemand`, `droughtTolerance`, `waterBudgetMm`, and `typicalWeeks` |
| `src/lib/domain/geometry.ts` | **Modify (Phase 2)** | Axis transformation (`[lat, lng] -> [lng, lat]`), Turf geodesic area, plus `GUNTHAS_PER_ACRE = 40`, `SQUARE_METRES_PER_GUNTHA`, `squareMetresToGunthas()`, `gunthasToAcresAndGunthas()`, and `acresAndGunthasToSquareMetres()` |
| `src/lib/domain/soilKit.ts` | **Create (Phase 2)** | `interpretSoilKitReading()`: translates In-House Chemistry Kit (Soil-water suspension pH, Alkaline $\text{KMnO}_4$ N, Olsen Molybdenum-Blue P) and commercial rapid kit readings into layman soil health badges and enrichment plans (FYM, gypsum, lime, split urea, basal SSP/DAP) |
| `src/lib/domain/cropRecommendations.ts` | **Create (Phase 2)** | `getSeasonalCropRecommendations()`: ranks crops by current/upcoming Maharashtra season (*Kharif*, *Rabi*, *Zaid*, *Perennial*), soil kit pH/NPK compatibility, and 7-day forecast rainfall/temperature |
| `src/lib/domain/fieldVoice.ts` | **Create (Phase 2)** | `generateFieldVoiceAdvisories()`: evaluates 7 multi-variable agronomic rules (heat & Vertisol cracking, vegetative N deficit, basal P lockup, high alkalinity, flowering water peak, Rabi Onion cold night guard, harvest rain warning) into conversational advice |
| `src/lib/domain/irrigation.ts` | **Modify (Phase 2)** | [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm) $ET_c$ demand, `calculateHargreavesEt0()` fallback, `calculatePhaseWaterBreakdown()` (weekly water needs across 4 lifecycle phases), and `simulateDroughtReallocation()` |
| `src/lib/domain/allocation.ts` | **Modify (Phase 2/3)** | Supports both Guntha plot allocation ($\sum \text{plotGunthas} \le \text{totalFarmGunthas}$ with fallow/unassigned tracking) and exact basis-point (`10,000 bps`) proportional calculations |
| `src/components/map/MapClient.tsx` | **Modify (Phase 3)** | Displays field area in **Acres & Gunthas** and supports manual Acres + Gunthas entry alongside the dynamic `FarmMap.tsx` canvas |
| `src/components/dashboard/PortfolioCard.tsx` | **Modify (Phase 3)** | Plot-by-plot management UI with named plots (*"Well Plot"*, *"Borewell Patch"*), Acres + Gunthas inputs, and 4-stage Lifecycle Status Tags (*Planned*, *Vegetative*, *Flowering/Fruiting*, *Harvesting*) |
| `src/components/dashboard/SoilCard.tsx` | **Modify (Phase 4)** | Rapid On-Site Soil Testing Kit UI (`Balram In-House Kit` & `Full Rapid Kit` modes) with colorimetric visual bars and instant **"What Your Soil Needs Before Planting"** enrichment plan |
| `src/components/dashboard/CropAdvisorCard.tsx` | **Create (Phase 4)** | Displays seasonal & soil-matched crop recommendations with match badges and one-tap **"Assign to Plot"** actions |
| `src/components/dashboard/AlertsCard.tsx` | **Modify (Phase 5)** | Upgraded to **"Balram's Field Voice"**, rendering prioritized conversational advisories above collapsible system/data checks |
| `src/components/irrigation/IrrigationPanel.tsx` | **Modify (Phase 5)** | Unlocks offline/stale calculation; defaults to **Simple Mode** (Plot + *Drip / Sprinkler / Canal Flood* preset $\rightarrow$ Today's Run + 4-Phase Weekly Water Table + Drought Crop Reallocation Simulator) with collapsible **Advanced Override** |
| `src/config/i18n.ts` | **Create (Phase 6)** | Strongly typed `en` (English) and `mr` (Marathi — `मराठी`) translation dictionary for all UI labels, units (*एकर / गुंठे*), crops, lifecycle tags, soil kit remedies, and Field Voice messages |
| `src/components/app-shell/Header.tsx` | **Modify (Phase 6)** | Adds the top-bar `English / मराठी` language toggle and status badges |
| `src/components/report/FarmReport.tsx` | **Modify (Phase 6)** | Syncs the printable A4 report with Plot Acres/Gunthas, Lifecycle Tags, On-Site Soil Kit Enrichment Plan, and Weekly Water Breakdown |

## 3. Schema Migration Contract (`PERSISTENCE_VERSION = 2` $\rightarrow$ `3`)

When upgrading `src/types/domain.ts` and `src/store/useBalramStore.ts` in Phase 1, follow these exact schema and migration rules so existing browser data in IndexedDB never crashes or gets wiped:

1. **New & Updated Schemas in `src/types/domain.ts`**:
   * `LifecycleStageSchema = z.enum(["planned", "vegetative", "flowering_fruiting", "harvesting"])`
   * Map helper `lifecycleToGrowthStage(stage: LifecycleStage)`:
     * `"planned"` $\rightarrow$ `"initial"`
     * `"vegetative"` $\rightarrow$ `"development"`
     * `"flowering_fruiting"` $\rightarrow$ `"mid-season"`
     * `"harvesting"` $\rightarrow$ `"late-season"`
   * `SoilKitReadingSchema`:
     * `kitType`: `z.enum(["balram_inhouse", "commercial_rapid"]).default("balram_inhouse")`
     * `ph`: `z.number().finite().min(3.5).max(10.5)`
     * `nitrogenLevel`: `z.enum(["low", "medium", "high"])`
     * `phosphorusLevel`: `z.enum(["low", "medium", "high"])`
     * `potassiumLevel`: `z.enum(["low", "medium", "high", "untested"]).default("untested")`
     * `organicCarbon`: `z.enum(["low", "medium", "high", "untested"]).default("untested")`
     * `salinity`: `z.enum(["normal", "elevated", "high", "untested"]).default("untested")`
     * `testedAt`: `z.string().date()`
   * `CropAllocationSchema` additions (with defaults for backward compatibility):
     * `plotId`: `id.default("plot-1")`
     * `plotName`: `z.string().trim().min(1).max(60).default("Main Plot")`
     * `areaGunthas`: `z.number().finite().positive().nullable().default(null)`
     * `lifecycleStage`: `LifecycleStageSchema.default("planned")`
   * `CropAllocationsSchema`:
     * Allow multiple named plots (same crop may be planted on two different named plots if `plotId` values are distinct; ensure `new Set(items.map(i => i.plotId)).size === items.length`).
     * Relax the hard `sum === 10_000 bps` constraint so partial plot allocations ($\le 100\%$ of total land, leaving fallow/unassigned gunthas) validate cleanly, while validating that total percentage never exceeds `100.00%` (`10,000 bps`).
   * `PersistedFarmSchema` additions:
     * `soilKitReading: SoilKitReadingSchema.nullable().default(null)`
     * `locale: z.enum(["en", "mr"]).default("en")`
2. **Migration Logic in `src/store/useBalramStore.ts`**:
   * Set `export const PERSISTENCE_VERSION = 3;`.
   * In `migrate: (saved, version) => ...`: accept versions `0`, `1`, and `2`, inject `soilKitReading: null`, `locale: "en"`, and map any legacy `cropAllocations` items missing `plotId` / `plotName` / `lifecycleStage` by assigning `plotId: "plot-" + (index + 1)`, `plotName: "Plot " + (index + 1)`, and deriving `lifecycleStage` from legacy `growthStage`.

## 4. Excluded Features Guardrail (Do Not Implement in `v0.2.0`)

Coding agents must **not** add dependencies, routes, or UI stubs for the following deferred features:

1. **No Automated OCR Lab Report Scanners**: Do not install `tesseract.js` or call external Vision LLM endpoints. Use the structured `SoilCard.tsx` rapid kit input form.
2. **No Image-Based Pest / Disease / Weed Classifiers**: Do not bundle client-side ML weights or image upload forms. Use `fieldVoice.ts` micro-climate and crop-stage risk advisories.
3. **No Camera RGB Soil / Strip Color Estimation**: Do not use `getUserMedia` camera feeds to estimate soil color or pH strip RGB values. Render on-screen colorimetric reference swatches in `SoilCard.tsx` for human visual matching.
4. **No Uncoordinated Serverless Scraping**: Keep `ENABLE_MARKET = false` ([Agmarknet](https://agmarknet.gov.in/)) and `ENABLE_SOILGRIDS = false` ([ISRIC SoilGrids](https://soilgrids.org/)) in `src/config/providers.ts`.

## 5. Six-Phase Developer Execution Sequence (`v0.2.0`)

Execute changes in the exact order below, running `npm run typecheck` after each phase:

* **Phase 1 — Domain Schema Upgrade & Persistence Migration (`PERSISTENCE_VERSION = 3`)**: Update `src/types/domain.ts`, `src/store/useBalramStore.ts`, and `src/mocks/fixtures.ts`.
* **Phase 2 — Pure Agronomic & Mathematical Domain Engines**: Enrich `src/config/cropMatrix.ts`, add Guntha helpers to `src/lib/domain/geometry.ts`, create `src/lib/domain/soilKit.ts`, `src/lib/domain/cropRecommendations.ts`, and `src/lib/domain/fieldVoice.ts`, and extend `src/lib/domain/irrigation.ts` with `calculateHargreavesEt0()`, `calculatePhaseWaterBreakdown()`, and `simulateDroughtReallocation()`.
* **Phase 3 — Plot-by-Plot Land Management in Acres & Gunthas**: Upgrade `src/components/map/MapClient.tsx` and `src/components/dashboard/PortfolioCard.tsx` to manage named plots in Acres + Gunthas with 4-pill Lifecycle Status Tags (*Planned*, *Vegetative*, *Flowering/Fruiting*, *Harvesting*).
* **Phase 4 — On-Site Soil Testing Kit UI & Seasonal Crop Advisor**: Refactor `src/components/dashboard/SoilCard.tsx` for the Balram In-House Chemistry Kit (pH, N, P + layman enrichment plan) and create `src/components/dashboard/CropAdvisorCard.tsx` inside `src/components/dashboard/Dashboard.tsx`.
* **Phase 5 — Balram's Field Voice & Simplified Phase-Wise Water Planner**: Upgrade `src/components/dashboard/AlertsCard.tsx` to render conversational Field Voice advisories and refactor `src/components/irrigation/IrrigationPanel.tsx` to unlock offline calculation, Simple Mode delivery presets (*Drip*, *Sprinkler*, *Canal/Flood*), the 4-Phase Weekly Water Table, and the Drought Crop Distribution Simulator.
* **Phase 6 — Bilingual Dictionary (`en`/`mr`), Printable Report Sync & Release Finalizer**: Create `src/config/i18n.ts`, add the `English / मराठी` toggle to `src/components/app-shell/Header.tsx`, update `src/components/report/FarmReport.tsx`, and run the full build verification gate.

## 6. UI, Accessibility & Styling Rules for Agents

* **Touch Target Floor**: Every interactive element (`a`, `button`, `input`, `select`, `textarea`, `summary`, segmented pills, and Leaflet draw toolbar buttons) must maintain at least `48×48px` (`min-h-12 min-w-12` in `src/app/globals.css`) for outdoor one-handed mobile use.
* **Color Palette Tokens (`tailwind.config.ts` / `globals.css`)**:
  * Primary Action / Brand: `forest` (`#1E5631`)
  * Warning / Hazard / Centroid Marker: `amber` (`#FFBF00`)
  * Telemetry / Modelled / Molybdenum-Blue Indicator: `sky`
  * Surface / Background: `daylight` & `white`
  * Text: `ink` (`#212121`)
* **Print Integrity**: Any new soil enrichment checklists, plot tables, or weekly water breakdowns must render cleanly in `src/components/report/FarmReport.tsx` under `@media print` (A4 portrait), while interactive controls carry `print:hidden`.

## 7. Pre-Commit Verification Checklist for Coding Agents

Before marking any task complete, every coding agent **must** run and pass the following verification sequence without errors:

```bash
# 1. Verify zero TypeScript or Zod type regressions
npm run typecheck

# 2. Verify production Next.js build, static HTML CSP hashing, and Service Worker generation
npm run build
```

* Confirm that `scripts/finalize-release.mjs` outputs `Release: hashed static script policies; <N> approved offline application files.` with exit code `0`.
* Confirm that no `__MACOSX` or `.DS_Store` artifacts are staged or imported.
* Confirm that both `createEmptyFixture()` and `createSampleFixture()` in `src/mocks/fixtures.ts` validate cleanly against `PersistedFarmSchema` (`v3`).