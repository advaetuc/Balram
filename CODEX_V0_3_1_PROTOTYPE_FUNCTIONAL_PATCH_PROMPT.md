# Balram v0.3.1 — Surgical Codex Patch Prompt (Live Weather Resilience, Guaranteed ET₀ & Functional Irrigation Tools)

Copy and paste the prompt below into **Codex** to eliminate the three prototype blockers (`"Weather could not be updated..."`, `"No reference ET₀ is available..."`, and `"Measured block flow is not confirmed."`) and make all planning tools work out of the box locally and on Vercel.

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.0` -> `v0.3.1`)**. Read `AGENTS.md` and inspect the following files before making any edits:
- `src/lib/api/server.ts`
- `src/lib/api/providers/openMeteo.ts`
- `src/lib/domain/irrigation.ts`
- `src/lib/ui/format.ts`
- `src/components/journey/WeatherStation.tsx`
- `src/components/journey/JourneyShell.tsx`
- `src/components/dashboard/WeatherCard.tsx`
- `src/components/dashboard/AlertsCard.tsx`
- `src/components/irrigation/IrrigationPanel.tsx`
- `src/mocks/fixtures.ts`
- `package.json`

Your objective is to make Balram's weather pipeline, reference $ET_0$ resolution, and irrigation calculators 100% functional and resilient for live prototype deployment on Vercel so that the user never hits dead-end states:
1. `"Weather could not be updated. Your other planning tools remain available."`
2. `"No reference ET₀ is available for the selected day."`
3. `"Measured block flow is not confirmed."`

Keep `PERSISTENCE_VERSION = 4` unchanged and preserve all 7 architectural invariants in `AGENTS.md`.

---

## SURGICAL PATCH SPECIFICATION

### 1. Fix Proxy Origin Check & Harden Open-Meteo Fetching (`src/lib/api/server.ts` & `src/lib/api/providers/openMeteo.ts`)
1. **In `src/lib/api/server.ts` (`providerRoute`)**:
   - Currently, `providerRoute` rejects requests when `request.headers.get("origin") !== url.origin`. Behind Vercel Edge proxies, preview URLs, or `localhost` vs `127.0.0.1`, `url.origin` can differ from the forwarded host.
   - Update the origin check so that when `origin` is present, its `new URL(origin).host` is compared against `request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host` (while keeping `request.headers.get("sec-fetch-site") === "cross-site"` blocked).
2. **In `src/lib/api/providers/openMeteo.ts`**:
   - Simplify the upstream Open-Meteo query so it does NOT fail if hourly shallow-soil variables (`soil_temperature_6cm`, `soil_moisture_0_to_1cm`) are unavailable or misaligned:
     - Only request `daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,et0_fao_evapotranspiration"` (or make `hourly` optional in `OpenMeteoResponseSchema` instead of failing the entire response on hourly array length checks).
     - Accept any valid `timezone` string (`z.string().min(1)`) and integer `utc_offset_seconds` in `OpenMeteoResponseSchema`.
   - When mapping `raw.daily.time` into `snapshot.daily`:
     - If `raw.daily.et0_fao_evapotranspiration[i]` is `null` but `temperature_2m_min[i]` and `temperature_2m_max[i]` are finite numbers, automatically compute and populate `referenceEvapotranspiration` using `calculateHargreavesEt0({ latitudeDeg: coordinate[1], dateIso, tempMinC, tempMaxC })` from `@/lib/domain/irrigation` so every forecast day has a non-null `referenceEvapotranspiration`!

---

### 2. Add Automatic Maharashtra Seasonal Baseline Weather Fallback (`src/lib/domain/irrigation.ts` & `src/components/journey/WeatherStation.tsx`)
1. **In `src/lib/domain/irrigation.ts`**:
   - Export a deterministic helper `createRegionalBaselineWeatherSnapshot(params: { fieldId: string; coordinate: [number, number]; nowMs?: number | null }): WeatherSnapshot`:
     - Uses `indiaDate(params.nowMs ?? null) ?? "2026-11-16"` as the start date (`day 0`) and generates a valid 7-day `WeatherSnapshot` (conforming to `WeatherSnapshotSchema`) for the field's exact `fieldId` and `coordinate` (`[lng, lat]`).
     - Uses seasonal Maharashtra temperature norms by month (Kharif June–Sept: `22°C–31°C`, `3 mm` rain; Rabi Oct–Feb: `16°C–30°C`, `0 mm` rain; Zaid Mar–May: `24°C–37°C`, `0 mm` rain) and computes each day's exact `referenceEvapotranspiration` via `calculateHargreavesEt0()` at `coordinate[1]` latitude.
     - Sets `source: "Balram Maharashtra seasonal baseline (Hargreaves ET₀)"`, `provenance: "modelled"`, and valid `fetchedAt`, `validFrom`, `validTo`, and `expiresAt` (`+6 hours`) timestamps.
2. **Eliminate Double-Mount Auto-Fetch Race & Apply Baseline Fallback (`src/components/journey/WeatherStation.tsx`, `src/components/journey/JourneyShell.tsx`, `src/components/dashboard/WeatherCard.tsx`)**:
   - Note that `AppShell.tsx` mounts `<WeatherStation visible={false} />` globally. Ensure `JourneyShell.tsx` does not mount a second competing auto-fetch effect.
   - In `WeatherStation.tsx` and `WeatherCard.tsx`:
     - If the `/api/weather` network request fails (for example, offline, local firewall, or upstream Open-Meteo outage) AND `state.weatherSnapshot === null`, immediately commit `createRegionalBaselineWeatherSnapshot({ fieldId: field.fieldId, coordinate: field.center, nowMs: state.now })` via `state.commitWeatherRequest(request, baselineSnapshot, false)` instead of leaving `weatherSnapshot === null` in an error state!
     - Also provide a button on `WeatherCard.tsx` (`"Refresh live weather"` / `"ताजा हवामान अंदाज घ्या"`) so the user can re-query live Open-Meteo at any time.

