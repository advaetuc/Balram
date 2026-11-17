# Balram v0.3.2 — Codex Implementation Prompt (Phase 3: Prototype Declutter Pass, Plain-Language Weather Lead & Release Gate)

Copy and paste the prompt below into **Codex** to complete the final phase (**Phase 3: Steps 7 & 8**) of **Balram `v0.3.2`**.

```markdown
You are the Lead Systems Engineer completing **Phase 3 (Steps 7 & 8: Prototype Declutter Pass, Provenance Badge Consolidation, Plain-Language Weather Lead, and `v0.3.2` Release Gate)** of **Balram (`v0.3.2`)**.

Read `BALRAM_V0_3_2_UX_BLUEPRINT.md` (Section 8: Declutter audit) and `AGENTS.md`, and inspect:
- `src/components/dashboard/Card.tsx` (`DataCaption`)
- `src/components/ui/ProvenanceBadge.tsx`
- `src/components/app-shell/{Header,AppShell,PrivacyNotice}.tsx`
- `src/components/map/MapClient.tsx`
- `src/components/dashboard/{WeatherCard,SoilCard,AlertsCard}.tsx`
- `src/components/irrigation/IrrigationPanel.tsx`
- `src/components/report/FarmReport.tsx`
- `package.json` & `README.md`

Your objective is to execute the Section 8 declutter pass across all screens so the prototype feels fast, consumer-friendly, and free of technical boilerplate, while strictly preserving **Invariant 5 (Data Provenance)** via compact badges and keeping `FarmReport.tsx` (A4 print) intact.

---

## STEP-BY-STEP IMPLEMENTATION SPECIFICATION

### 1. Replace Multi-Line `DataCaption` Footers with Compact Provenance Badges (`src/components/dashboard/Card.tsx`)
In `src/components/dashboard/Card.tsx`:
- Refactor `DataCaption` so instead of rendering a multi-line border-top block with `Source: ...`, `Valid at: ...`, and `Fetched: ...` on every card, it renders a single compact inline row of pill badges (`flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-forest/10 text-xs text-stone-600`):
  - Keep the existing `sample`, `modeled`, `stale`, and `offline` badges (`data-badge`).
  - Render `source` as a concise single-line pill or muted inline label, showing `formatTime(fetchedAt ?? validAt)` only when non-null in a compact inline span (`· <time>`) rather than three stacked `<p>` paragraphs.

### 2. Streamline Header, Landing & Footer Privacy Sheet (`Header.tsx`, `AppShell.tsx`, `PrivacyNotice.tsx`)
1. **`src/components/app-shell/Header.tsx`**:
   - Collapse the secondary status ribbon so that when the user is online with fresh saved data (`!state.sampleDataActive && state.connection !== "offline" && !state.weatherStale && state.storageStatus.mode !== "memory" && !state.weatherStatus.error`), it shows a single clean pill (`Saved in this browser` / `या ब्राउझरमध्ये जतन`). Expand the extra status pills only when offline, in sample mode, stale, loading weather, or in memory-only mode.
2. **`src/components/app-shell/AppShell.tsx` (Landing View)**:
   - Merge the language selector (`English` | `मराठी`) directly into the top hero card (or a compact bar inside the hero) so the **`My Farm`** primary CTA card sits immediately below the hero banner without an extra standalone card in between.
   - Make the **Sample Farm (Pune)** entry a clean, compact secondary card/row below **My Farm** so the primary CTA (*Start Setup* / *Continue* / *Open Daily Home*) dominates the screen.
3. **`src/components/app-shell/PrivacyNotice.tsx`**:
   - Keep the footer clean by styling the `<details>` summary as a compact `"Data & privacy / माहिती व गोपनीयता"` link/pill that opens the full provenance and privacy explanation on tap.

### 3. Declutter Land, Weather, Soil, Advice & Water Screens
1. **Land (`src/components/map/MapClient.tsx`)**:
   - In the top summary strip, highlight **Field area** prominently in **Acres & Gunthas** (`text-2xl font-bold text-forest`), and hide the raw 5-decimal `Latitude, Longitude` coordinate readout from the primary banner (coordinates remain editable inside the form below).
   - Relabel the raw vertex textarea `<details>` summary to **`Advanced: Enter or edit boundary coordinates / प्रगत: सीमा निर्देशांक`** so amateur farmers aren't intimidated by raw coordinate pairs.
2. **Weather (`src/components/dashboard/WeatherCard.tsx`)**:
   - Lead the card with a plain-language headline sentence above the metric grid:
     - English: `"Crops lose about ${formatNumber(metrics.et0MmPerDay)} mm of water per day"` (with `Reference ET₀` as the smaller subtitle).
     - Marathi: `"पिकांना दररोज सुमारे ${formatNumber(metrics.et0MmPerDay)} मिमी पाण्याची गरज आहे"`.
   - Summarize rainfall in plain words alongside the number (e.g., `metrics.precipitationMm === 0 ? "No rain expected today" : "${formatNumber(metrics.precipitationMm)} mm rain expected"` / Marathi equivalent).
3. **Soil (`src/components/dashboard/SoilCard.tsx`)**:
   - Remove the legacy `state.soilSnapshot` (`Saved modeled regional soil context`) `<details>` stub from `SoilCard.tsx` (SoilGrids is disabled).
   - Default visibly to **Balram In-House Kit**, and group the alternative test modes (*Soil Health Card kg/ha* and *Full Rapid Kit*) cleanly, with *Skip for now* styled as a clean secondary/quiet action so the primary In-House Kit inputs stand out immediately.
4. **Advice (`src/components/dashboard/AlertsCard.tsx`)**:
   - Only render the `<details><summary>System & data status checks</summary>...</details>` block when `status.length > 0` (i.e., when there is actually an offline, sample-mode, stale, or storage warning to report). When `status.length === 0`, omit the empty technical accordion so **Balram's Field Voice** is the whole screen.
5. **Water (`src/components/irrigation/IrrigationPanel.tsx`)**:
   - Keep the **Simple plot water plan** and **4-phase weekly water table** front and center.
   - Change the `<details><summary>Formula & assumptions</summary>` label to **`How is this calculated? / ही गणना कशी केली जाते?`**.

---

## VERIFICATION & RELEASE GATE (`v0.3.2`)
1. Bump `"version"` in `package.json` from `"0.3.1"` to `"0.3.2"`, and update `README.md` if needed to mention `v0.3.2`.
2. Add or update a test in `tests/release-v032-checkout.test.ts` verifying that `package.json` version is `"0.3.2"` and all existing tests continue to pass.
3. Remove the completed `CODEX_V0_3_2_PHASE_1_PROMPT.md` and `CODEX_V0_3_2_PHASE_2_PROMPT.md` files (and `CODEX_V0_3_2_PHASE_3_PROMPT.md` once read, if desired) so the repo stays clean.
4. Run all four mandatory checks and confirm exit code `0`:
   - `npm run typecheck`
   - `npm test`
   - `npm run build` (confirm `scripts/finalize-release.mjs` exits `0` and regenerates `public/sw.js`)
   - `git diff --check`
```
