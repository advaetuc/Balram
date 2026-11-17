# Balram v0.3.2 UX Blueprint (Source-Validated Edition)

*Prepared 17 November 2026 · Overseer: Claude · Source Reviewer & Architect: Gemini · Implementer: Codex*

## 0. Source Validation & Refinements (Gemini Architect Audit)

All 5 assumptions in Section 3 have been verified against `/Users/advaet/Projects/Balram`:

1. **Assumption 1 (Station Progress Derived, Not Persisted) — CONFIRMED:** `src/lib/domain/journey.ts` derives all 6 station statuses purely from `PersistedFarm` data (`fieldGeometry`, `weatherSnapshot`, `soilKitReading`/`soilSkipped`, `cropAllocations`, `setupCompletedAt`). Swapping `CropAdvisorCard` into Station 4 (`My Crops`) and leaving `AlertsCard` (Field Voice) as the sole focus of Station 5 (`Balram's Advice`) requires **zero** schema migration (`PERSISTENCE_VERSION` stays `4`).
2. **Assumption 2 (`MaharashtraCropMatrix` Size vs. Expander) — ADJUSTED FOR 6-CROP MATRIX:** `src/config/cropMatrix.ts` currently contains 6 crops (`sugarcane`, `rabi_jowar`, `onion`, `bajra`, `pomegranate`, `groundnut`). To make the primary Advisor view clean and the expander meaningful today, display the **Top 3 Recommended Crops ("Best Matches")** upfront with a **"Show all 6 crops / सर्व ६ पिके पहा"** toggle that expands the remaining 3 ranked crops.
3. **Assumption 3 (Station 4 Complete = At Least One Valid Plot) — CONFIRMED:** `hasValidCropPlan()` in `src/lib/domain/journey.ts` unlocks Station 5 as soon as `cropAllocations` has at least one valid plot within total farm gunthas.
4. **Assumption 4 (Crop Commits Do Not Trigger `invalidate()`) — CONFIRMED:** `setCropAllocations()` in `src/store/useBalramStore.ts` only updates `cropAllocations` and `planningUpdatedAt`, leaving `weatherSnapshot` intact.
5. **Assumption 5 (`AGENTS.md` Is Stale at `v0.2.0`) — CONFIRMED:** `AGENTS.md` still references `v0.2.0` and `PERSISTENCE_VERSION = 3`. Phase 1 updates `AGENTS.md` to `v0.3.2` (`PERSISTENCE_VERSION = 4`) before touching any application code.
6. **UX Enhancement — Live Right Checkout Sidebar on Desktop (`lg+`) + Slide-Up Sheet on Mobile (`< lg`):** To honor the core product vision (*"Make a right sidebar which will be populated when the user selects a crop"*), on desktop screens (`lg:grid-cols-[minmax(0,1fr)_360px]`) the **Crop Checkout Sidebar** stays visibly docked on the right of the Crop Advisor grid and populates immediately on the first tap without requiring an extra click to open a modal. On smaller screens (`< lg`), a sticky bottom summary bar opens the slide-up checkout sheet (`role="dialog"`).

---

## 1. Core UX Decisions Locked for `v0.3.2`

1. **Station 4 (`My Crops`) & Station 5 (`Balram's Advice`) Swap:**
   - **Station 4 (`My Crops`):** Houses the **Crop Advisor** (left/main column) + **Right Checkout Sidebar / Mobile Checkout Drawer** + compact **Your Plots** list below.
   - **Station 5 (`Balram's Advice`):** Houses **Balram's Field Voice (`AlertsCard`)** exclusively, now generated from the plots the farmer just confirmed in Station 4.
