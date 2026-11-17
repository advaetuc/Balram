# Balram v0.3.2 — Codex Implementation Prompt (Phase 1: Docs Sync + Pure Checkout Domain Engine & Unit Tests)

Copy and paste the prompt below into **Codex** (it will read `BALRAM_V0_3_2_UX_BLUEPRINT.md` directly from your repository root).

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.1` -> `v0.3.2`)**. Read `BALRAM_V0_3_2_UX_BLUEPRINT.md`, `README.md`, and inspect `AGENTS.md`, `src/types/domain.ts`, `src/lib/domain/geometry.ts`, `src/lib/domain/allocation.ts`, and `src/config/cropMatrix.ts`.

Your objective in **Phase 1 of `v0.3.2`** is to execute **Step 1 (Sync `AGENTS.md` to `v0.3.2` / `PERSISTENCE_VERSION = 4`)** and **Step 2 (Build the Pure Crop Checkout Domain Engine `src/lib/domain/checkout.ts` + Unit Tests)**. Do not modify React UI components in this phase.

---

## TASK 1: Update `AGENTS.md` to Match `v0.3.1` / `v0.3.2`
`AGENTS.md` is currently stale at `v0.2.0` (`PERSISTENCE_VERSION = 3`). Update `AGENTS.md` so that:
1. It reflects `v0.3.2` and `PERSISTENCE_VERSION = 4` (`v0–v3` migration in `src/store/useBalramStore.ts`).
2. The codebase map includes all current `v0.3.1` + `v0.3.2` modules (`journey.ts`, `roadmap.ts`, `checkIns.ts`, `checkout.ts`, `backup.ts`, `shareSummary.ts`, `AppShell.tsx`, `JourneyShell.tsx`, `DailyHome.tsx`, `CheckInCard.tsx`, `ProvenanceBadge.tsx`, `StationIcon.tsx`).
3. The pre-commit verification gate includes all 4 mandatory checks: `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.

---

## TASK 2: Create Pure Checkout Domain Engine (`src/lib/domain/checkout.ts`)
Create `src/lib/domain/checkout.ts` to power the Right Crop Checkout Sidebar and Plot Edit Sheet with pure, deterministic functions:

1. **Types & Constants**:
   ```ts
   export type LandSharePreset =
     | "all_remaining"
     | "half_remaining"
     | "one_acre"
     | "plus_10_gunthas"
     | "plus_5_gunthas"
     | "minus_5_gunthas";

   export const DEFAULT_PLOT_NAMES = ["Well Plot", "Borewell Patch", "Canal Plot", "Roadside Field"] as const;

   export interface CheckoutDraftLine {
     readonly draftId: string;
     readonly editingPlotId?: string | null;
     readonly cropId: CropId;
     readonly plotName: string;
     readonly areaGunthas: number;
     readonly alreadyPlanted: boolean;
     readonly lifecycleStage: LifecycleStage;
     readonly plantingDate: string | null;
   }

   export type CheckoutValidationErrorCode =
     | "EMPTY_DRAFT"
     | "INVALID_AREA"
     | "NO_FREE_LAND"
     | "EXCEEDS_AVAILABLE_LAND"
     | "DUPLICATE_PLOT_NAME"
     | "EMPTY_PLOT_NAME";

   export interface CheckoutValidationResult {
     readonly ok: boolean;
     readonly errorCode: CheckoutValidationErrorCode | null;
     readonly overByGunthas: number;
     readonly totalDraftGunthas: number;
     readonly remainingFreeGunthas: number | null;
     readonly message: { readonly en: string; readonly mr: string } | null;
   }
   ```

