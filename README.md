# Balram — Local-First Precision Agritech Platform for Maharashtra

**Balram** (`v0.1.0`) is a serverless, zero-database, offline-first agricultural planning and irrigation decision platform built for smallholder farmers across Maharashtra, India. Engineered around the physical realities of Maharashtra's deep black Vertisol (black cotton) soils, multi-season cropping patterns (*Kharif*, *Rabi*, *Zaid*, and *Perennial*), and intermittent rural 3G/4G cellular connectivity, Balram keeps all farm boundaries, crop portfolios, irrigation parameters, and last-known environmental snapshots strictly inside the farmer's browser via IndexedDB.

---

## 1. Core Vision & Real-World Problem Statement

Smallholder farmers in Maharashtra operating 2-to-10-acre plots face three compounding challenges when using conventional cloud-based agritech tools:

1. **Spatial & Micro-Climatic Mismatch**: Numerical weather prediction grids from models like [ECMWF ERA5 via Open-Meteo](https://open-meteo.com/en/docs/ecmwf-api) operate at 9 km to 15 km resolution, whereas farm plots span only a few acres and experience localized phenomena such as overnight radiative cooling and valley thermal inversions.
2. **Intermittent Rural Connectivity**: Field operations frequently occur in dead zones or unstable 3G environments where cloud-dependent dashboards fail mid-operation and heavy SVG DOM trees freeze low-memory mobile devices.
3. **Opaque "Black-Box" Prescriptions**: Uncalibrated cloud advisories often guess emitter flow rates or treat shallow surface soil moisture models as root-zone measurements in high-bulk-density Vertisol soils, risking severe under- or over-irrigation.

Balram solves these challenges by combining **geodesic client-side GIS** ([Leaflet](https://leafletjs.com/reference.html) HTML5 Canvas + [Turf.js](https://turfjs.org/docs/api/area)), **deterministic FAO-56 water-balance mathematics** ([FAO Irrigation and Drainage Paper 56](https://www.fao.org/4/x0490e/x0490e00.htm)), and a **hydration-safe, local-first state architecture** ([Zustand](https://www.npmjs.com/package/zustand) + [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) + IndexedDB) behind a privacy-preserving Next.js 15 Edge proxy.

---

## 2. Technology Stack & Dependencies

| Layer | Technology / Package | Version | Architectural Role |
| :--- | :--- | :--- | :--- |
| **Framework & Routing** | `next` (App Router + Edge API Routes) | `^15.5.0` | Static application shell with stateless Edge provider routes (`/api/weather`, `/api/soil`, `/api/geocode`, `/api/market`) |
| **UI Runtime** | `react` / `react-dom` | `^19.0.0` | Component tree with strict `useSyncExternalStore` SSR/CSR hydration parity |
| **Styling & Print** | `tailwindcss` / `postcss` | `^3.4.17` | High-contrast daylight theme (`#1E5631` forest, `#FFBF00` amber), enforced `48×48px` outdoor touch targets, and A4 `@media print` report rules |
| **Client State & Persistence** | `zustand` + `idb` | `^5.0.0` / `^8.0.3` | Vanilla store with serialized IndexedDB persistence queue, 4-second open timeout, and session-memory fallback |
| **Spatial Canvas** | `leaflet` + `react-leaflet` + `react-leaflet-draw` | `^1.9.4` / `^5.0.0` / `^0.21.0` | Hardware-accelerated `L.canvas()` polygon drawing and vertex editing without SVG DOM bloat |
| **Geodesic Mathematics** | `@turf/area`, `@turf/center-of-mass`, `@turf/helpers` | `^7.4.0` | WGS84 geodesic area calculation ($\text{m}^2 \rightarrow \text{Acres}$) and polygon centroid extraction |
| **Contract Validation** | `zod` | `^3.25.0` | Runtime validation of domain models, topological polygon rings, API payloads, and IndexedDB storage envelopes |

---

## 3. System Architecture & Data Flow

### 3.1 Spatial Anti-Corruption & Topological Ring Validation
* **Axis-Inversion Middleware (`src/lib/domain/geometry.ts`)**: [Leaflet](https://leafletjs.com/reference.html) outputs vertex coordinates as `[latitude, longitude]` (`[Y, X]`), whereas GeoJSON and [Turf.js](https://turfjs.org/docs/api/area) require `[longitude, latitude]` (`[X, Y]`). `leafletToGeoJSON()` validates bounds (`lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`), flips the axes, and `closeRing()` guarantees GeoJSON ring closure (`4` to `1001` vertices).
* **Topological Integrity (`src/types/domain.ts`)**: Before any polygon reaches Turf.js, `FieldGeometrySchema` executes 2D vector cross-product checks (`cross`, `onSegment`, `intersects`) to reject self-intersecting ("bowtie") polygons, overlapping collinear edges, duplicate vertices, antimeridian crossings, and zero-area rings.
* **Geodesic Area Conversion**: Turf's `area()` computes spherical surface area in square meters, which is converted to Indian/international acres using `SQUARE_METRES_PER_ACRE = 4046.8564224`.

### 3.2 Unidirectional State Machine & SSR Hydration Safety
* **Zero Hydration Mismatch (`src/store/useBalramStore.ts`)**: Next.js 15 Server-Side Rendering renders against a deterministic `serverSnapshot` (`createEmptyFixture()`). On the client, `useBalramStore` binds to the vanilla Zustand store via [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore) with `skipHydration: true`, preventing React hydration errors before IndexedDB rehydration completes.
* **Write-Gated IndexedDB Queue (`src/lib/storage/db.ts`)**: `writesEnabled` remains `false` until `store.persist.rehydrate()` finishes and validates the saved `PersistedFarmSchema` (`PERSISTENCE_VERSION = 2`). If IndexedDB is blocked by an older tab or unavailable in private browsing, `createIndexedDBStorage()` automatically switches to an in-memory `Map` (`mode: "memory"`) so the farmer never loses active session edits.
* **Generation-Guarded Async Requests**: Modifying `fieldGeometry` increments an internal monotonic `generation` counter, aborts any in-flight `AbortController` for weather or soil fetches, and atomically resets downstream telemetry (`weatherSnapshot: null`, `soilSnapshot: null`) so stale network responses can never overwrite an updated farm boundary.

### 3.3 Agronomic Domain Models
* **Exact Basis-Point Crop Allocation (`src/lib/domain/allocation.ts`)**: Multi-crop portfolios are validated and rebalanced using integer basis points (`10,000 bps = 100.00%`) and **largest-remainder apportionment**. Adjusting one crop's percentage proportionally scales the remaining crops without IEEE-754 floating-point drift.
* **Maharashtra Crop Matrix (`src/config/cropMatrix.ts`)**: Defines baseline parameters for regional crops on Vertisol soils:

| Crop ID | Crop Name | Season | Mid-Season $K_c$ | Vertisol Min Moisture ($\text{m}^3/\text{m}^3$) | Max Air Temp ($^\circ\text{C}$) | Frost Sensitive | Baseline Drip Efficiency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sugarcane` | Sugarcane | Perennial | `1.25` | `0.38` | `38.0` | `false` | `0.90` |
| `rabi_jowar` | Rabi Jowar | Rabi | `0.75` | `0.18` | `35.0` | `false` | `0.85` |
| `onion` | Onion | Rabi | `1.05` | `0.28` | `32.0` | `true` | `0.90` |
| `bajra` | Bajra | Kharif | `0.85` | `0.12` | `40.0` | `false` | `0.85` |
| `pomegranate` | Pomegranate | Perennial | `0.65` | `0.25` | `42.0` | `false` | `0.95` |
| `groundnut` | Groundnut | Kharif | `0.95` | `0.20` | `36.0` | `false` | `0.85` |

* **FAO-56 Irrigation Runtime Calculus (`src/lib/domain/irrigation.ts`)**:
  - Crop water demand: $ET_c = K_c \times ET_0$ ($\text{mm/day}$), based on [FAO-56 methodology](https://www.fao.org/4/x0490e/x0490e00.htm).
  - Net irrigation depth: $D_{\text{net}} = \max(0, ET_c - P_{\text{eff}})$ ($\text{mm/day}$).
  - Volumetric conversion: $1\text{ mm}$ over $1\text{ m}^2 = 1\text{ Litre}$, giving $V_{\text{net}} = D_{\text{net}} \times A_{\text{m}^2}$.
  - Gross volume and runtime: $V_{\text{gross}} = \frac{V_{\text{net}}}{\eta_{\text{application}}}$, and $\text{Runtime (min)} = \frac{V_{\text{gross}}}{Q_{\text{system (L/hr)}}} \times 60$.

### 3.4 Edge API Gateway, Privacy & Security Hardening
* **Privacy-Preserving Coordinate Rounding (`src/lib/api/server.ts`)**: All outbound coordinates are rounded to `COORDINATE_DECIMALS = 4` (`~11 m` resolution) before querying external providers or computing the SHA-256 in-memory request coalescing key (`cachedRequest`). Full farm polygons and personal farm profiles never leave the browser.
* **Streaming Byte-Limited HTTP Client (`src/lib/api/http.ts`)**: `readJson()` reads `ReadableStream` chunks incrementally and aborts immediately if decompressed bytes exceed `maxBytes` (`4 KB` for incoming Edge POST bodies, `1 MB` for upstream provider responses).
* **Build-Time CSP & Service Worker Finalizer (`scripts/finalize-release.mjs`)**: Running `npm run build` executes `next build` followed by `node scripts/finalize-release.mjs`, which:
  1. Computes `sha256-...` hashes of every prerendered inline bootstrap `<script>` in `.next/server/app/**/*.html` and injects a strict `<meta data-balram-csp="true" http-equiv="Content-Security-Policy">` tag.
  2. Hashes all static build assets (`.next/static/**/*` and approved `public/` shell files) to generate a deterministic, content-addressed Service Worker (`public/sw.js`).

---

## 4. Directory Structure

```text
balram/
├── public/
│   ├── icons/                      # PWA 192px, 512px, and maskable icons
│   ├── icon.svg                    # Vector app icon
│   ├── manifest.json               # PWA web app manifest
│   ├── offline.html / offline.css  # Fallback offline shell
│   └── sw.js                       # Build-generated Service Worker (via finalize-release.mjs)
├── scripts/
│   ├── finalize-release.mjs        # Post-build HTML CSP script hasher & Service Worker generator
│   └── service-worker.js           # Service Worker template with strict same-origin allowlist
├── src/
│   ├── app/
│   │   ├── (app)/page.tsx          # Main workspace layout (MapClient, IrrigationPanel, Dashboard, FarmReport)
│   │   ├── api/
│   │   │   ├── geocode/route.ts    # POST-only Edge route -> Nominatim place search
│   │   │   ├── market/route.ts     # Edge route -> Agmarknet (currently disabled)
│   │   │   ├── soil/route.ts       # POST-only Edge route -> ISRIC SoilGrids (currently disabled)
│   │   │   └── weather/route.ts    # POST-only Edge route -> Open-Meteo 7-day forecast
│   │   ├── globals.css             # Tailwind layers, 48px touch rules, Leaflet overrides, A4 print CSS
│   │   └── layout.tsx              # Root HTML shell, Header, OfflineSupport, PrivacyNotice
│   ├── components/
│   │   ├── app-shell/              # Header.tsx, OfflineSupport.tsx, PrivacyNotice.tsx
│   │   ├── dashboard/              # Dashboard.tsx, WeatherCard.tsx, SoilCard.tsx, PortfolioCard.tsx, AlertsCard.tsx, Card.tsx
│   │   ├── irrigation/             # IrrigationPanel.tsx (Runtime calculator form)
│   │   ├── map/                    # MapClient.tsx (dynamic SSR-disabled wrapper + coordinate forms), FarmMap.tsx
│   │   └── report/                 # FarmReport.tsx (Printable A4 summary table and provenance audit)
│   ├── config/
│   │   ├── cropMatrix.ts           # MaharashtraCropMatrix & CROP_RULE_PROVENANCE
│   │   └── providers.ts            # Upstream endpoints, TTLs, rate limits, and authority checks
│   ├── lib/
│   │   ├── api/                    # http.ts, server.ts, client.ts, and providers/{openMeteo,soilGrids,nominatim,agmarknet}.ts
│   │   ├── domain/                 # geometry.ts, allocation.ts, irrigation.ts
│   │   ├── storage/                # db.ts (IndexedDB wrapper & serialized write queue)
│   │   └── ui/                     # format.ts (IST date/time and en-IN number formatting)
│   ├── mocks/
│   │   └── fixtures.ts             # Deterministic empty and Pune sample farm fixtures
│   ├── store/
│   │   └── useBalramStore.ts       # Vanilla Zustand store, persistence migrations, useSyncExternalStore hook
│   └── types/
│       ├── api.ts                  # Discriminated union ApiResult<T> schemas
│       └── domain.ts               # Core Zod schemas (PersistedFarmSchema v2, FieldGeometrySchema, WeatherSnapshotSchema)
├── next.config.ts                  # Security headers, CSP, and cache-control rules
├── package.json                    # Scripts and dependencies
├── RELEASE.md                      # Operational release contract
├── tailwind.config.ts              # Custom palette and typography tokens
└── tsconfig.json                   # Strict TypeScript configuration
```

---

## 5. Current Project Status (`v0.1.0`) & Known Architectural Gaps

While the `v0.1.0` codebase establishes a rock-solid security, storage, and mathematical foundation, an architectural audit comparing the codebase against the original research blueprint (`balram_agritech_app_research.md`) identified six high-priority gaps scheduled for upcoming development phases:

1. **Offline & Stale-Data Lockout in `IrrigationPanel.tsx`**:
   * *Current State*: `IrrigationPanel.tsx` disables calculation whenever `state.connection === "offline"` or `state.weatherStale === true`, and forces the farmer to manually enter $K_c$, system flow, and efficiency from scratch (leaving `calculateDailyDripEstimate()` in `src/lib/domain/irrigation.ts` unused).
   * *Target Evolution*: Allow offline/stale runtime calculation using the cached `weatherSnapshot` in IndexedDB (flagged with a clear provenance warning badge), pre-fill stage-adjusted $K_c$ and drip efficiency from `MaharashtraCropMatrix`, and expose a guided **Emitter Density Mode** ($\text{Emitters/Acre} \times \text{L/hr}$) alongside **Measured Block Flow Mode**.
2. **Discarded Hourly Telemetry & Missing Frost/Thermal Hazard Engine**:
   * *Current State*: `src/lib/api/providers/openMeteo.ts` fetches hourly `soil_temperature_6cm`, `temperature_2m`, and `soil_moisture_0_to_1cm` from [Open-Meteo](https://open-meteo.com/en/docs), but `WeatherCard.tsx` only commits `result.data.snapshot` (`daily` array) to the store, discarding the hourly series and omitting `cloud_cover`. `AlertsCard.tsx` only displays data-availability checks.
   * *Target Evolution*: Add `cloud_cover` and surface soil temperature to the Open-Meteo query, compute daily/overnight micro-climate hazard summaries (radiative cooling frost inversion where $T_{\text{soil}} \le 4.0^\circ\text{C}$, $T_{2\text{m}} - T_{\text{soil}} \ge 1.5^\circ\text{C}$, and $\text{cloudCover} < 20\%$ at night, plus crop thermal stress against `maxAirTemp`), and surface actionable advisories in `AlertsCard.tsx`.
3. **Missing Hargreaves-Samani $ET_0$ Fallback**:
   * *Current State*: If Open-Meteo returns `null` for `et0_fao_evapotranspiration` (as demonstrated on Day 3 of `src/mocks/fixtures.ts`), runtime calculation fails completely.
   * *Target Evolution*: Implement the empirical Hargreaves-Samani equation ($ET_0 = 0.0023 \times R_a \times (T_{\text{mean}} + 17.8) \times \sqrt{T_{\text{max}} - T_{\text{min}}}$) using latitude-derived extraterrestrial radiation ($R_a$) as a deterministic client-side fallback when provider $ET_0$ is null.
4. **Disabled Edge Providers (`Nominatim` & `SoilGrids`) on Vercel**:
   * *Current State*: `hasSingleProviderAuthority()` in `src/config/providers.ts` returns `false` on Vercel/Edge runtimes because per-instance memory cannot guarantee global 1 req/sec rate limits for [OpenStreetMap Nominatim](https://operations.osmfoundation.org/policies/nominatim/) or [ISRIC SoilGrids](https://soilgrids.org/). Furthermore, `/api/geocode` is not wired to any UI search input.
   * *Target Evolution*: Bundle a static, offline-ready Maharashtra District & Taluka coordinate gazetteer in the client for instant zero-network place lookup, and optionally back live provider rate-limiting with a shared atomic store if live geocoding/soil lookups are enabled.
5. **Concave Polygon Centroid Bias & Map Bounding Box**:
   * *Current State*: `calculateFieldGeometry()` in `src/lib/domain/geometry.ts` uses `@turf/center-of-mass`, which can place the query point outside an L-shaped or concave farm boundary, and `FarmMap.tsx` does not lock `maxBounds` to Maharashtra (`[[15.60, 72.60], [22.00, 80.90]]`).
   * *Target Evolution*: Enforce Maharashtra `maxBounds` on the Leaflet container and add a point-in-polygon check that falls back to a guaranteed interior point when `centerOfMass` falls outside a concave ring.
6. **Marathi (`mr`) Localization**:
   * *Current State*: `FarmProfileSchema` supports `locale: z.enum(["en", "mr"])`, but all UI strings are currently hardcoded in English.
   * *Target Evolution*: Introduce a lightweight, zero-dependency `en`/`mr` dictionary bound to `farmProfile.locale`.

---

## 6. Local Development, Verification & Build Commands

```bash
# 1. Install dependencies
npm install

# 2. Run strict TypeScript verification
npm run typecheck

# 3. Start local development server
npm run dev

# 4. Build production bundle + execute release finalizer (CSP hashes & Service Worker)
npm run build

# 5. Serve production build locally
npm run start
```

> **Release Note**: Always build using `npm run build` (which runs `next build && node scripts/finalize-release.mjs`). Never deploy an unfinalized `.next` build or reuse `public/sw.js` across builds, as `finalize-release.mjs` injects per-file SHA-256 inline script CSP hashes and binds `public/sw.js` to the exact build asset manifest.
