# Balram v0.3.2 — Codex Implementation Prompt (Phase 2: Station 4/5 Swap, Visual Crop Advisor, Right Checkout Sidebar & Compact Plots List with Undo)

Copy and paste the prompt below into **Codex**. It builds directly on `src/lib/domain/checkout.ts` from Phase 1.

```markdown
You are the Lead Systems Engineer working on **Balram (`v0.3.2` — Phase 2)**. Read `BALRAM_V0_3_2_UX_BLUEPRINT.md` and `AGENTS.md`, and inspect:
- `src/lib/domain/checkout.ts`
- `src/components/journey/JourneyShell.tsx`
- `src/components/home/DailyHome.tsx`
- `src/components/dashboard/CropAdvisorCard.tsx`
- `src/components/dashboard/PortfolioCard.tsx`
- `src/config/i18n.ts`

Your objective in **Phase 2 of `v0.3.2`** is to execute **Steps 3, 4, 5, and 6** of the blueprint:
1. Swap Station 4 (`My Crops`) and Station 5 (`Balram's Advice`) contents in `JourneyShell.tsx`.
2. Upgrade `CropAdvisorCard.tsx` with visual selection states (`Selected ✓`), Top-3 + `"Show all 6 crops"` expander, and explicit `"No free land"` feedback (eliminating the silent `scrollIntoView` no-op).
3. Build `src/components/crops/CropCheckoutSheet.tsx` (live docked **Right Checkout Sidebar** on `lg+` screens + sticky summary bar & slide-up dialog sheet on `< lg` mobile screens) powered by `src/lib/domain/checkout.ts`.
4. Refactor `PortfolioCard.tsx` into a compact **Your Plots** list where **Edit** opens the plot in the Checkout Sidebar/Sheet, **Remove plot** lives inside Edit with a **10-second Undo toast**, and the old manual bottom `"Add new plot"` form is removed.

Keep `PERSISTENCE_VERSION = 4` unchanged, add no external npm dependencies, and preserve all 7 invariants in `AGENTS.md`.

---

## STEP-BY-STEP IMPLEMENTATION SPECIFICATION

### 1. Add Bilingual (`en` & `mr`) Strings in `src/config/i18n.ts`
Add strongly typed English and Marathi strings in `src/config/i18n.ts` for:
- Crop Advisor states: `chooseCrop` (*"Choose this crop"* / *"हे पीक निवडा"*), `selectedCrop` (*"Selected ✓ (tap to remove)"* / *"निवडले ✓ (काढण्यासाठी दाबा)"*), `noFreeLand` (*"No free land · Edit a plot below"* / *"मोकळी जमीन नाही · खालील प्लॉट बदला"*), `showAllCrops` (*"Show all 6 crops"* / *"सर्व ६ पिके पहा"*), `showTopCrops` (*"Show top 3 matches"* / *"मुख्य ३ पिके पहा"*).
- Checkout Sidebar / Sheet: `checkoutTitle` (*"Your crop plan"* / *"तुमचे पीक नियोजन"*), `checkoutEmpty` (*"Tap a crop on the left to configure its plot and add it to your farm plan."* / *"प्लॉट ठरवण्यासाठी आणि नियोजनात जोडण्यासाठी डावीकडील पीक निवडा."*), `freeLandOf` (*"free of"* / *"शिल्लक / एकूण"*), `plotNameLabel` (*"Plot name"* / *"प्लॉटचे नाव"*), `customName` (*"Custom name"* / *"इतर नाव"*), `landShareLabel` (*"Land size"* / *"जमिनीचे क्षेत्र"*), `presetAllRemaining` (*"All remaining"* / *"सर्व शिल्लक जमीन"*), `presetHalf` (*"Half"* / *"अर्धी जमीन"*), `presetOneAcre` (*"1 Acre"* / *"१ एकर"*), `presetPlus10G` (*"+10 Gunthas"* / *"+१० गुंठे"*), `customSize` (*"Custom size"* / *"अचूक माप"*), `plantingStatusLabel` (*"Planting status"* / *"लागवडीची स्थिती"*), `notPlantedYet` (*"Not planted yet"* / *"अजून लागवड नाही"*), `alreadyPlanted` (*"Already planted"* / *"लागवड झाली आहे"*), `confirmCheckout` (*"Add to my farm plan"* / *"माझ्या शेत नियोजनात जोडा"*), `savePlotChanges` (*"Save plot changes"* / *"प्लॉट बदल जतन करा"*), `keepBrowsing` (*"Keep browsing"* / *"मागे जा"*), `removeFromDraft` (*"Remove crop"* / *"पीक काढा"*), `reviewSelection` (*"Review & confirm"* / *"तपासा व निश्चित करा"*).
- Compact Plot List & Undo Toast: `yourPlots` (*"Your plots"* / *"तुमचे प्लॉट"*), `editPlot` (*"Edit"* / *"बदला"*), `removePlot` (*"Remove plot"* / *"प्लॉट काढा"*), `undo` (*"Undo"* / *"पूर्ववत करा"*), `plotAddedToast` (*"Added to your farm plan"* / *"शेत नियोजनात जोडले"*), `plotRemovedToast` (*"Plot removed"* / *"प्लॉट काढला"*).

