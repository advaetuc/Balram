# Balram v0.4.0: Interactive Visuals Implementation Blueprint (Source-Validated Edition)

*Prepared 22 November 2026 · Overseer: Claude · Source Validator & Architect: Gemini · Implementer: Codex*

## 0. Gemini Source Validation Summary (Verified Against `/Users/advaet/Projects/Balram` `v0.3.5`)

All 10 **VERIFY** items in Claude's draft were verified against `/Users/advaet/Projects/Balram` (`v0.3.5` on `frontend`, `PERSISTENCE_VERSION = 5`, 57 passing tests):

1. **Tokens & Motion (`VERIFY #1`) — CONFIRMED:** `src/styles/tokens.css`, `tokens.json`, and `motion.css` (`v0.3.5`) are live with `useCssVar.ts` and `tests/motion-tokens.test.ts` (zero literal `ms`/`s`/`cubic-bezier(` in `motion.css`). All new visual motion must use existing `--dur-*` / `--ease-*` tokens.
2. **v0.3.2, v0.3.3, Release A & v0.3.5 (`VERIFY #2, #3`) — CONFIRMED:** Canonical Gunthas (`allocation.ts`), `LandUnitToggle` (`acres | gunthas`), `formatArea`, `displayPlotName`, `tolerablePhRange` + salinity-gated gypsum (`soilKit.ts`), `plotId` irrigation selection, and full Marathi (`tests/i18n.test.ts`) are already shipped.
3. **Weather Condition Code (`VERIFY #4`) — DERIVED:** `WeatherSnapshot.daily[]` has no `weatherCode`; it carries `temperatureMin`, `temperatureMax`, `precipitation`, `referenceEvapotranspiration`. `src/lib/domain/viz/skyCondition.ts` derives sky condition (`clear_hot`, `clear_mild`, `partly_cloudy`, `light_rain`, `heavy_rain`) deterministically from `precipitation` and `temperatureMax` using named constants, and flags regional baseline snapshots (`source.includes("baseline")`) as `"typical_season"`.
4. **Effective Rainfall (`VERIFY #5`) — REUSED:** `src/lib/domain/irrigation.ts` already implements `calculateCropWaterRequirement`, `calculateIrrigationDemand` (`netDepthMm = Math.max(0, cropEtMm - effectiveRainfallMm)`), `resolveDailyEt0`, and `calculatePhaseWaterBreakdown`. `waterRibbon.ts` must reuse them directly.
5. **Crop Component Scores (`VERIFY #6`) — PURE HELPER:** `src/lib/domain/viz/cropFit.ts` computes the 3 component statuses (`soil`, `water`, `sowing`: `"good" | "fair" | "needs_help"`) from the same `MaharashtraCropMatrix`, `soilKitReading`, `weatherSnapshot`, and `monthZeroIndexed` inputs without altering `getSeasonalCropRecommendations()`'s return contract or breaking existing tests.
6. **CSP `img-src` (`VERIFY #7`) — ZERO CSP CHANGE NEEDED:** `next.config.ts` already permits `img-src 'self' data: https://tile.openstreetmap.org`. V7 (`Farm Card`) will render via SVG → Canvas → PNG `data:` URL / `Blob` download + `navigator.share({ files })` with zero `next.config.ts` changes.
7. **Check-Ins (`VERIFY #8`) — CONFIRMED:** `CheckInCard.tsx` and `state.addCheckIn()` already exist with all 4 lifecycle stages and 6 event types.
8. **SSR-Safe Date (`useNow`) — REUSES `state.now`:** `useBalramStore(s => s.now)` already returns `null` during SSR and updates post-hydration on the client. `src/lib/ui/useNow.ts` simply wraps `state.now` and `indiaDate(now)` (Invariant 1).
9. **Persistence & Dependencies:** `PERSISTENCE_VERSION` stays **`5`**. Zero new npm dependencies. Target release: **`v0.4.0`**.

---

## 1. Visual Language & Shared Primitives (`src/components/viz/`)

* **Principle:** *See it, touch it, then read it.* Every visual has: (1) an artistic, high-contrast daylight inline SVG graphic, (2) a touch-friendly interactive control with non-drag alternatives (WCAG 2.5.7, `≥48×48px`, `8px` gaps), (3) a `VizTable` text twin (collapsible `"Show as list"` on phones, always visible in print & screen readers), and (4) a provenance cue (solid stroke = measured/entered, dashed = forecast, dotted = typical-for-season baseline, hatched = sample) + `ProvenanceBadge`.
* **Crop Fills (≤ 5 colors + patterns + initial):** Palette strictly drawn from Daylight Field Notebook (`forest #1E5631`, `accent #A16207`, `info #0369A1`, `soil-terracotta #9A3412`, `plum #6B21A8`) paired with SVG `<pattern>` fills (solid, diagonal stripes, dots, cross-hatch, horizontal lines) and the plot/crop initial letter; fallow land uses pale diagonal hatch (`#E8F0F1` / `#5F8570`).
* **Pure Primitives (`src/components/viz/` — ZERO store imports):**
  * `ProvenanceStroke.tsx` (SVG stroke-dasharray & pattern `<defs>` helpers)
  * `VizTable.tsx` (accessible collapsible text twin + `print:block`)
  * `VizCaption.tsx` (plain-language summary + `ProvenanceBadge`)
  * `StageIllustration.tsx` (artistic botanical inline SVG icons for `planned`, `vegetative`, `flowering_fruiting`, `harvesting` + 6 weather/event illustrations)

