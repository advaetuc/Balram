# CONTEXT.md — Ground-Truth Codebase Snapshot & Audit State for Balram (v0.2.0)

This file provides a complete, file-by-file and formula-by-formula snapshot of the live **Balram `v0.2.0`** repository (`/Users/advaet/Projects/Balram`) so an external AI Overseer (such as Claude) can audit architecture, validate chemistry-to-software logic, catch edge cases, and guide future iterations without needing all 42 source files uploaded into the context window.

## 1. Project Identity, Academic Context & Core Mission

* **Project Name:** Balram (`v0.2.0`, `PERSISTENCE_VERSION = 3`)
* **Origin & Context:** Built as an interdisciplinary college Project-Based Learning (PBL) and real-world precision agritech platform for smallholder farmers (typically 2 to 10 acres) in Maharashtra, India.
* **Core Thesis ("Chemistry Generates the Results; Software Makes Them Actionable"):**
  1. **Physical Analytical Chemistry Module:** Rather than relying on slow laboratory turnaround or coarse 250 m satellite soil models ([ISRIC SoilGrids](https://soilgrids.org/)), the team designed an **In-House Modular Soil Testing Kit** around three core wet-chemistry / instrumental assays:
     * **Soil pH:** Soil-water suspension method (`1:2.5` soil-to-distilled-water ratio) measured via calibrated digital pH meter or colorimetric strip (`3.5` to `10.5`).
     * **Available Nitrogen (N):** Alkaline potassium permanganate ($\text{KMnO}_4$) oxidative distillation assay releasing ammonia to quantify plant-available nitrogen (`Low < 280 kg/ha`, `Medium 280–560 kg/ha`, `High > 560 kg/ha`).
     * **Available Phosphorus (P):** Olsen extraction ($0.5\text{ M }\text{NaHCO}_3$ at pH $8.5$, suited for alkaline Deccan Vertisols) reacted with ammonium molybdate to form a blue phosphomolybdate complex quantified via colorimeter / UV-Vis spectrophotometer (`Low < 10 kg/ha`, `Medium 10–25 kg/ha`, `High > 25 kg/ha`).
     * **Commercial Rapid Kit Extension:** Optional support for Potassium (`K`), Organic Carbon (`OC`), and Salinity (`EC`).
  2. **Local-First Software Translation Layer:** Smallholder farmers should never have to interpret raw chemical numbers, abstract percentage sliders, or raw evapotranspiration ($ET_0$) equations. Balram stores all farm data locally in the browser's IndexedDB (`idb`), manages land in Maharashtra's native **Acres and Gunthas** ($1\text{ Acre} = 40\text{ Gunthas}$), tracks plots via 4 plain-language **Lifecycle Status Tags**, and translates weather + soil chemistry + crop stage into **Balram's Field Voice**, **Seasonal Crop Recommendations**, and **Phase-Wise Weekly Water & Drought Plans** in **English (`en`)** and **Marathi (`mr` — मराठी)**.

## 2. Complete File Tree & Exact Implementation State (42 Source Files)

### 2.1 Root Configuration & Build Pipeline
* `package.json`: Next.js `^15.5.0`, React `^19.0.0`, TypeScript `^5.9.0`, Tailwind CSS `^3.4.17`, Zustand `^5.0.0`, `idb` `^8.0.3`, `zod` `^3.25.0`, `leaflet` `^1.9.4`, `react-leaflet` `^5.0.0`, `react-leaflet-draw` `^0.21.0`, `@turf/area`, `@turf/center-of-mass`, `@turf/helpers` `^7.4.0`.
* `next.config.ts`: Enforces strict security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`), `Cache-Control: private, no-store, max-age=0` on `/api/:path*`, and a base Content Security Policy (`default-src 'none'`, `script-src-attr 'none'`, `img-src 'self' data: https://tile.openstreetmap.org`, `connect-src 'self'`).
* `scripts/finalize-release.mjs` & `scripts/service-worker.js`: Runs automatically during `npm run build` (`next build && node scripts/finalize-release.mjs`). Parses every prerendered `.html` file in `.next/server/app`, computes `sha256-...` hashes of inline bootstrap scripts, injects a `<meta data-balram-csp="true" http-equiv="Content-Security-Policy">` tag, and generates `public/sw.js` with a content-addressed cache name (`balram-shell-<sha256>`) covering all 40 approved static shell assets.

### 2.2 Domain Types & Persistence Layer (`src/types/`, `src/store/`, `src/lib/storage/`)
* `src/types/domain.ts`:
  * `CoordinateSchema`: Tuple `[longitude, latitude]` (`[-180..180, -90..90]`).
  * `ring`: Custom computational geometry superRefine validating GeoJSON polygon rings (`4..1001` points): checks ring closure, distinct vertices, non-zero signed area, antimeridian span `< 180°`, non-overlapping collinear segments (`onSegment`), and zero self-intersecting edges (`cross` & `intersects`).
  * `LifecycleStageSchema`: `z.enum(["planned", "vegetative", "flowering_fruiting", "harvesting"])` mapped bidirectionally to FAO-56 `GrowthStageSchema` (`"initial" | "development" | "mid-season" | "late-season" | "unknown"`).
  * `SoilKitReadingSchema`: `{ kitType: "balram_inhouse" | "commercial_rapid", ph: 3.5..10.5, nitrogenLevel: "low"|"medium"|"high", phosphorusLevel: "low"|"medium"|"high", potassiumLevel: "low"|"medium"|"high"|"untested", organicCarbon: "low"|"medium"|"high"|"untested", salinity: "normal"|"elevated"|"high"|"untested", testedAt: YYYY-MM-DD }`.
  * `CropAllocationSchema`: `{ plotId?, plotName?, areaGunthas?, lifecycleStage?, cropId, percentage, season, growthStage, plantingDate }`.
  * `CropAllocationsSchema`: Supports both legacy percentage mode (must sum to `10,000` basis points = `100%` with unique `cropId`) and `v0.2.0` plot mode (when `plotId` or `areaGunthas` is present, total basis points must be `<= 10,000` so unassigned/fallow land is permitted, and `plotId` values must be unique).
  * `PersistedFarmSchema` (`v3`): Combines `farmProfile`, `fieldGeometry`, `cropAllocations`, `irrigationSetup`, `weatherSnapshot`, `soilSnapshot`, `planningUpdatedAt`, `sampleDataActive`, `soilKitReading`, and `locale` (`"en" | "mr"`). Cross-validates that `weatherSnapshot` and `soilSnapshot` match `fieldGeometry.fieldId` and `fieldGeometry.center`.
* `src/store/useBalramStore.ts`:
  * Uses vanilla `createStore` with `persist` (`PERSISTENCE_VERSION = 3`, `skipHydration: true`) and binds to React via `useSyncExternalStore(api.subscribe, api.store.getState, api.getServerSnapshot)` where `serverSnapshot` is `createEmptyFixture()`.
  * `migrate(saved, version)` upgrades stored versions `0`, `1`, and `2` to `v3` by injecting `soilKitReading: null`, `locale: "en"`, and normalizing legacy `cropAllocations` with default `plotId`, `plotName`, and `lifecycleStage`.
  * `invalidate()` increments `generation`, aborts active weather/soil `AbortController` instances, and clears `weatherSnapshot` and `soilSnapshot` whenever `fieldGeometry` changes, while keeping `soilKitReading`, `cropAllocations`, and `locale` intact.
* `src/lib/storage/db.ts`:
  * Opens IndexedDB (`balram` v1, store `state`) with a 4,000 ms timeout and serialized promise queue (`serialize`). Falls back to an in-memory `Map` (`mode: "memory"`) if IndexedDB is blocked or unavailable.

### 2.3 Agronomic & Mathematical Engines (`src/config/` & `src/lib/domain/`)
* `src/config/cropMatrix.ts`:
  * Defines `MaharashtraCropMatrix` for 6 regional crops (`sugarcane`, `rabi_jowar`, `onion`, `bajra`, `pomegranate`, `groundnut`) with English and Marathi names, `supportedSeasons`, `baseKc`, `kcByStage` (`initial`, `development`, `mid-season`, `late-season`), `minSoilMoisture` (Vertisol volumetric threshold), `maxAirTemp`, `frostSensitive`, `dripEfficiency`, `optimalPhRange`, `npkDemand` (including `nitrogenFixing: true` on `groundnut`), `droughtTolerance`, `waterBudgetMmPerSeason`, `phaseWeeks`, and bilingual `plainSummary`.
* `src/lib/domain/geometry.ts`:
  * Constants: `SQUARE_METRES_PER_ACRE = 4046.8564224`, `GUNTHAS_PER_ACRE = 40`, `SQUARE_METRES_PER_GUNTHA = 101.17141056`.
  * Functions: `squareMetresToGunthas`, `gunthasToSquareMetres`, `acresAndGunthasToGunthas`, `gunthasToAcresAndGunthas`, `squareMetresToAcresAndGunthas`, `createFieldId` (uses `crypto.getRandomValues` with timestamp/random fallback so non-HTTPS LAN contexts do not fail on `crypto.randomUUID`), `leafletToGeoJSON` (`[lat, lng] -> [lng, lat]`), `closeRing` (strips duplicate terminal points and closes ring once), and `calculateFieldGeometry` (strips consecutive duplicate clicks from Leaflet Draw, computes Turf geodesic `area` and `centerOfMass`).
* `src/lib/domain/allocation.ts`:
  * Contains legacy `validatePortfolio`, `rebalancePortfolio` (largest-remainder apportionment in integer basis points), and `allocateAcreage`, plus `v0.2.0` helpers `allocatePlotsByGunthas` and `upsertPlotAllocation`.
* `src/lib/domain/soilKit.ts`:
  * `interpretSoilKitReading(input)`: Classifies pH into 5 bands (`< 5.8` strongly acidic, `5.8–6.4` slightly acidic, `6.5–7.5` optimal neutral, `7.6–8.2` moderately alkaline Vertisol, `> 8.2` strongly alkaline), evaluates N (Alkaline $\text{KMnO}_4$) and P (Olsen + molybdenum-blue), plus optional K, Organic Carbon, and Salinity, returning `overallHealth` (`"optimal" | "needs_enrichment" | "critical_amendment"`) and `steps[]`.
* `src/lib/domain/cropRecommendations.ts`:
  * `detectMaharashtraSeason(monthZeroIndexed)`: Maps June–Sept (`5..8`) $\rightarrow$ `Kharif`, Oct–Feb (`9..11, 0..1`) $\rightarrow$ `Rabi`, Mar–May (`2..4`) $\rightarrow$ `Zaid`.
  * `getSeasonalCropRecommendations`: Scores all 6 crops (`0–100`, sorted descending) starting from base `50`: `+25` if crop supports target season (`-25` and `risk = true` if outside season), `-12` and `amend = true` if `soilKitReading.ph` is outside `optimalPhRange`, `+15` for N-fixing (`groundnut`) or `+10` for low-N crops when soil N is `"low"`, and `+15` for high drought tolerance (`-15` and `risk = true` for low drought tolerance) when forecast mean max temp $\ge 35^\circ\text{C}$ and 7-day rain $< 5\text{ mm}$.
* `src/lib/domain/fieldVoice.ts`:
  * `generateFieldVoiceAdvisories`: Evaluates 7 plot-level rules (`heat_vertisol_cracking`, `vegetative_nitrogen_low`, `sowing_phosphorus_low`, `alkaline_lockup_warning`, `flowering_peak_water`, `rabi_cold_night_guard`, `harvest_rain_warning`) + fallback `general_seasonal_guidance`, sorted by priority (`urgent` $\rightarrow$ `action` $\rightarrow$ `tip`).
* `src/lib/domain/irrigation.ts`:
  * Preserves [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm) `calculateIrrigationDemand`, `calculateDailyDripEstimate`, and `calculateSystemRuntime`.
  * Adds `calculateHargreavesEt0({ latitudeDeg, dateIso, tempMinC, tempMaxC })` using solar declination $\delta$, sunset hour angle $\omega_s$, and extraterrestrial radiation $R_a$, plus `resolveDailyEt0` (`"open-meteo"` vs. `"hargreaves-fallback"`).
  * Adds `calculatePhaseWaterBreakdown` across 3 delivery presets (`drip`: 90% eff, `100 L/hr/guntha`; `sprinkler`: 75% eff, `150 L/hr/guntha`; `canal_flood`: 60% eff, `450 L/hr/guntha`) and `simulateDroughtReallocation`.

### 2.4 Edge API Proxy & Providers (`src/lib/api/` & `src/app/api/`)
* `src/lib/api/http.ts` & `src/lib/api/server.ts`: Enforces `POST`-only same-origin requests, streaming byte-capped JSON reading (`readJson`), 4-decimal coordinate rounding (`queryCoordinate`), and SHA-256 in-flight/TTL request coalescing (`cachedRequest`).
* `src/lib/api/providers/openMeteo.ts`: Queries `https://api.open-meteo.com/v1/forecast` (`7` days, `Asia/Kolkata`, `unixtime`) and validates strict hourly (`3600s`) and daily (`86400s` aligned to IST midnight) series alignment.
* `src/lib/api/providers/{nominatim,soilGrids,agmarknet}.ts`: Guarded by `hasSingleProviderAuthority()`, `ENABLE_SOILGRIDS = false`, and `ENABLE_MARKET = false`.

## 3. Known Code-Level Flaws & Loose Ends Discovered in Live `v0.2.0` Audit

When acting as Technical Overseer, keep these **7 verified code-level flaws in the current `v0.2.0` implementation** top of mind so they can be prioritized and fixed:

1. **Hardcoded English in `AlertsCard.tsx` (`src/components/dashboard/AlertsCard.tsx` lines 8–10)**:
   * Although `fieldVoice.ts` generates both `.en` and `.mr` strings for every advisory, `AlertsCard.tsx` renders `{a.headline.en}`, `{a.message.en}`, and `{a.actionLabel.en}` unconditionally instead of selecting `[state.locale]`, and hardcodes the card title `"Balram's Field Voice"` instead of `t(state.locale).voice`.
2. **Plot Selector Keyed by `cropId` Instead of `plotId` in `IrrigationPanel.tsx` (`src/components/irrigation/IrrigationPanel.tsx` lines 25, 34, 66)**:
   * `IrrigationPanel` stores `const [cropId, setCropId] = useState(...)` and looks up the selected plot via `state.cropAllocations.find(item => item.cropId === cropId)`. If a farmer creates two distinct plots with the same crop (e.g., `"Well Plot"` and `"Canal Plot"` both growing `onion` at different stages or sizes), the dropdown cannot distinguish them and always selects the first matching plot. It should select by `plotId`.
3. **Quick `+5 Gunthas` / `−5 Gunthas` Buttons Do Not Recompute `percentage` (`src/components/dashboard/PortfolioCard.tsx` line 23)**:
   * The Acres and Gunthas numeric `<input>` handlers recompute `percentage: total ? Math.round(n / total * 10000) / 100 : plot.percentage`, but the `+5 Gunthas` and `−5 Gunthas` buttons call `updatePlot(plot, { areaGunthas: size + 5 })` without updating `percentage` or checking if total gunthas exceed `totalFarmGunthas`.
4. **Hardcoded `season: "kharif"` in `upsertPlotAllocation()` (`src/lib/domain/allocation.ts` line 72)**:
   * When adding a new plot via `upsertPlotAllocation`, `season` is hardcoded to `"kharif" as const` instead of deriving `MaharashtraCropMatrix[input.cropId].season.toLowerCase()`.
5. **Untranslated Marathi Strings in `soilKit.ts` & `fieldVoice.ts`**:
   * In `src/lib/domain/soilKit.ts` line 15, `add("ph", p[0], p[1], p[2], p[2], p[3], p[3], p[4])` passes English `p[2]` and `p[3]` into both the English and Marathi explanation/action slots, and optional K/Carbon/Salinity steps also pass the English action string for Marathi.
   * In `src/lib/domain/fieldVoice.ts` line 6, `headline.en` is `ruleId.replaceAll("_", " ")` (e.g., `"heat vertisol cracking"`) and `headline.mr` is a generic `"शेतासाठी सूचना"` for all 7 rules instead of distinct, descriptive headlines.
6. **Simplified Drought Reallocation Math (`src/lib/domain/irrigation.ts` lines 91–97)**:
   * `simulateDroughtReallocation` computes water demand using `baseKc` (ignoring the plot's current `lifecycleStage` $K_c$ and ignoring `effectiveRainfallMmPerDay`), and divides the water deficit by a hardcoded `1.05` $K_c$ factor rather than computing the actual water savings between the farmer's highest-$K_c$ crop and a drought-tolerant alternative (`rabi_jowar` / `bajra`).
7. **Concave Polygon Centroid & Unbounded Leaflet Map (`src/lib/domain/geometry.ts` & `src/components/map/FarmMap.tsx`)**:
   * `calculateFieldGeometry` uses `@turf/center-of-mass` without checking whether the centroid falls outside a concave/L-shaped polygon, and `FarmMap.tsx` does not lock `maxBounds` to Maharashtra (`[[15.60, 72.60], [22.00, 80.90]]`). Also, `package.json` still lists `"version": "0.1.0"`.