---

### 3. Guarantee Reference $ET_0$ Resolution Across All Views (`src/lib/ui/format.ts`, `src/components/dashboard/WeatherCard.tsx`, `src/components/dashboard/AlertsCard.tsx`)
1. **In `src/lib/ui/format.ts`**:
   - Update `selectedWeatherDay(state: BalramState)` so that if `state.weatherSnapshot?.daily.find((day) => day.date === indiaDate(state.now))` finds no exact date match, it falls back to `state.weatherSnapshot?.daily[0] ?? null` instead of returning `null`.
   - Export `resolvedWeatherMetrics(state: BalramState)`:
     - Resolves `day = selectedWeatherDay(state)` and `latitude = state.fieldGeometry?.center[1] ?? 18.5204`.
     - Computes `resolvedEt0 = resolveDailyEt0(day, latitude)` from `@/lib/domain/irrigation`.
     - Returns:
       ```ts
       {
         date: day?.date ?? indiaDate(state.now) ?? "2026-10-01",
         et0MmPerDay: resolvedEt0?.et0MmPerDay ?? 4.5,
         et0Provenance: resolvedEt0?.provenance ?? ("maharashtra-baseline" as const),
         precipitationMm: day?.precipitation ?? 0,
         temperatureMinC: day?.temperatureMin ?? 19,
         temperatureMaxC: day?.temperatureMax ?? 31,
         hasSnapshot: state.weatherSnapshot !== null,
       }
       ```
2. **In `src/components/dashboard/WeatherCard.tsx`**:
   - Use `resolvedWeatherMetrics(state)` so **Reference ET₀** (`mm/day`), **Forecast rainfall** (`mm/day`), and the daily temperature range always display valid numbers (never `"Not available"` or `"No estimate for this day"`), accompanied by a clear provenance caption when using the Hargreaves temperature calculation or Maharashtra seasonal baseline.
3. **In `src/components/dashboard/AlertsCard.tsx`**:
   - Remove the two obsolete/blocking system status warnings:
     - Remove `"No reference ET₀ is available for the selected day."` (since `resolvedWeatherMetrics` + `resolveDailyEt0` always resolves a valid $ET_0$, or if `day?.referenceEvapotranspiration === null` on Day 3 of Sample Farm, Hargreaves $ET_0$ is automatically used).
     - Remove `"Measured block flow is not confirmed."` (since the primary irrigation workflow uses delivery presets and auto-filled block flow).
   - If `state.weatherStatus.error` is non-null but `state.weatherSnapshot` is present (e.g., fallback active), show a calm informational note rather than an error blocker.

---

### 4. Make Both Simple & Measured Irrigation Calculators Work Out of the Box (`src/mocks/fixtures.ts` & `src/components/irrigation/IrrigationPanel.tsx`)
1. **In `src/mocks/fixtures.ts`**:
   - In `createSampleFixture()`, set `irrigationSetup` to confirmed defaults so Sample Farm has zero unconfirmed-flow warnings:
     ```ts
     irrigationSetup: {
       method: "drip",
       systemFlowLitresPerHour: 4800,
       applicationEfficiency: 0.9,
       flowConfirmedByFarmer: true,
     },
     ```
   - Also in `createSampleFixture()`, ensure Day 3 (`"2026-10-03"`) has `referenceEvapotranspiration: 4.0` (or let `resolveDailyEt0` compute it via Hargreaves) so all sample days have complete metrics.
2. **In `src/components/irrigation/IrrigationPanel.tsx`**:
   - In the **Advanced: Measured block flow & custom Kc override** section:
     - Pre-populate default state values from the active plot and selected delivery method whenever `setup` is null or fields are empty:
       - `flow`: default to `String(setup?.systemFlowLitresPerHour ?? Math.max(400, Math.round((areaGunthas || 20) * (deliveryMethod === "drip" ? 100 : deliveryMethod === "sprinkler" ? 150 : 450))))`
       - `efficiency`: default to `String(setup?.applicationEfficiency != null ? setup.applicationEfficiency * 100 : (deliveryMethod === "drip" ? 90 : deliveryMethod === "sprinkler" ? 75 : 60))`
       - `kc`: default to `String(getCropStageKc((crop?.cropId ?? "onion") as CropId, crop?.lifecycleStage ?? "planned"))`
       - `rain`: default to `String(day?.precipitation ?? 0)`
       - `confirmed`: default to `true`
     - Use `et0` from `resolveDailyEt0(day, state.fieldGeometry?.center[1] ?? 18.5204)?.et0MmPerDay ?? 4.5` (instead of requiring raw `day?.referenceEvapotranspiration != null`) and `crop?.growthStage === "unknown" ? "initial" : crop?.growthStage` so the **Calculate planning estimate** button works immediately on every plot and every day without throwing `"Current-day ET₀ is unavailable"`!

---

## VERIFICATION GATE (MANDATORY)
1. Update or add unit tests in `tests/release-b-final.test.ts` verifying:
   - `createRegionalBaselineWeatherSnapshot` produces a valid `WeatherSnapshot` passing `WeatherSnapshotSchema.parse()` with 7 days of non-null `referenceEvapotranspiration`.
   - `resolvedWeatherMetrics` always returns a finite positive `et0MmPerDay`.
   - `AlertsCard` status logic / `createSampleFixture()` has confirmed `irrigationSetup` and non-null $ET_0$.
2. Bump `"version"` in `package.json` to `"0.3.1"`.
3. Run and pass with exit code `0`:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `git diff --check`
```
