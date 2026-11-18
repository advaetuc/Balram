# Balram v0.3.3 — Codex Implementation Prompt (Phase 2: `LandUnitToggle`, Single-Unit `AreaInput` & All Area Surfaces)

Copy and paste the prompt below into **Codex**. It builds directly on `src/lib/domain/landUnits.ts` and `PERSISTENCE_VERSION = 5` (`state.landUnit` / `state.setLandUnit`) from Phase 1.

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.3` — Phase 2)**. Read `BALRAM_V0_3_3_BLUEPRINT.md` and `AGENTS.md`, and inspect:
- `src/lib/domain/landUnits.ts`
- `src/lib/domain/checkout.ts`
- `src/components/app-shell/Header.tsx`
- `src/components/map/MapClient.tsx`
- `src/components/dashboard/PortfolioCard.tsx`
- `src/components/dashboard/CropAdvisorCard.tsx`
- `src/components/crops/CropCheckoutSheet.tsx`
- `src/components/irrigation/IrrigationPanel.tsx`
- `src/components/report/FarmReport.tsx`
- `src/lib/ui/shareSummary.ts`
- `src/config/i18n.ts`

Your objective in **Phase 2 of `v0.3.3`** is to build `<LandUnitToggle />` and `<AreaInput />`, update `checkout.ts` presets for unit-specific labels, and replace every area display and two-box `Acres + Gunthas` input across the app with `formatArea()`, `AreaInput`, and `displayPlotName()`.

---

## STEP-BY-STEP IMPLEMENTATION SPECIFICATION

### 1. Create `src/components/ui/LandUnitToggle.tsx`
- Build a two-option segmented control (`role="radiogroup"`, `aria-label` in `en`/`mr`: `"Land unit"` / `"जमिनीचे एकक"`):
  - Option 1 (`unit === "acres"`): `"Acres"` (`en`) / `"एकर"` (`mr`)
  - Option 2 (`unit === "gunthas"`): `"Gunthas"` (`en`) / `"गुंठे"` (`mr`)
- Each option button must have `min-h-12` (`48px` touch target), `role="radio"`, `aria-checked={state.landUnit === option}`, and selected styling (`bg-forest text-white border-forest` with a `✓` indicator).
- Reads `state.landUnit` and calls `state.setLandUnit(nextUnit)` directly (enabled whenever `state.hydrated` is `true`, including during Sample Mode).

### 2. Create Single-Unit `src/components/ui/AreaInput.tsx`
- Replaces the old two-box (`Acres` + `Gunthas`) inputs in `MapClient.tsx` and `CropCheckoutSheet.tsx`.
- Props: `{ id?: string; label: string; gunthas: number | null; unit: LandUnit; locale: Locale; disabled?: boolean; optional?: boolean; onChangeGunthas: (gunthas: number | null) => void; onValidityChange?: (error: string | null) => void }`.
- Renders a single `<input type="text" inputMode="decimal" className="form-input min-h-12" />` with the active unit label (`Acres / एकर` or `Gunthas / गुंठे`) shown clearly in the label or input suffix.
- Synchronizes its displayed text when `unit` or external `gunthas` changes (displaying `gunthas === null ? "" : formatIndianNumber(gunthasToUnitValue(gunthas, unit), unit === "acres" ? 2 : 1)` when not actively focused/editing).
- On change/blur, validates with `parseAreaInput(raw, unit, locale)` from `src/lib/domain/landUnits.ts` (handling Devanagari digits `०–९` and single comma decimals `"1,25"`).

### 3. Extend Presets in `src/lib/domain/checkout.ts` & `src/config/i18n.ts`
Per Section 5 of `BALRAM_V0_3_3_BLUEPRINT.md`, presets always resolve to gunthas, with labels and fixed-step choices adapted to `state.landUnit`:
- In `src/lib/domain/checkout.ts`:
  - Add `"twenty_gunthas"` (`20` gunthas = `0.5` Acre) to `LandSharePreset` (`resolvePresetGunthas("twenty_gunthas", ...)` returns `20` gunthas, just as `"one_acre"` returns `40` gunthas).
  - Use `AREA_EPSILON_GUNTHAS` (`0.01`) from `./landUnits` when checking remaining free land so float drift near zero never falsely triggers an overage or leaves `0.001` gunthas behind.
- In `src/components/crops/CropCheckoutSheet.tsx`:
  - Display preset labels based on `state.landUnit`:
    - `all_remaining`: `"All remaining"` / `"उरलेली सर्व जमीन"`
    - `half_remaining`: `"Half"` / `"निम्मे"`
    - Fixed size preset: in `"acres"` mode use `"one_acre"` (`"1 Acre"` / `"१ एकर"`); in `"gunthas"` mode use `"twenty_gunthas"` (`"20 Gunthas"` / `"२० गुंठे"`).
    - Add preset (`plus_10_gunthas` = `10` gunthas = `0.25` acre): in `"acres"` mode label as `"+0.25 Acre"` / `"+०.२५ एकर"`; in `"gunthas"` mode label as `"+10 Gunthas"` / `"+१० गुंठे"`.
    - Stepper presets (`minus_5_gunthas` / `plus_5_gunthas` = `±5` gunthas = `±0.125` acre): in `"acres"` mode label as `"−0.12 Acre"` / `"+0.12 Acre"` (or `"−5 Gunthas"` / `"+5 Gunthas"` in Gunthas mode).

### 4. Wire `LandUnitToggle`, `formatArea`, `AreaInput`, and `displayPlotName` Across All Surfaces
Do **NOT** change nutrient (`kg/ha`), rainfall/ET₀ (`mm`), temperature (`°C`), or percentage (`%`) units—only land area values:
1. **`src/components/app-shell/Header.tsx`**:
   - Mount `<LandUnitToggle />` beside the `English / मराठी` toggle in the header navigation bar (allowing clean wrapping on `< sm` mobile screens).
2. **`src/components/map/MapClient.tsx`**:
   - **Field Area Headline (Dual Display Surface #1)**: Render `formatArea(squareMetresToGunthas(state.fieldGeometry.areaSquareMetres), state.landUnit, state.locale, { includeSecondary: true })`.
   - **Manual Entry Form**: Replace the two-box `Acres` and `Gunthas (0–39)` inputs with the single-unit `<AreaInput />` component.
3. **`src/components/dashboard/CropAdvisorCard.tsx`**:
   - Format the remaining free land line using `formatArea(remainingFreeGunthas, state.landUnit, state.locale)` and total land using `formatArea(totalGunthas, state.landUnit, state.locale)`.
4. **`src/components/crops/CropCheckoutSheet.tsx`**:
   - Mount `<LandUnitToggle />` in the Checkout header beside the land meter so farmers can switch units without leaving checkout.
   - **Land Meter (Dual Display Surface #2)**: Format remaining free land with `formatArea(remaining, state.landUnit, state.locale, { includeSecondary: true })`.
   - Format each draft line's size legend with `formatArea(line.areaGunthas, state.landUnit, state.locale)`.
   - Replace the two-box `Custom size` inputs with a single `<AreaInput />`.
   - Render preset plot chip labels through `displayPlotName(name, state.locale)` while keeping the underlying canonical preset name or farmer-typed name consistent.
5. **`src/components/dashboard/PortfolioCard.tsx`**:
   - Format `Total farm land`, `Allocated to plots`, `Unassigned / fallow`, and each plot row's area using `formatArea(gunthas, state.landUnit, state.locale)`.
   - Render each plot's title using `displayPlotName(plot.plotName, state.locale, index + 1)`.
6. **`src/components/irrigation/IrrigationPanel.tsx`**:
   - In the plot `<select>` options, replace `(${p.areaGunthas ?? "?"} gunthas)` with `(${areaGunthas ? formatArea(areaGunthas, state.landUnit, state.locale) : "?"})` and use `displayPlotName(p.plotName, state.locale, i + 1)`.
7. **`src/components/report/FarmReport.tsx` & `src/lib/ui/shareSummary.ts`**:
   - **Printable Report (`FarmReport.tsx` — Dual Display Surface #3)**: Format field area and plot areas using `formatArea(gunthas, state.landUnit, state.locale, { includeSecondary: true })` and render plot names with `displayPlotName`.
   - **Share Summary (`shareSummary.ts`)**: Format total land and plot sizes using `formatArea(gunthas, state.landUnit, state.locale)` and `displayPlotName`.

---

## VERIFICATION GATE (MANDATORY)
1. Add unit tests in `tests/units.test.ts` (or `tests/release-v032-checkout.test.ts`) verifying:
   - `resolvePresetGunthas("twenty_gunthas", ...)` resolves to `20` gunthas.
   - `buildShareSummary` formats land and plot areas in `"acres"` mode when `state.landUnit === "acres"` and in `"gunthas"` mode when `state.landUnit === "gunthas"`, and uses `displayPlotName` for Marathi preset plot names.
2. Run all four checks and confirm exit code `0`:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `git diff --check`
```
