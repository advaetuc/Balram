# AGENTS.md — Balram Engineering Contract (v0.3.2)

This repository is Balram, a local-first, zero-database farm planning application for smallholder farmers in Maharashtra. This file records the current v0.3.2 architecture and must be read before changing schemas, domain logic, UI, provider routes, storage, or release scripts. `BALRAM_V0_3_2_UX_BLUEPRINT.md` defines the v0.3.2 product flow; prompt files and handoff notes are task-specific reference material, not permission to perform unrelated work.

## Non-negotiable invariants

1. **SSR and hydration parity:** Do not read browser globals, browser storage, `navigator.onLine`, or wall-clock time directly during initial React render. Consume application state through `useBalramStore` (`useSyncExternalStore`) and preserve deterministic `createEmptyFixture()` server snapshots. Keep Zustand `skipHydration: true`; do not enable IndexedDB writes until rehydration resolves.
2. **Coordinate order:** Persisted domain coordinates, GeoJSON, Turf, and provider cache keys use `[longitude, latitude]`. Leaflet and user-facing latitude/longitude controls use `[latitude, longitude]`. Convert through `leafletToGeoJSON()` and `calculateFieldGeometry()`; never persist raw Leaflet tuples.
3. **Async generation guards:** A `fieldGeometry` change invalidates and aborts active weather/soil requests and clears derived snapshots. Every async commit must verify the request identity, signal, generation, and serialized field key.
4. **Land and allocation math:** Maharashtra uses 40 Gunthas per Acre and `101.17141056 m²` per Guntha. Named plots may leave land unassigned. Percentages remain two-decimal basis-point values and must not exceed 100%. Lifecycle stages map to FAO growth stages through the shared helpers in `src/types/domain.ts`.
5. **Provenance and honest fallbacks:** Distinguish farmer-entered records, physical soil kit results, modeled weather, deterministic Hargreaves calculations, Maharashtra seasonal baseline values, and sample fixtures. Preserve missing provider values as `null`; pair agronomic values with clear meaning and provenance. A planning fallback is not a field measurement.
6. **Privacy and provider boundary:** API routes are POST-only, reject cross-site submissions, validate same-origin requests against the forwarded public host where present, and bound request bodies with `readJson`. Round provider coordinates with `queryCoordinate()` (`COORDINATE_DECIMALS = 4`). Never send farm names, personal field IDs, full boundaries, or soil kit readings to providers or shared server memory.
7. **Release finalizer:** Keep the strict CSP and service-worker contract in `next.config.ts`, `scripts/finalize-release.mjs`, and `scripts/service-worker.js`. Avoid inline handlers and unapproved origins. Production builds must run `npm run build` so CSP hashes and `public/sw.js` are synchronized.
8. **Persistence compatibility:** `PERSISTENCE_VERSION = 4` in `src/store/useBalramStore.ts`. Preserve the v0–v3 migration path and existing persisted v4 fields unless a separately specified migration is approved by the product blueprint.
9. **One-route offline shell:** Journey and Daily Home views are state-driven within `/`; do not split them into URL routes without revisiting the root-only offline navigation contract.
10. **Sample Farm is read-only:** Sample data is illustrative and isolated from the saved farm. Do not export it as a real farm or let sample edits persist.

## Current module map

| Area | Files and responsibilities |
| --- | --- |
| Domain contracts and store | `src/types/domain.ts` (Zod schemas and lifecycle mapping); `src/store/useBalramStore.ts` (Zustand, v4 persistence, migration, hydration, async request guards, check-ins, sample overlay) |
| Land and crop planning | `src/lib/domain/geometry.ts` (axis conversion, geometry and Acre/Guntha units); `src/lib/domain/allocation.ts` (basis points and plot allocation); `src/lib/domain/checkout.ts` (ephemeral crop checkout draft, land presets, validation, atomic conversion); `src/config/cropMatrix.ts` (crop, season, Kc, soil, and sowing guidance) |
| Agronomic engines | `src/lib/domain/soilKit.ts`, `cropRecommendations.ts`, `fieldVoice.ts`, `irrigation.ts`, `journey.ts`, `roadmap.ts`, and `checkIns.ts` (pure interpretation, recommendations, estimates, journey status, actions, and check-in cadence) |
| State-driven UI | `src/app/(app)/page.tsx`; `src/components/app-shell/AppShell.tsx`, `Header.tsx`, `PrivacyNotice.tsx`, `OfflineSupport.tsx`; `src/components/journey/JourneyShell.tsx`, `RoadmapList.tsx`, `WeatherStation.tsx`; `src/components/home/DailyHome.tsx`, `CheckInCard.tsx`, `BackupControls.tsx` |
| Planning UI | `src/components/dashboard/Dashboard.tsx`, `WeatherCard.tsx`, `SoilCard.tsx`, `PortfolioCard.tsx`, `CropAdvisorCard.tsx`, `AlertsCard.tsx`, `Card.tsx`; `src/components/crops/CropCheckoutSheet.tsx` (v0.3.2 planned checkout UI); `src/components/irrigation/IrrigationPanel.tsx`; `src/components/map/MapClient.tsx`, `FarmMap.tsx` |
| Report and UI helpers | `src/components/report/FarmReport.tsx`; `src/components/ui/ProvenanceBadge.tsx`, `StationIcon.tsx`, `ShareSummaryButton.tsx`; `src/lib/ui/format.ts`, `farmRoadmap.ts`, `alertStatus.ts`, `shareSummary.ts`; `src/config/i18n.ts` |
| Storage and providers | `src/lib/storage/db.ts` (IndexedDB adapter), `backup.ts` (validated local JSON backups); `src/lib/api/client.ts`, `http.ts`, `origin.ts`, `server.ts`, `providers/*`; POST routes live in `src/app/api/*/route.ts` |
| Release and tests | `scripts/finalize-release.mjs`, `scripts/service-worker.js`, `next.config.ts`, `public/sw.js`; tests run via Node's built-in `node:test` in `tests/*.test.ts` |

The v0.3.2 UX direction is specified in `BALRAM_V0_3_2_UX_BLUEPRINT.md`. Phase 1 adds the pure checkout domain engine and tests; do not implement the later React UI phases unless they are explicitly requested.

## Accessibility and presentation

- Interactive controls use at least 48×48 CSS pixels, including mobile map controls.
- Use the established `forest`, `amber`, `sky`, `daylight`, and `ink` palette tokens.
- Preserve bilingual English/Marathi content and A4 print behavior. Interactive controls in reports remain `print:hidden`.

## Required verification before completion

Run all four checks and report their actual results:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Confirm the build finalizer reports `Release: hashed static script policies; <N> approved offline application files.` with exit code zero. Do not install packages or contact external services unless the specific task requires it. Ensure no `.DS_Store` or `__MACOSX` artifacts are introduced.