---

### 2. Create `src/components/crops/CropCheckoutSheet.tsx`
Build a shared, accessible checkout component used for both **creating new plots from selected crops** and **editing an existing plot**:
- **Responsive Presentation**:
  - **Desktop (`lg:block`)**: Renders as a sticky **Right Checkout Sidebar (`w-full lg:w-[360px] xl:w-[380px]`)** beside the Crop Advisor cards so tapping a crop immediately populates the right sidebar with zero extra modal clicks.
  - **Mobile (`< lg`)**: When `lines.length > 0`, renders a sticky summary bar (`X crops · Y Acres Z Gunthas free · [Review & confirm]`) above the bottom navigation bar; tapping `[Review & confirm]` (or tapping `Edit` on a plot) opens a slide-up bottom sheet (`role="dialog"`, `aria-modal="true"`, Escape key handler to close).
- **Anatomy of Each `CheckoutDraftLine`**:
  - **Header**: Crop name (`English` / `मराठी`), one-line "why it fits" note, and a `Remove crop` button (when creating) or `Cancel edit` button (when editing).
  - **Plot Name Selector**:
    - 4 quick-pick chips from `DEFAULT_PLOT_NAMES` (`Well Plot`, `Borewell Patch`, `Canal Plot`, `Roadside Field`) + a `Custom name` chip that opens a text `<input maxLength={60}>`.
  - **Visually Demanding Land Share Presets (`min-h-12`)**:
    - Prominent size readout in **`X Acres Y Gunthas`** (`gunthasToAcresAndGunthas(line.areaGunthas)`).
    - Preset buttons calling `resolvePresetGunthas(...)` from `src/lib/domain/checkout.ts` against the remaining pool after other draft lines:
      - `All remaining` (`all_remaining`)
      - `Half` (`half_remaining`)
      - `1 Acre` (`one_acre`)
      - `+10 Gunthas` (`plus_10_gunthas`)
      - Stepper buttons `−5G` (`minus_5_gunthas`) and `+5G` (`plus_5_gunthas`)
    - A `Custom size` toggle chip that reveals side-by-side `Acres` and `Gunthas (0–39)` numeric inputs when the farmer wants an exact custom number.
  - **Planting Status Two-Chip Row (`min-h-12`)**:
    - Chip 1: **Not planted yet** (`alreadyPlanted: false`, default) — shows no extra fields and sets stage to `planned`.
    - Chip 2: **Already planted** (`alreadyPlanted: true`) — reveals the 4 lifecycle stage pills (`planned`, `vegetative`, `flowering_fruiting`, `harvesting`) and optional `Planting date` `<input type="date">`.
  - **When in Edit Mode (`line.editingPlotId != null`)**:
    - Include a **`Remove plot / प्लॉट काढा`** button inside the sheet that triggers the parent's `onRemovePlot(line.editingPlotId)` handler (which activates the 10-second Undo toast) without a confirmation dialog.
- **Validation & Atomic Commit**:
  - Call `validateCheckoutDraft(lines, existingAllocations, totalAreaSquareMetres)`.
  - Render a full-width, `min-h-14` (`56px`) primary `bg-forest text-white` button:
    - Enabled when `validation.ok && !state.sampleDataActive && state.hydrated`.
    - When `!validation.ok && lines.length > 0`, disable the button and display `validation.message[state.locale]` clearly (e.g., `"Over by 15 Gunthas"`).
    - On click: call `commitCheckoutDraftToAllocations(lines, existingAllocations, totalAreaSquareMetres)` and write once via `state.setCropAllocations(next)`, clear the draft, close the mobile sheet, emit the `aria-live="polite"` toast, and scroll smoothly to `#your-plots`.

