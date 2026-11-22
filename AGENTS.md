# AGENTS.md — System Architect & Coding Agent Contract for Balram (v0.5.0)

This document is the authoritative engineering specification and operational contract for AI coding agents (Codex, Cursor, Claude, and automated subagents) working on **Balram** (`/Users/advaet/Projects/Balram`, currently **`v0.5.0`**, **`PERSISTENCE_VERSION = 6`**). Read this file completely before modifying source code, schemas, styles, or build scripts.

---

## 1. Eight Non-Negotiable Architectural Invariants

1. **Invariant 1 — Strict SSR/Client Hydration Parity (`useSyncExternalStore`):**
   * Never read `window`, `localStorage`, `indexedDB`, `navigator.onLine`, `matchMedia`, `Date.now()`, or `new Date()` during initial React render.
   * Consume state exclusively via `useBalramStore(selector)` (`skipHydration: true`, deterministic `serverSnapshot = createEmptyFixture()`). Read post-hydration dates through `useNow()` (`src/lib/ui/useNow.ts`, returning `null` during SSR).
2. **Invariant 2 — Coordinate Axis Anti-Corruption (`[Lng, Lat]` vs. `[Lat, Lng]`):**
   * Persisted `CoordinateSchema`, Turf.js, and Edge provider payloads use GeoJSON `[longitude, latitude]`. Leaflet UI components use `[latitude, longitude]`. Always convert rings through `leafletToGeoJSON()` / `calculateFieldGeometry()` in `src/lib/domain/geometry.ts`.
3. **Invariant 3 — Generation-Guarded Async State:**
   * Changing `fieldGeometry` calls `invalidate()` in `src/store/useBalramStore.ts`, incrementing `generation`, aborting in-flight weather/soil `AbortController`s, and clearing `weatherSnapshot` / `soilSnapshot` while preserving `soilKitReading`, `soilSkipped`, `setupCompletedAt`, `checkIns`, `cropAllocations`, `locale`, and `landUnit`.
4. **Invariant 4 — Canonical Gunthas & Display-Only Land Unit Toggle:**
   * Canonical storage is square metres (`fieldGeometry`) and gunthas (`cropAllocations`, `1 Acre = 40 Gunthas`). `state.landUnit` (`"acres" | "gunthas"`, default `"acres"`) controls display (`formatArea`) and input (`AreaInput`) only—never mutating stored areas or triggering `invalidate()`. Plot mutations must route through `allocation.ts` / `checkout.ts` (never writing `percentage` directly).
5. **Invariant 5 — Explicit Data Provenance & Honest Fallbacks:**
   * Every data-bearing figure and visual carries a provenance cue (solid = farmer/kit, dashed = forecast, dotted = typical-for-season baseline, hatched = sample) + `ProvenanceBadge`. Hypothetical what-if states (pH trial, rain scale `< 100%`, drought simulator) are transient React state only, never persisted, and clearly marked illustrative.
6. **Invariant 6 — Privacy & Edge Security Boundary:**
   * Edge routes (`src/app/api/*/route.ts`) are `POST`-only, verify `x-forwarded-host` / same-origin, read streaming byte-capped JSON (`readJson`), and round outbound coordinates to 4 decimals (`~11 m`). Share text (`shareSummary.ts`) and Farm Card PNGs (`farmCardSvg.ts`) must **never** include coordinates or polygon geometry.
7. **Invariant 7 — Single-Route Offline Shell, Zero New Deps & CSP Finalizer:**
   * Keep Landing, Name your farm, My Farms, Setup Journey, and Daily Home inside `"/"` so `scripts/finalize-release.mjs` hashes all inline scripts and `public/sw.js` caches the exact 40-file static shell offline. Do **not** add npm dependencies, external CDN fonts/scripts, or `style={{` SSR attributes.
8. **Invariant 8 — Full Marathi (`मराठी`) Coverage & Pure-CSS Motion Guardrails:**
   * Every user-visible string has matching `en` and `mr` keys in `src/config/i18n.ts` (`tests/i18n.test.ts` enforces parity and zero unapproved Latin text in `mr`).
   * All motion in `src/styles/motion.css` must reference `--dur-*` / `--ease-*` tokens (zero literal `ms`/`s`/`cubic-bezier(`), animate GPU-composited `transform`/`opacity` (+ sanctioned 24px SVG `stroke-dashoffset`), contain zero `will-change` / `transition: all` / `backdrop-filter`, and collapse instantaneously under `prefers-reduced-motion: reduce` (`tests/motion-tokens.test.ts`).

