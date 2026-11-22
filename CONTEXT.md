# CONTEXT.md — Ground-Truth Handoff Snapshot for Balram (`v0.5.0`)

*Updated 22 November 2026 · Branch `frontend` · Persistence schema 6 · Dependencies unchanged*

## 1. Current Release Milestone (`v0.5.0`)
Balram is a local-first, zero-database, Marathi-first precision agritech web platform for Maharashtra smallholder farmers (2–10 acres), pairing physical soil-testing chemistry (1:2.5 soil-water pH, alkaline $\text{KMnO}_4$ N, Olsen molybdenum-blue P, plus Soil Health Card `kg/ha`) with offline-first visual farm planning.

* **Local Multi-Farm Profiles (`v0.5.0`)**
  * Up to six farms per device with unique names of up to 30 graphemes. The bilingual naming screen, Field Notebook *My Farms* gallery with crop-proportion ribbons, and header dialog switcher stay on the single offline route. Users can save an editable Pune sample copy and undo a deletion for seven seconds, pausing the countdown with hover or keyboard focus.
  * Schema v6 persists the active farm and its stashed peers atomically in one IndexedDB record. Older v0–v5 records migrate with a best-effort `balram:legacy-v5` safety copy, removed on the next healthy v6 boot. Export includes all farms, and v5/v6 imports add farms until the device reaches capacity.
* **Design & Motion System (`v0.3.4`–`v0.3.5`):**
  * Daylight Field Notebook light-mode outdoor palette (`src/styles/tokens.css`, `tokens.json`) with `≥3.58:1` control borders (`#5F8570`), `≥5.17:1` semantic provenance badges, `18px` body / `1.6` Devanagari line-height, and `≥48×48px` touch targets.
  * Pure-CSS "Organic Growing Path" motion (`src/styles/motion.css`): `@starting-style` native `<dialog>` sheets, directional Journey/Tab panels (opacity-only on map panels), `.seg` sliding pills, `StationIcon` stroke-draw bloom, `ToastHost` 4s info / 7s hover-and-focus-pausable Undo countdown bar, and instant `prefers-reduced-motion` collapse.
* **Interactive Visuals (`v0.4.0`–`v0.4.1`):**
  * **Constant-Height 56px Segmented `LandBar`** (`barSegments.ts` + `LandBar.tsx`): replaces the height-growing Guntha tile grid (`GunthaTiles.tsx` & `tileLayout.ts` removed). Caps at 6 visible segments (`≥15%` min display width for 48px touch safety at 360px) + `+N more` chip, tap-to-select plot focus, and `VizTable` text twin.
  * **Soil Bullet Gauges (`BulletGauge.tsx` + `SoilGauges.tsx`):** pH (`3.5–10.5` with Deccan Vertisol `7.8–8.4` band), Nitrogen (`280/560`), Olsen P (`10/25`), plus non-persisted `±0.1` pH what-if crop re-ranking.
  * **Seven-Day `WaterRibbon` (`waterRibbon.ts` + `WaterRibbon.tsx`):** Rain vs. crop-need bars, dashed forecast / dotted seasonal-baseline provenance strokes, heavy-rain fertiliser caution (`25 mm/day`), native `<dialog>` day details, `100%/75%/50%/25%` illustrative rain what-if, and compact Today view.
  * **Botanical `StageRail` & Picture-Card `CheckInCard`:** 4-step botanical stage rail with post-hydration weeks-to-next estimates (`stageProgress.ts`) and illustrated 2×2 stage / 3×2 event check-in cards.
  * **`TodaysSky` Hero & `CropFitTiles`:** Panoramic SVG sky/field hero on Today + 3-tile Soil/Water/Sowing visual badges on every crop recommendation.
  * **12-Month `CropCalendar`:** 6-month mobile button navigation, 12-month desktop & static A4 print timeline, post-hydration `Today` marker (`useNow`).
  * **Coordinate-Free 1080×1080 `FarmCard` PNG & A4 `FarmReport`:** Renders the segmented `LandBar` + plots + top actions via `data:image/svg+xml` → Canvas → PNG share/download (zero coordinates, zero CSP diff), alongside static soil, water, and calendar visuals in A4 print.

## 2. Verification Baseline & Known Manual Checks Pending
* **Automated release gates** passed on `frontend`. `npm run typecheck` and `git diff --check` exited 0. `npm test` passed all 117 tests. `npm run build` exited 0, and `scripts/finalize-release.mjs` regenerated `public/sw.js` with hashes for the static script policies and 40 approved offline application files.
* **Manual Real-Device QA Pending Before/After Vercel Deploy:**
  1. Test native Web Share (`FarmCardShareButton`) & PNG download fallback on 1–2 real Android/iOS phones (verify Devanagari canvas glyph shaping).
  2. Test A4 print preview in English and Marathi (`FarmReport`).
  3. Test Android Settings → "Remove animations" (`prefers-reduced-motion`) and offline reload after first online install.
  4. Non-code academic workstream: 5–10 soil sample lab comparison study + agronomist sign-off on `HEAVY_RAIN_CAUTION_MM` (`25 mm`) and `sowingWindows`.