---

## 2. Pure Domain Visual Engines (`src/lib/domain/viz/`)

All engines are pure TypeScript (zero React, zero store, zero `Date.now()`):

1. **`tileLayout.ts`**: `layoutTiles(totalGunthas, plots)` → Acre blocks of 40 tiles (`8 × 5` grid, `1 tile = 1 Guntha`) using **largest-remainder rounding** so tile sums never exceed available whole tiles; fractional last tile supported (`fillFraction` 0..1); assigns up to 5 color+pattern indices.
2. **`gaugeZones.ts`**: Imports `ALKALINE_KMNO4_N_LOW_MAX` (`280`) and `OLSEN_P_LOW_MAX` (`10`) directly from `../soilKit` (`560` and `25` high cutoffs) and maps `SoilKitReading` into bullet-gauge geometry for pH (`3.5–10.5` with Deccan Vertisol `7.8–8.4` band), Nitrogen, and Olsen Phosphorus.
3. **`waterRibbon.ts`**: Uses `resolveDailyEt0`, `calculateCropWaterRequirement`, and `calculateIrrigationDemand` to build a 7-day ribbon (`day`, `tempMin`, `tempMax`, `rainMm`, `effectiveRainMm`, `cropNeedMm`, `irrigate`, `heavyRainCaution` at `HEAVY_RAIN_CAUTION_MM = 25`, `provenance`: `"forecast" | "typical_season" | "sample"`) plus a rain-scaling what-if (`100% | 75% | 50% | 25%`, always flagged `illustrative: true`).
4. **`cropFit.ts`**: Computes 3 component statuses (`soil`, `water`, `sowing`: `"good" | "fair" | "needs_help"`) per crop aligned with `getSeasonalCropRecommendations`.
5. **`calendarLayout.ts`**: Maps 12 months (Kharif/Rabi/Zaid shaded bands), `sowingWindows`, planting date + `phaseWeeks` stage bars, harvest marker, and `todayIso` (`null` during SSR) to `0..100` SVG x-coordinates, handling leap years and year boundaries cleanly.
6. **`skyCondition.ts`**: Derives Today's Sky visual state (`clear_hot`, `clear_mild`, `partly_cloudy`, `light_rain`, `heavy_rain`) and plain bilingual headline from `WeatherSnapshot.daily[0]` + dominant plot stage, never claiming measured conditions on baseline data.

---

## 3. Phased Execution Plan (V0 → V7)

- **V0 — Foundation (Pure `viz/` Engines, Shared Primitives, `useNow` & Golden Tests):** Add `src/lib/domain/viz/*`, `src/lib/ui/useNow.ts`, `src/components/viz/{ProvenanceStroke,VizTable,VizCaption,StageIllustration}.tsx`, and golden unit tests in `tests/viz-engines.test.ts`.
- **V1 — Guntha Tiles (`GunthaTiles.tsx`):** Visual 8×5 acre blocks above plot list in Station 4 / My Farm; phone button controls (`+1, −1, +5, −5, +1 acre, Fill remaining`) + desktop (`≥768px`) interactive 48px tiles & opt-in Paint toggle; `VizTable` twin.
- **V2 — Soil Gauges & Live pH What-If (`SoilGauges.tsx`):** Artistic bullet gauges for pH (with Deccan Vertisol marker), N, and Olsen P inside `SoilCard`, plus non-persisted `"Try a different pH"` (`−0.1 / +0.1`) live crop re-ranking and `"Back to my result"` reset.
- **V3 — Seven-Day Water Ribbon (`WaterRibbon.tsx`):** Interactive 7-day SVG water columns (rain bar vs. crop need marker, irrigation droplet, heavy-rain fertilizer caution, dashed forecast vs. dotted seasonal baseline), day detail `<dialog>` sheet, and `100% / 75% / 50% / 25%` illustrative what-if.
- **V4 — Botanical Stage Rail & Picture-Card Check-Ins (`StageRail.tsx` & `CheckInCard.tsx`):** Visual 4-step stage rail with post-hydration `"about X weeks to next stage"` on plots + illustrated 2×2 stage and 3×2 event picture cards in `CheckInCard`.
- **V5 — Today's Sky Hero & Crop Fit Tiles (`TodaysSky.tsx` & `CropFitTiles.tsx`):** Artistic illustrated sky/field SVG hero on Today tab (calm ambient cloud/rain loop off under reduced motion) + 3-tile Soil/Water/Sowing visual badges on `CropAdvisorCard`.
- **V6 — 12-Month Crop Calendar (`CropCalendar.tsx`):** Interactive SVG season/stage ribbon in Roadmap & Report with `Today` line (post-hydration) and plot action tap.
- **V7 — Shareable Farm Card PNG, Report Visuals & `v0.4.0` Release Gate:** Coordinate-free 1080×1080 shareable Farm Card (SVG → Canvas → PNG), static print visuals in `FarmReport.tsx`, version bump to `0.4.0`, and full release audit.
