# Balram v0.3.0 — Codex Implementation Prompt (Phase B3–B5: Growing Path Shell, 6 Stations, Auto-Weather & Sample Overlay)

Copy and paste the prompt below into **Codex**. It assumes **Phase B1 & B2** (`PERSISTENCE_VERSION = 4`, `journey.ts`, `roadmap.ts`, `soilKit.ts` classifiers, `sowingWindows`, and `fieldVoice.reason`) are complete and passing.

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.0`)**. Read `AGENTS.md` and `BALRAM_V0_3_BLUEPRINT.md` in the repository root, and inspect:
- `src/app/(app)/page.tsx`
- `src/components/app-shell/Header.tsx`
- `src/store/useBalramStore.ts`
- `src/lib/domain/journey.ts`
- `src/lib/domain/roadmap.ts`
- `src/lib/domain/soilKit.ts`
- `src/lib/domain/fieldVoice.ts`
- `src/components/map/MapClient.tsx`
- `src/components/dashboard/{PortfolioCard,SoilCard,CropAdvisorCard,AlertsCard,WeatherCard}.tsx`
- `src/components/irrigation/IrrigationPanel.tsx`
- `src/components/report/FarmReport.tsx`
- `src/config/i18n.ts`

Your objective in this pass is to execute **Release B — Phases B3, B4, and B5** (the single-route **Growing Path** shell, non-destructive **Sample Farm** overlay, language-first landing, 6 interactive setup stations with automatic weather fetching, Soil Health Card `kg/ha` input mode, Field Voice `Why this advice?`, and the 4-tab **Daily Home**).

---

## ARCHITECTURAL & OFFLINE CONSTRAINTS (CRITICAL)
1. **Single-Route Shell (`/` only)**: Per `BALRAM_V0_3_BLUEPRINT.md` §0 (VERIFY #3), `scripts/finalize-release.mjs` and `scripts/service-worker.js` only cache `"/"` (`.next/server/app/index.html`) for offline navigation and reject RSC route transitions offline. Therefore, **do NOT create separate Next.js route folders (`/journey/*`, `/home/*`)**. Implement the Landing view, 6-Station Setup Journey, and 4-Tab Daily Home as state-driven views inside `src/app/(app)/page.tsx`.
2. **Invariant 1 (SSR Hydration Parity)**: Never read `window`, `Date.now()`, or `new Date()` during initial render. Compute `nowIso = state.now === null ? null : new Date(state.now).toISOString()` and pass `nowIso` into `deriveJourney(state, nowIso)`. During SSR (`!state.hydrated`), render a calm deterministic loading skeleton/shell.
3. **Wrap Existing Components**: Reuse `MapClient`, `WeatherCard`, `SoilCard`, `PortfolioCard`, `CropAdvisorCard`, `AlertsCard`, `IrrigationPanel`, and `FarmReport` inside the stations and tabs—do not rewrite working logic from scratch.
4. **48×48px Touch Targets & Daylight Contrast**: Every interactive button, tab, pill, and bar must have `min-h-12 min-w-12`. Use `amber` (`#FFBF00`) only as a fill/border with `ink` (`#212121`) text—never amber text on white.
5. **No Inline `style` Attributes / No External Fonts**: Use Tailwind classes and inline `<svg>` only so the strict CSP (`scripts/finalize-release.mjs`) remains 100% valid.

---

## PHASE B3 & B4: Store Sample Overlay + Shared Shell Components

### 1. Refactor Sample Mode into a Non-Destructive Read-Only Overlay (`src/store/useBalramStore.ts`)
Currently `setSampleData(true)` throws if real farm data exists and overwrites the store state. Rework this cleanly:
- Add `sampleOverlayActive: boolean` (not persisted in `persistedSlice`, defaulting to `false`) and an internal in-memory `realFarmBackup: PersistedFarm | null` inside `createBalramStore()`.
- When `setSampleData(true)` is called:
  - Abort any in-flight weather/soil requests and increment `generation`.
  - Snapshot `persistedSlice(get())` into `realFarmBackup` (without writing to IndexedDB; temporarily disable `writesEnabled` while `sampleOverlayActive` is `true` so IndexedDB is NEVER touched during sample browsing).
  - Load `createSampleFixture()` into active memory state with `sampleDataActive: true`.
- When `setSampleData(false)` is called:
  - Restore `realFarmBackup ?? createEmptyFixture()` into memory, re-enable `writesEnabled = true`, and set `sampleDataActive: false` so the farmer's real persisted farm returns 100% intact.
- Block all mutating actions (`setFarmProfile`, `setFieldGeometry`, `setCropAllocations`, `setIrrigationSetup`, `setSoilKitReading`, `setSoilSkipped`, `setSetupCompletedAt`, `addCheckIn`) when `get().sampleDataActive` is `true` (except `setLocale`, which can still toggle English/Marathi for viewing the sample).
- Add a unit test in `tests/release-b-shell.test.ts` (or `tests/release-b-domain.test.ts`) verifying that entering and exiting sample mode on a populated farm leaves the real farm's `fieldGeometry`, `cropAllocations`, `soilKitReading`, and `setupCompletedAt` completely unchanged.

### 2. Create Brand & Provenance Components
1. **`src/components/ui/StationIcon.tsx`**:
   - Six clean inline-SVG icons for the **Growing Path**:
     - `land`: **Seed**
     - `weather`: **Sprout**
     - `soil`: **Leaf**
     - `crops`: **Flower**
     - `advice`: **Fruit**
     - `roadmap`: **Grain**
   - When `status === "done"`, style with `forest` (`#1E5631`) fill/stroke and a `transition-all duration-300 motion-reduce:transition-none` draw-in effect.
2. **`src/components/ui/ProvenanceBadge.tsx`**:
   - Reusable badge component accepting `provenance: "measured_by_kit" | "forecast" | "estimated" | "you_entered" | "assumed" | "sample"` and `locale: Locale`.
   - Renders an inline SVG icon + bilingual text label (*Measured by kit / किटद्वारे मोजलेले*, *Forecast / हवामान अंदाज*, *Estimated / अंदाजित*, *You entered / तुम्ही नोंदवलेले*, *Assumed / गृहीत धरलेले*, *Sample / नमुना*). Never relies on colour alone.

### 3. Update `src/config/i18n.ts` & `src/components/app-shell/Header.tsx`
- Add bilingual (`en` & `mr`) strings to `src/config/i18n.ts` for:
  - Landing page (Language selector, **My Farm / माझे शेत**, **Start Setup / सुरुवात करा**, **Continue / पुढे सुरू ठेवा**, **Sample Farm (Pune) / नमुना शेत (पुणे)**).
  - All 6 Stations (*My Land / माझी जमीन*, *Weather / हवामान*, *My Soil / माझी माती*, *My Crops / माझी पिके*, *Balram's Advice / बलरामचा सल्ला*, *My Roadmap / पुढची वाटचाल*) and status badges (*Done / पूर्ण*, *Needs update / अद्ययावत करा*, *Skipped / वगळले*, *Locked / लॉक*).
  - All 4 Daily Home tabs (*Today / आज*, *My Farm / माझे शेत*, *Water / पाणी*, *Report / अहवाल*).
  - Provenance badges, Weather auto-fetch status, Soil 4-mode pills, and Sample overlay banner (*"Sample farm · Exit" / "नमुना शेत · बाहेर पडा"*).
- In `Header.tsx`:
  - Keep the top-bar `English / मराठी` toggle (`min-h-12`).
  - If `state.sampleDataActive` is `true`, show a clear, high-contrast amber banner with `ink` text and an **Exit sample / नमुना बंद करा** button.

---

## PHASE B5: Setup Journey (6 Stations), Auto-Weather, Soil Health Card Mode & Daily Home

### 4. Automatic Weather Fetching (`src/components/journey/WeatherStation.tsx` or inside `WeatherCard.tsx`)
- When the farmer saves/updates `fieldGeometry` (and `!state.sampleDataActive`, `state.connection === "online"`, and `!state.weatherSnapshot || state.weatherStale`):
  - Automatically trigger the Open-Meteo fetch using `beginWeatherRequest()`, `submitProvider("/api/weather", ...)`, and `commitWeatherRequest()` (preserving the `isCurrent` generation guard).
  - On failure, schedule up to 3 automatic retries with backoff (`5s`, `15s`, `45s`) using `setTimeout` cleaned up on unmount/abort, and always show a calm plain-language error + manual **Retry / पुन्हा प्रयत्न करा** button.
  - When offline and a saved snapshot exists, display it clearly with its age and `Forecast` provenance badge.

### 5. Upgrade `src/components/dashboard/SoilCard.tsx` for 4 Modes + Skip
- Add the 4 large `min-h-12` pill choices in `SoilCard.tsx`:
  1. **Balram In-House Kit** (`balram_inhouse`)
  2. **I have Soil Health Card / Lab numbers (kg/ha)** (`soil_health_card`) — lets the farmer enter numeric `nitrogenKgPerHa` and `phosphorusKgPerHa`, automatically deriving `nitrogenLevel` via `classifyNitrogenKgPerHa()` and `phosphorusLevel` via `classifyPhosphorusKgPerHa()` from `src/lib/domain/soilKit.ts` (and persisting both the numbers and derived levels).
  3. **Full Rapid Kit** (`commercial_rapid`)
  4. **I haven't tested yet (Skip for now)** — calls `state.setSoilSkipped(true)` (and saving a reading sets `state.setSoilSkipped(false)`).
- Keep the visual pH bar and layman enrichment checklist (`What Your Soil Needs Before Planting`).

### 6. Upgrade `src/components/dashboard/AlertsCard.tsx` with "Why this advice?"
- In `AlertsCard.tsx`, add an expandable or inline **"Why this advice? / हा सल्ला का?"** toggle/caption on each `FieldVoiceAdvisory` rendering `a.reason[state.locale]`.

### 7. Create the Growing Path Shell (`src/components/journey/JourneyShell.tsx`) & Daily Home (`src/components/home/DailyHome.tsx`)
Wire everything inside `src/app/(app)/page.tsx` using clean client view state:
1. **Landing / Resume View** (shown initially before entering Journey or Daily Home, or accessible via a "Home" link):
   - Language-first `English` / `मराठी` selector.
   - **My Farm / माझे शेत** card:
     - If `!state.setupCompletedAt`: shows `Start Setup` (if empty) or `Continue: Step X, <Station>` (from `deriveJourney`).
     - If `state.setupCompletedAt`: shows **Open Daily Home** + link to edit setup.
   - **Sample Farm (Pune)** read-only card: enters `setSampleData(true)` and opens Daily Home in read-only mode.
2. **Setup Journey (`JourneyShell.tsx`)**:
   - Uses `deriveJourney(state, nowIso)` (`nowIso` from `state.now`).
   - Desktop (`md:grid-cols-[280px_minmax(0,1fr)]`): `TrailSidebar` on the left with `StationIcon` and station statuses (`done`, `current`, `ready`, `skipped`, `locked`, `needs_update`).
   - Mobile (`< md`): compact top `ProgressStrip` (`Step X of 6 · <Station Name>`) that opens a `StationSheet` list, plus a fixed bottom `BottomNextBar` (`min-h-12` Back & Next buttons).
   - **6 Station Views**:
     - `land`: `MapClient` + clear note that offline land entry uses Acres & Gunthas.
     - `weather`: `WeatherStation` (auto-fetch + retry + `WeatherCard` details).
     - `soil`: `SoilCard` (4 modes + Skip button). When skipped, subsequent advice shows a clear **Soil not tested / माती चाचणी केलेली नाही** badge.
     - `crops`: `PortfolioCard`.
     - `advice`: `AlertsCard` (Field Voice + `Why this advice?`) + `CropAdvisorCard`.
     - `roadmap`: Renders `generateRoadmap(...)` items grouped into **This Week**, **Next Two Weeks**, and **Later** with `ProvenanceBadge`, `FarmReport` preview/print button, and a **Finish Setup / पूर्ण करा** primary button that calls `state.setSetupCompletedAt(indiaDate(state.now) ?? "2026-11-16")` and switches to Daily Home.
3. **Daily Home (`DailyHome.tsx`)**:
   - 4-Tab navigation (`Today / आज`, `My Farm / माझे शेत`, `Water / पाणी`, `Report / अहवाल`) with `min-h-12` tabs:
     - **Today (`आज`)**: Top Field Voice advisory, today's water run summary across plots, next roadmap actions (`this_week` items), and quick link to check-in (to be wired in B6).
     - **My Farm (`माझे शेत`)**: `PortfolioCard`, `SoilCard`, `MapClient`, plus a button to re-open the 6-station Setup Journey.
     - **Water (`पाणी`)**: `IrrigationPanel`.
     - **Report (`अहवाल`)**: `FarmReport`.

---

## VERIFICATION GATE (MANDATORY)
Run all checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test` (including new tests for non-destructive sample overlay, `Soil Health Card` classifier UI/domain integration, and `JourneyShell` state transitions)
3. `npm run build` (confirm `scripts/finalize-release.mjs` exits `0` and regenerates `public/sw.js` with the updated approved file count)
```
