<p align="center">
  <img src="public/icon.svg" alt="Balram" width="72" height="72" />
</p>

<h1 align="center">Balram</h1>

<p align="center">
  <strong>Local-first, Marathi-first precision agritech planner for smallholder farmers in Maharashtra.</strong><br/>
  <em>v0.5.0 · Daylight Field Notebook · Local Multi-Farm Profiles</em>
</p>

---

**Balram** is a zero-database, offline-first Next.js 15 web application and interdisciplinary chemistry-plus-software platform built for smallholder farmers (2–10 acres) in Maharashtra, India. All field boundaries, crop plots, soil test readings, check-ins, and cached forecasts live strictly inside the farmer's browser (`IndexedDB`) with zero accounts, zero external tracking, and full English (`en`) & Marathi (`मराठी`) parity.

> **Core Thesis:** *Analytical chemistry generates the soil results; Balram's local-first software translates them into immediate, visual, plain-language field actions.*

---

## Key Capabilities (`v0.5.0`)

* **Growing Path Shell (`/` Single-Route Offline PWA):**
  * Language-first landing (`English` / `मराठी`), a **6-station Setup Journey** (*My Land → Weather → My Soil → My Crops → Balram's Advice → My Roadmap*), a **4-tab Daily Home** (*Today, My Farm, Water, Report*), and a non-destructive read-only **Sample Farm (Pune)** overlay.
  * Compact 56px header with global **`Acres | Gunthas` (`एकर | गुंठे`)** unit toggle and native `<dialog>` **`About & data`** sheet.
* **Local Multi-Farm Profiles**
  * Keep up to six farms per device, each with a unique name of up to 30 Unicode graphemes. Open farms from the header’s native `<dialog>` switcher or the Field Notebook *My Farms* gallery, which shows crop-proportion ribbons, plot counts, area, and setup status.
  * Create a blank farm or save an editable copy of the Pune sample. Rename farms from the gallery or delete one with a seven-second Undo toast that pauses on hover or keyboard focus.
  * Download one v6 backup for all farms. Import a v5 or v6 backup to add farms up to the six-farm limit while keeping existing farms. The app resolves name collisions and reports skipped farms.
  * `PERSISTENCE_VERSION = 6` migrates v0–v5 records. IndexedDB keeps a best-effort safety copy at `balram:legacy-v5` before migration and removes it on the next healthy v6 boot.
* **Spatial Mapping & Constant-Height Interactive `LandBar`:**
  * Hardware-accelerated [Leaflet](https://leafletjs.com/reference.html) `L.canvas()` polygon drawing with Marathi `L.drawLocal` tooltips, topological ring validation, and [Turf.js](https://turfjs.org/docs/api/area) geodesic area conversion (`40 Gunthas = 1 Acre`).
  * Constant-height **56px segmented `LandBar`** (`src/lib/domain/viz/barSegments.ts`) sized proportionally with a 15% touch-safe minimum width, 5 color+pattern fills, crop initials, tap-to-select plot focus, and a collapsible `VizTable` text twin.
* **Station 4 Crop Advisor & Checkout Sidebar:**
  * Soil- and weather-matched crop recommendations with 3-tile **`CropFitTiles`** (*Soil, Water, Sowing* — Good / Fair / Needs help), visible **`Already planted?`** quick chips, a docked Right **`CropCheckoutSheet`** on desktop / native `<dialog>` sheet on mobile, and a **7-second hover/focus-pausable Undo toast** (`ToastHost`).
* **On-Site Chemistry Soil Kit & Live pH What-If Gauges:**
  * Supports the **Balram In-House Chemistry Kit** (1:2.5 soil-water suspension pH, alkaline $\text{KMnO}_4$ Available Nitrogen, Olsen molybdenum-blue Available Phosphorus), **Soil Health Card (`kg/ha`)** classifiers (Subbiah & Asija; Olsen), and commercial rapid kits.
  * Visual **`BulletGauge`** bars (`SoilGauges`) with the Deccan Vertisol pH band (`7.8–8.4`), salinity-gated gypsum advice, and a non-persisted **`Try a different pH`** (`±0.1`) live crop re-ranking simulator.
* **Resilient Weather, Seven-Day Water Ribbon & Irrigation Planner:**
  * Daily [Open-Meteo](https://open-meteo.com/en/docs) Edge proxy with 4-decimal privacy rounding, Hargreaves-Samani $ET_0$ fallback, and an automatic 7-day Maharashtra seasonal baseline so planning tools never stall offline.
  * Interactive **7-day `WaterRibbon`** with dashed/dotted provenance strokes, heavy-rain fertiliser caution, native `<dialog>` day details, and an illustrative `100% / 75% / 50% / 25%` rain what-if.
  * Offline-capable [FAO-56](https://www.fao.org/4/x0490e/x0490e00.htm) phase-wise weekly water planner and illustrative drought reallocation simulator.
* **Field Voice, Botanical Stage Rail, Picture-Card Check-Ins & 12-Month Crop Calendar:**
  * Conversational bilingual **Balram's Field Voice** advisories with expandable *"Why this advice?"* triggers.
  * 4-step botanical **`StageRail`** with post-hydration weeks-to-next estimates, 3-tap illustrated **2×2 Stage / 3×2 Event** `CheckInCard`, **`TodaysSky`** panoramic SVG hero, and 12-month **`CropCalendar`** SVG timeline.
* **Coordinate-Free Farm Card PNG & A4 Print Report:**
  * Share the active farm as a coordinate-free **1080×1080 Farm Card PNG** (offline SVG → Canvas → Web Share / download fallback), or print its bilingual A4 **`FarmReport`** with static soil, water, and calendar visuals.

---

## Architecture & Tech Stack

| Layer | Implementation |
| :--- | :--- |
| **Framework & Runtime** | Next.js `15.5` App Router (single static `"/"` shell + `POST`-only Edge routes), React `19`, TypeScript `5.9` |
| **Styling & Motion** | Tailwind CSS `3.4.17` (`theme.extend`), `src/styles/tokens.css` & `tokens.json` (light-mode outdoor WCAG AA), pure-CSS `src/styles/motion.css` (`@starting-style`, `transform`/`opacity` only, instant `prefers-reduced-motion`) |
| **State & Storage** | Vanilla Zustand `5` + `useSyncExternalStore` (deterministic SSR snapshot), IndexedDB (`idb` `8.0`, 4s timeout + memory fallback), generation-guarded `AbortController` |
| **Local Multi-Farm Profiles** | `src/components/profiles/` for naming, the Field Notebook gallery, crop-proportion ribbons, and the native dialog switcher. `src/lib/domain/profiles.ts` exposes the pure profile operations. Persistence v6 stores the active farm, stashed farms, and profile metadata atomically under `balram:farm`. Includes v0–v5 migrations, the temporary `balram:legacy-v5` safety copy, and additive v5/v6 backup import. |
| **GIS & Validation** | Leaflet `1.9` (`L.canvas()`), `react-leaflet-draw`, `@turf/area`, `@turf/center-of-mass`, Zod `3.25` |
| **Security & Offline PWA** | Build-time SHA-256 inline-script CSP finalizer (`scripts/finalize-release.mjs`) + allowlisted Service Worker (`public/sw.js`, 40 approved offline files) |
| **Testing** | Zero-dependency Node 22 native test runner (`npm test`, `node:test`) covering domain math, schema migrations, multi-farm persistence and backup flows, i18n parity, motion guardrails, and visual engines |

---

## Local Development & Verification

```bash
# Install dependencies (Node 22.x)
npm install

# Start development server
npm run dev

# Run full release verification gate
npm run typecheck
npm test
npm run build
git diff --check
```

> **Vercel Deployment Note:** Deploy with **Node.js `22.x`** and Build Command **`npm run build`** (never bare `next build`, so `scripts/finalize-release.mjs` injects static HTML CSP hashes and generates `public/sw.js`). No external API keys or database environment variables are required.