---

## 2. Live Codebase Map (`v0.5.0`)

| Area | Key Files |
| :--- | :--- |
| **Tokens & Motion** | `src/styles/tokens.css`, `src/styles/tokens.json`, `src/styles/motion.css`, `src/app/globals.css`, `tailwind.config.ts` |
| **Schemas & Store** | `src/types/domain.ts`, `src/store/useBalramStore.ts` (`PERSISTENCE_VERSION = 6`, v0–v5 migrations, read-only Sample Farm overlay), `src/lib/storage/{db,backup}.ts`, `src/mocks/fixtures.ts` |
| **Local Multi-Farm Profiles** | `src/lib/domain/{profiles,profileNames,profileMigration,profileOperations}.ts`, `src/components/profiles/*`, `tests/profiles-{domain,store,ui}.test.ts` |
| **Core Domain** | `src/config/{cropMatrix,i18n,providers}.ts`, `src/lib/domain/{geometry,allocation,landUnits,checkout,soilKit,cropRecommendations,fieldVoice,irrigation,journey,roadmap,checkIns}.ts` |
| **Pure Visual Engines** | `src/lib/domain/viz/{barSegments,gaugeZones,waterRibbon,cropFit,calendarLayout,skyCondition,stageProgress}.ts` (ZERO React / store / clock) |
| **Pure Visual Primitives** | `src/components/viz/{ProvenanceStroke,VizTable,VizCaption,StageIllustration,BulletGauge,WaterDayColumn,StageRail,SkyScene,CropFitTiles,CalendarRibbon}.tsx` (ZERO `useBalramStore` imports) |
| **UI Primitives & Shell** | `src/components/ui/{AreaInput,LandBar,LandUnitToggle,ProvenanceBadge,RadioChoices,SectionDisclosure,ShareSummaryButton,FarmCardShareButton,StationIcon,ToastHost}.tsx`, `src/components/app-shell/{AppShell,Header,Footer,AboutDialog,OfflineSupport,PrivacyNotice,SkipLink}.tsx` |
| **Feature Screens** | `src/components/journey/{JourneyShell,WeatherStation,RoadmapList,CropCalendar}.tsx`, `src/components/home/{DailyHome,TodaysSky,CheckInCard,BackupControls}.tsx`, `src/components/dashboard/{PortfolioCard,CropAdvisorCard,SoilCard,SoilGauges,AlertsCard,WeatherCard,Card}.tsx`, `src/components/crops/CropCheckoutSheet.tsx`, `src/components/irrigation/{IrrigationPanel,WaterRibbon}.tsx`, `src/components/map/{MapClient,FarmMap}.tsx`, `src/components/report/FarmReport.tsx` |
| **Helpers & Tests** | `src/lib/ui/{format,alertStatus,farmRoadmap,shareSummary,farmCardSvg,useCssVar,useNow}.ts`, `tests/*.test.ts` (Node 22 native test runner) |

### Persistence v6 contract

* Keep profile metadata, `activeProfileId`, the active farm slice, and `farmStash` in the single `balram:farm` record. Commit each profile mutation and additive import atomically in one store update and one IndexedDB write. `locale` and `landUnit` are shared across farms. Enforce the six-farm cap and validate unique names of up to 30 graphemes using the profile domain functions.
* Keep migration from v0–v5 pure. During persistent hydration, save the original legacy envelope once to `balram:legacy-v5` on a best-effort basis before the v6 write. Skip the safety copy in memory-only mode. Remove it only after the next successful hydration of an already-v6 record.
* Keep Sample Farm read-only. Editable sample copies are independent profiles with a new field ID and cleared sample weather. Import v5 and v6 backups additively within the six-farm cap.

---

## 3. Excluded Scope Guardrails
Do **not** implement automated OCR lab report scanners, camera RGB soil/strip color estimation, image-based ML pest/disease classifiers, or live Agmarknet/SoilGrids scraping (`ENABLE_MARKET = false`, `ENABLE_SOILGRIDS = false`).

---

## 4. Mandatory Pre-Commit Verification Gate

Every change must exit `0` across all four checks:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Confirm `scripts/finalize-release.mjs` prints `Release: hashed static script policies; 40 approved offline application files.` and no `.DS_Store` or `__MACOSX` artifacts exist in the checkout or are staged.