2. **Functions to Export**:
   - `pickNextDefaultPlotName(existingNames: readonly string[]): string`:
     Returns the first name from `DEFAULT_PLOT_NAMES` not yet used (case-insensitive) in `existingNames`, or `"Plot " + (existingNames.length + 1)` if all 4 are taken.
   - `resolvePresetGunthas(preset: LandSharePreset, currentLineGunthas: number, availableForThisLineGunthas: number | null): number`:
     - Uses integer/1-decimal precision (`Math.round(val * 10) / 10`), minimum `1` guntha (or `availableForThisLineGunthas` if `0 < available < 1`, or `0` if `available === 0`).
     - When `availableForThisLineGunthas === null` (no total farm boundary/area set yet), treat available pool for presets as `80` gunthas (`2 Acres`) for `all_remaining` / `half_remaining`, and uncapped for `one_acre` (`40`), `plus_10_gunthas`, `plus_5_gunthas`.
     - When `availableForThisLineGunthas !== null`:
       - `"all_remaining"`: `Math.max(0, Math.floor(availableForThisLineGunthas * 10) / 10)`
       - `"half_remaining"`: For an integer/odd remainder, round down deterministically to whole gunthas (`Math.max(1, Math.floor(availableForThisLineGunthas / 2))`) when `availableForThisLineGunthas >= 2`, or `availableForThisLineGunthas` if `< 2`, never exceeding `availableForThisLineGunthas`.
       - `"one_acre"`: returns `40` gunthas (so if only `25` gunthas remain free, `validateCheckoutDraft` explicitly flags `EXCEEDS_AVAILABLE_LAND` by `15` gunthas).
       - `"plus_10_gunthas"`: returns `availableForThisLineGunthas !== null ? Math.min(availableForThisLineGunthas, currentLineGunthas + 10) : currentLineGunthas + 10`.
       - `"plus_5_gunthas"`: returns `availableForThisLineGunthas !== null ? Math.min(availableForThisLineGunthas, currentLineGunthas + 5) : currentLineGunthas + 5`.
       - `"minus_5_gunthas"`: returns `Math.max(1, currentLineGunthas - 5)`.
   - `validateCheckoutDraft(lines: readonly CheckoutDraftLine[], existingAllocations: readonly CropAllocation[], totalAreaSquareMetres: number | null): CheckoutValidationResult`:
     - Computes `totalFarmGunthas = totalAreaSquareMetres === null ? null : squareMetresToGunthas(totalAreaSquareMetres)`.
     - Excludes any `existingAllocations` whose `plotId` matches a line's `editingPlotId` (so editing an existing plot counts its previous gunthas as available).
     - Checks:
       1. `lines.length === 0` -> `EMPTY_DRAFT`
       2. Any line with empty `plotName.trim()` -> `EMPTY_PLOT_NAME`
       3. Duplicate `plotName.trim().toLowerCase()` across `lines` or non-edited `existingAllocations` -> `DUPLICATE_PLOT_NAME`
       4. Any line with `!Number.isFinite(line.areaGunthas) || line.areaGunthas <= 0` -> `INVALID_AREA` (or `NO_FREE_LAND` if `totalFarmGunthas !== null && availablePool <= 0`)
       5. If `totalFarmGunthas !== null` and `alreadyAllocatedGunthas + totalDraftGunthas > totalFarmGunthas + 0.05` -> `EXCEEDS_AVAILABLE_LAND` with exact `overByGunthas` and bilingual message (`"Over by X Gunthas"` / `"उपलब्ध जमिनीपेक्षा X गुंठे जास्त"`).
   - `commitCheckoutDraftToAllocations(lines: readonly CheckoutDraftLine[], existingAllocations: readonly CropAllocation[], totalAreaSquareMetres: number | null): CropAllocation[]`:
     - Runs `validateCheckoutDraft` first and throws a `RangeError(validation.message.en)` if `!validation.ok`.
     - Replaces any edited plots (`editingPlotId`) and appends new plots with collision-safe `plotId` (`createFieldId().replace(/^field-/, "plot-")`), deriving `season` from `MaharashtraCropMatrix[line.cropId].season.toLowerCase()`, setting `lifecycleStage: line.alreadyPlanted ? line.lifecycleStage : "planned"`, `growthStage: lifecycleToGrowthStage(...)`, `plantingDate: line.alreadyPlanted ? line.plantingDate : null`, and recomputing `percentage` in 2-decimal basis points across all plots so the returned array passes `CropAllocationsSchema.parse()`.

---

## TASK 3: Add Unit Tests (`tests/release-v032-checkout.test.ts`)
Write unit tests covering:
1. `Half` of an odd remainder (e.g., `25` gunthas -> `12` gunthas, never exceeding free land).
2. `All remaining` after another draft line has already claimed part of the free gunthas.
3. `1 Acre` (`40` gunthas) when only `25` gunthas remain -> `validateCheckoutDraft` returns `ok: false`, `errorCode: "EXCEEDS_AVAILABLE_LAND"`, `overByGunthas: 15`.
4. `remaining = 0` -> returns `NO_FREE_LAND` / `EXCEEDS_AVAILABLE_LAND`.
5. Duplicate plot names (between two draft lines or against an existing plot) -> `DUPLICATE_PLOT_NAME`.
6. `+10 Gunthas` and `±5 Gunthas` stepper bounds (`minus_5_gunthas` floors at `1` guntha; `plus_10_gunthas` / `plus_5_gunthas` caps at remaining free gunthas).
7. `commitCheckoutDraftToAllocations` committing 2 new crops atomically in one call and editing an existing plot in place while passing `CropAllocationsSchema.parse()`.

---

## VERIFICATION GATE (MANDATORY)
Run all four checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `git diff --check`
```
