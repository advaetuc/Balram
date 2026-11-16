# Balram v0.3.1 — Maharashtra farm planning

Balram is a local-first, zero-database farm planning app for Maharashtra. It combines field mapping, Acres and Gunthas plot management, crop planning, on-site soil records, weather context, irrigation estimates, check-ins, and printable reports. English and Marathi (`मराठी`) are available.

## v0.3.1 features

- **Growing Path:** a six-station guided setup for land, weather, soil, crops, advice, and a prioritized roadmap.
- **Local persistence:** Zustand hydrates farm records from IndexedDB (`PERSISTENCE_VERSION = 4`). A session-memory fallback keeps editing available when IndexedDB is unavailable. The app requests persistent browser storage after hydration when supported.
- **Read-only Sample Farm overlay:** explore illustrative Pune data without changing the saved farm.
- **Field and plots:** draw or enter a field boundary, with persisted GeoJSON coordinates in `[longitude, latitude]` order. Divide land into named plots and track crop lifecycle stages.
- **Soil Health Card:** enter pH and available nitrogen/phosphorus values in kg/ha. Balram classifies entered nutrient values and explains the categories; it does not replace laboratory interpretation.
- **Check-ins:** record a plot stage, recent field event, and optional short note. Check-ins are farmer-entered records and do not overwrite weather data.
- **Backup and restore:** download or restore a validated JSON farm backup. Backup files contain field map coordinates; keep them private. Restore validation completes before saved state is replaced.
- **Coordinate-free sharing:** share or copy a farm summary with plot, soil, and roadmap details. Map coordinates and boundary geometry are excluded.
- **Balram's Field Voice and water planning:** bilingual plain-language advisories and phase-wise water estimates. Estimates are planning aids, not irrigation commands.
- **Weather resilience:** live Open-Meteo requests use the deployment's forwarded origin, daily ET₀ falls back to Hargreaves when forecast ET₀ is missing, and a seven-day Maharashtra seasonal baseline keeps planning available offline or during provider outages.
- **Irrigation tools:** both plot presets and the measured-flow estimator open with plot and delivery-method starting values. Verify flow and efficiency against the actual irrigation block before using runtime estimates.
- **Offline use:** after a successful production build/install, the service worker caches an allowlist of application files. Farm data is kept locally; provider responses and map tiles are not cached.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS.
- `src/types/domain.ts`: Zod contracts for browser-persisted farm state.
- `src/store/useBalramStore.ts`: hydration-safe Zustand store, migrations, request-generation guards, check-ins, and local persistence.
- `src/lib/domain/`: geometry, land allocation, soil interpretation, crop recommendations, Field Voice, and irrigation calculations.
- `src/lib/storage/`: IndexedDB adapter and validated backup/restore format.
- `src/lib/api/` and `src/app/api/`: bounded same-origin provider proxy routes. Open-Meteo weather uses rounded-coordinate caching and works on serverless isolates; SoilGrids and Agmarknet are disabled. Geocoding is unavailable on Edge deployments without a shared rate-limit authority.
- `scripts/finalize-release.mjs`: adds per-document inline script CSP hashes and generates `public/sw.js` from the exact production build assets.

There are no user accounts, remote farm database, or analytics. Provider availability is not guaranteed. Review provider licensing and deployment constraints in [RELEASE.md](RELEASE.md).

## Development and verification

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

Always use `npm run build` for a release build; it runs Next.js and the CSP/service-worker finalizer together.
