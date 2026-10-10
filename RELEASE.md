# Release contract

- Build with `npm run build`. The finalizer adds per-document inline-script hash policies to prerendered HTML and generates `public/sw.js` from the exact build assets. Do not deploy an unfinalized `next build` output or reuse a worker from another build.
- Vercel serves the static planner and Edge API routes. No accounts, remote farm database, analytics or geometry uploads are configured.
- API responses, including failures and unsupported methods, use private/no-store browser and CDN headers. The bounded, best-effort in-memory provider cache contains rounded public queries only; it is neither durable nor a distributed rate limiter.
- Nominatim is unavailable on Edge/Vercel because public-service application-wide rate limiting cannot be guaranteed without shared coordination. Manual coordinates remain available. SoilGrids is experimental and disabled pending successful live contract validation. Agmarknet is hard-disabled.
- The service worker caches only a build-generated same-origin allowlist. No provider responses, query-string requests, RSC responses or map tiles enter Cache Storage. Farm inputs and last-good snapshots remain in IndexedDB.
- Offline reopening requires one successful online installation. New workers wait for older tabs to close; they never erase IndexedDB or force a reload. Browser storage eviction can remove offline availability.
- HTTP CSP provides host restrictions and frame denial. Build-generated HTML CSP additionally permits only known inline script hashes; static rendering is preserved without reusable nonces. Leaflet requires inline styles. Verify this combination when upgrading Next.
- Confirm Open-Meteo licensing before commercial deployment. Public services have no availability guarantee. No deployment has been performed by these changes.