2. **Explicit Checkout Before Committing to Store:**
   - Tapping a crop in `CropAdvisorCard` does **not** immediately write to `useBalramStore`. Instead, it toggles the crop into an ephemeral **Checkout Draft** (`selected ✓` border + check badge) and populates the Right Checkout Sidebar.
   - Only when the farmer taps the primary 56px forest-green **"Confirm & Add to Farm Plan"** button in the Checkout Sidebar are the draft lines committed atomically via `state.setCropAllocations(...)`.
3. **One-Tap Land Share Presets & Plot Chips (No Overwhelming Forms):**
   - Inside the Checkout Sidebar (for both creating new plots and editing existing plots):
     - **Plot Name Chips:** Quick-select pills (`Well Plot`, `Borewell Patch`, `Canal Plot`, `Roadside Field`, pre-selecting the first unused name) + optional `Custom name` chip.
     - **Land Share Presets:** Large, visually demanding preset buttons (`All Remaining`, `Half Remaining`, `1 Acre`, `+10 Gunthas`, plus `-5G` / `+5G` steppers) that compute exact Acres & Gunthas against remaining unassigned land, with manual Acres/Gunthas boxes tucked behind a `Custom size` toggle.
     - **Planting Status Two-Chip Row:** `Not planted yet` (default -> sets `lifecycleStage: "planned"`) vs. `Already planted` (reveals the 4 lifecycle stage pills and optional planting date picker).
4. **Compact "Your Plots" List with 10-Second Undo Toast:**
   - Replaces the heavy multi-input `PortfolioCard` boxes and deletes the redundant bottom `"Add new plot"` manual form.
   - Each committed plot renders as a clean summary row (`Plot Name · Crop · X Acres Y Gunthas · Stage Badge`) with an **Edit** button (which opens that plot in the Checkout Sidebar/Sheet) and a **Remove** action inside Edit that triggers a 10-second **Undo** toast (`aria-live="polite"`).
5. **Prototype Declutter Without Losing Provenance (Invariant 5):**
   - Replace verbose multi-line `DataCaption` footers on cards with compact `ProvenanceBadge` pills + a single **"Data & privacy"** collapsible/modal sheet in the footer.
   - Collapse raw vertex coordinate textareas under `"Advanced boundary coordinates"`, hide `"System & data status checks"` in `AlertsCard` unless an active warning exists, and lead `WeatherCard` with plain language (*"Crops lose about X.X mm of water per day"*).

---

## 2. Three-Phase Execution Plan (Gemini -> Codex)

* **Phase 1 (Docs Sync + Pure Checkout Domain Engine & Unit Tests):**
  * Update `AGENTS.md` to `v0.3.2` (`PERSISTENCE_VERSION = 4`).
  * Create `src/lib/domain/checkout.ts` with pure preset math, draft validation, and atomic allocation conversion.
  * Add comprehensive unit tests in `tests/release-v032-checkout.test.ts`.
* **Phase 2 (Station 4/5 Swap, Visual Crop Advisor, Right Checkout Sidebar & Compact Plot List with Undo):**
  * Create `src/components/crops/CropCheckoutSheet.tsx` (docked Right Sidebar on `lg+`, slide-up sheet on `< lg`).
  * Upgrade `src/components/dashboard/CropAdvisorCard.tsx` (Top 3 + `"Show all 6 crops"`, selected state border/badge, no-free-land state, zero silent no-ops).
  * Refactor `src/components/dashboard/PortfolioCard.tsx` into the compact **Your Plots** list with Edit mode and 10-second Undo toast.
  * Swap Station 4 and Station 5 contents in `src/components/journey/JourneyShell.tsx`.
* **Phase 3 (Prototype Declutter Pass, Plain-Language Weather Lead & `v0.3.2` Release Gate):**
  * Declutter `Header.tsx`, `MapClient.tsx`, `WeatherCard.tsx`, `SoilCard.tsx`, `AlertsCard.tsx`, `IrrigationPanel.tsx`, and `Card.tsx` (`DataCaption`), bump version to `0.3.2`, and pass `npm run typecheck`, `npm test`, and `npm run build`.
