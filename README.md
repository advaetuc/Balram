# Balram v0.2.0 — Maharashtra farm planning

Balram is a local-first, zero-database farm planning app for Maharashtra. It combines field mapping, Acres and Gunthas plot management, crop planning, on-site soil-kit records, weather context, irrigation estimates, and printable reports. English and Marathi (`मराठी`) are available from the header.

## v0.2.0 features

- **Local persistence:** Zustand state is hydrated from IndexedDB (`PERSISTENCE_VERSION = 3`). Farm boundaries, plots, soil-kit readings, locale, and last-good provider snapshots remain in the browser. A session-memory fallback keeps edits available when IndexedDB cannot be used.
- **Field and plot management:** Draw or enter a field boundary, with GeoJSON stored in `[longitude, latitude]` order. Divide land into named plots in Acres and Gunthas, assign crops, and track planned, vegetative, flowering/fruiting, or harvesting stages.
- **Soil kit:** Record pH, available nitrogen and phosphorus, with optional commercial rapid-kit potassium, organic carbon, and salinity readings. Deterministic interpretation presents bilingual soil notes and enrichment actions.
- **Crop Advisor:** Rank Maharashtra crops by season, soil-kit compatibility, and the saved weather forecast.
- **Balram's Field Voice:** Provide bilingual plain-language crop-stage, soil, and weather advisories.
- **Water planning:** Estimate current and lifecycle-phase water needs, include delivery presets and a drought allocation scenario, and retain an advanced measured-flow calculator. Estimates are planning aids, not irrigation commands.
- **Offline use:** After a successful online installation, the build-generated service worker caches an allowlist of application files. Farm data remains in IndexedDB; provider responses and map tiles are not cached.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS.
- `src/types/domain.ts`: Zod contracts for browser-persisted farm state.
- `src/store/useBalramStore.ts`: hydration-safe Zustand store, migration, request-generation guards, and local persistence.
- `src/lib/domain/`: geometry, land allocation, soil interpretation, crop recommendations, Field Voice, and irrigation calculations.
- `src/lib/api/` and `src/app/api/`: bounded same-origin provider proxy routes. Open-Meteo weather is request-driven; SoilGrids and Agmarknet are disabled. Geocoding is unavailable on Edge deployments without a shared rate-limit authority.
- `scripts/finalize-release.mjs`: adds per-document inline script CSP hashes and generates `public/sw.js` from the exact production build assets.

There are no user accounts, remote farm database, analytics, or geometry uploads. Provider availability is not guaranteed. Review provider licensing and deployment constraints in [RELEASE.md](RELEASE.md).

## Development and verification

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm start
```

Always use `npm run build` for a release build; it runs Next.js and the CSP/service-worker finalizer together.