---

### 3. Upgrade `src/components/dashboard/CropAdvisorCard.tsx`
- Accept optional props `{ selectedCropIds?: readonly CropId[]; onToggleCrop?: (cropId: CropId) => void; remainingFreeGunthas?: number | null }` (or coordinate cleanly with the parent workspace).
- **Top 3 Upfront + Expander**:
  - Display the **Top 3 ranked crops** by default, with a `min-h-12` button **`Show all 6 crops / सर्व ६ पिके पहा`** that expands to show all 6 ranked crops in `MaharashtraCropMatrix` (and toggles back to `Show top 3 matches`).
- **Three Visual Card States (Zero Silent No-Ops)**:
  1. **Selected (`selectedCropIds.includes(rec.cropId)`)**: Card has `ring-4 ring-forest border-forest bg-forest/5`, a `Selected ✓` badge, and the button reads **`Selected ✓ (tap to remove)`**.
  2. **No Free Land (`!isSelected && remainingFreeGunthas !== null && remainingFreeGunthas <= 0`)**: Button is disabled (`disabled`) and reads **`No free land · Edit a plot below`**.
  3. **Default**: Card has standard border and a high-contrast `min-h-12` button **`Choose this crop / हे पीक निवडा`**.
- Remove the old `scrollIntoView` silent no-op.

---

### 4. Refactor `src/components/dashboard/PortfolioCard.tsx` into Compact "Your Plots" + Unified Crop Planning Workspace
- Replace the heavy multi-input per-plot cards and **delete** the bottom manual `"Add new plot"` form.
- In `PortfolioCard.tsx` (used in Station 4 `My Crops` and in Daily Home's `My Farm` tab):
  - Render a responsive 2-column desktop layout (`lg:grid-cols-[minmax(0,1fr)_370px] gap-6 items-start`):
    - **Left Column**:
      1. `<CropAdvisorCard />` (allowing the farmer to select/deselect crops into the checkout draft).
      2. **Compact `Your Plots` section (`id="your-plots"`)**:
         - Top 3-metric land meter (`Total farm land` | `Allocated to plots` | `Unassigned / fallow`).
         - Each committed plot in `state.cropAllocations` renders as a compact row card showing:
           - **Plot Name** · **Crop Name** (`English` / `मराठी`)
           - **Land Size** (`X Acres Y Gunthas · P%`)
           - **Lifecycle Stage Badge**
           - One **`Edit / बदला`** button (`min-h-12`) that loads that plot into `CropCheckoutSheet` (`editingPlotId: plot.plotId`).
         - Note: Do NOT put a direct `Remove` button on the list row; `Remove plot` lives inside the Edit sheet.
    - **Right Column (Sticky on `lg+`, Bottom Bar + Sheet on `< lg`)**:
      - `<CropCheckoutSheet />` bound to the active draft/edit state.
  - **10-Second Undo Toast on Plot Removal**:
    - When the farmer taps `Remove plot` inside the Edit sheet:
      - Save `{ removedPlot, previousAllocations }` in component state and start a 10-second `window.setTimeout`.
      - Immediately update `state.setCropAllocations(allocationsWithoutPlot)` and close the Edit sheet.
      - Render an `aria-live="polite"` toast bar with `"Plot removed: <Plot Name>"` and a `min-h-12` **`Undo / पूर्ववत करा`** button that restores `previousAllocations` in a single `state.setCropAllocations(...)` write and clears the timer.

---

### 5. Swap Station 4 and Station 5 in `src/components/journey/JourneyShell.tsx`
- In `src/components/journey/JourneyShell.tsx`:
  - **Station 4 (`activeStation === "crops"`)**: Render `<PortfolioCard />` (which now contains the unified Crop Advisor + Right Checkout Sidebar + Compact `Your Plots` list).
  - **Station 5 (`activeStation === "advice"`)**: Render `<AlertsCard />` (Balram's Field Voice) only—remove `<CropAdvisorCard />` from Station 5 so recommendations happen in Station 4 and Field Voice advice focuses 100% on the farmer's confirmed plots in Station 5.

---

## VERIFICATION GATE (MANDATORY)
1. Add or update unit/integration tests in `tests/release-v032-checkout.test.ts` (or `tests/release-b-shell.test.ts`) verifying Station 4/5 locking behavior and undo/edit state restoration.
2. Run all four checks and confirm exit code `0`:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `git diff --check`
```
