# Balram v0.2.1 (Release A) — Codex Implementation Prompt

Copy and paste the prompt below into **Codex**. Note that `BALRAM_V0_3_BLUEPRINT.md` has already been written into your `/Users/advaet/Projects/Balram/` repository root with all 10 source-code verification items resolved, so Codex can read it directly from disk.

```markdown
You are the Lead Systems Engineer working on **Balram**. Read `AGENTS.md` and `BALRAM_V0_3_BLUEPRINT.md` in the repository root before making any changes.

Your task in this phase is to execute **Release A (`v0.2.1` — Stabilization, Marathi Parity, Canonical Guntha Math, Vertisol Soil Validity, Invariant 1 Date Fix, and Zero-Dependency Test Suite)** covering items **A1 through A7** in Section 3 of `BALRAM_V0_3_BLUEPRINT.md`. Do NOT start Release B (`PERSISTENCE_VERSION = 4` or the v0.3 shell) in this pass; keep `PERSISTENCE_VERSION = 3`.

---

## STEP-BY-STEP IMPLEMENTATION SPECIFICATION (A1–A7)

### A1. Zero-Dependency Test Suite (`node:test`)
Because the build environment runs offline without installing new npm packages, do NOT run `npm install` or add `vitest`. Instead:
1. Create a lightweight test runner setup using Node 22's built-in `node:test` and `node:assert/strict` (for example, compiling a test file or test directory via a dedicated `tsconfig.test.json` into `.next/test-dist` and running `node --test .next/test-dist/**/*.test.js`, or an equivalent zero-dependency Node script).
2. Add `"test": "..."` to `"scripts"` in `package.json`.
3. Write unit tests covering:
   - **Geometry & Gunthas (`geometry.ts`)**: `40 gunthas = 1 acre`, `[lat, lng] -> [lng, lat]` conversion, and duplicate closing vertex normalization in `closeRing`/`calculateFieldGeometry`.
   - **Canonical Guntha Plot Allocation (`allocation.ts`)**: Adding multiple plots of the same crop (`onion`), updating plot gunthas via `updatePlotGunthas` (verifying `percentage` is always recomputed in basis points and total gunthas cannot exceed `totalFarmGunthas`), and verifying `upsertPlotAllocation` derives `season` from `MaharashtraCropMatrix[cropId].season.toLowerCase()` (e.g., `"rabi"` for `onion`, `"perennial"` for `sugarcane` and `pomegranate`).
   - **Vertisol Soil Kit & Gypsum Gating (`soilKit.ts`)**: Verifying `pH 8.0` with `salinity: "normal"` does NOT recommend gypsum, whereas `pH 8.4` with `salinity: "high"` or `"elevated"` DOES recommend gypsum; `pH 5.5` recommends lime; and every step (`ph`, `nitrogen`, `phosphorus`, `potassium`, `organic_carbon`, `salinity`) has distinct, non-English Marathi (`mr`) strings in `badgeLabel`, `plainExplanation`, and `actionStep`.
   - **Crop Recommendations & Invariant 1 Determinism (`cropRecommendations.ts`)**: Verifying `getSeasonalCropRecommendations` is 100% deterministic when `monthZeroIndexed` is omitted (never calling `new Date()`), and verifying `pH 8.0` with `onion` (within Vertisol `tolerablePhRange`) does not trigger `amend = true`.
   - **Field Voice Marathi Parity (`fieldVoice.ts`)**: Verifying each of the 7 rules + fallback has a distinct, human-readable English (`en`) and Marathi (`mr`) `headline`, `message`, and `actionLabel`.

---

### A2. Marathi Integrity Across `AlertsCard.tsx`, `fieldVoice.ts`, `soilKit.ts`, and `i18n.ts`
1. **`src/lib/domain/fieldVoice.ts`**:
   - Replace the generic `headline: { en: ruleId.replaceAll("_", " "), mr: "शेतासाठी सूचना" }` with distinct, clear bilingual headlines for all 8 rule IDs:
     - `heat_vertisol_cracking`: `{ en: "High heat & black soil cracking risk", mr: "तीव्र उन्हामुळे काळी जमीन भेगाळण्याचा धोका" }`
     - `vegetative_nitrogen_low`: `{ en: "Low nitrogen during active leaf growth", mr: "वाढीच्या काळात नत्राची (N) कमतरता" }`
     - `sowing_phosphorus_low`: `{ en: "Low phosphorus for root establishment", mr: "मुळांच्या वाढीसाठी स्फुरदाची (P) कमतरता" }`
     - `alkaline_lockup_warning`: `{ en: "High alkalinity may lock up nutrients", mr: "जास्त सामूमुळे (pH) अन्नद्रव्ये अडकण्याचा धोका" }`
     - `flowering_peak_water`: `{ en: "Peak water need during flowering", mr: "फुलोरा व फळधारणेच्या काळात पाण्याची मुख्य गरज" }`
     - `rabi_cold_night_guard`: `{ en: "Cold night alert for onion plot", mr: "कांदा प्लॉटसाठी रात्रीच्या थंडीचा इशारा" }`
     - `harvest_rain_warning`: `{ en: "Rain forecast during harvest window", mr: "काढणीच्या काळात पावसाची शक्यता" }`
     - `general_seasonal_guidance`: `{ en: "Seasonal field check", mr: "हंगामी शेत तपासणी" }`
2. **`src/lib/domain/soilKit.ts`**:
   - In `phText`, provide complete, natural Marathi (`mr`) strings for both `plainExplanation` and `actionStep` across all 5 pH categories (`strongly_acidic`, `slightly_acidic`, `optimal_neutral`, `moderately_alkaline`, `strongly_alkaline`) instead of passing the English `p[2]` and `p[3]` into the Marathi slots.
   - Provide natural Marathi (`mr`) `plainExplanation` and `actionStep` strings for `nitrogen` (low/medium/high), `phosphorus` (low/medium/high), `potassium`, `organic_carbon`, and `salinity` so zero English sentences appear when `locale === "mr"`.
3. **`src/components/dashboard/AlertsCard.tsx`**:
   - Import `t` from `@/config/i18n` and use `text = t(state.locale)` for the Card `title={text.voice}` and `eyebrow={text.voiceEyebrow}`.
   - Render `state.locale === "mr" ? a.headline.mr : a.headline.en`, `state.locale === "mr" ? a.message.mr : a.message.en`, and `state.locale === "mr" ? a.actionLabel.mr : a.actionLabel.en`.
   - Localize the priority badge labels (`Urgent Field Action` / `तातडीची कृती`, `Soil & Nutrient Action` / `माती व पोषण कृती`, `Field Tip` / `शेत टीप`) and the collapsible system status checks summary/messages for `en` and `mr`.

---

### A3. Select Plot by `plotId` in `src/components/irrigation/IrrigationPanel.tsx`
- Replace `const [cropId, setCropId] = useState(state.cropAllocations[0]?.cropId ?? "")` with `const [selectedPlotId, setSelectedPlotId] = useState(state.cropAllocations[0]?.plotId ?? state.cropAllocations[0]?.cropId ?? "")`.
- Resolve the active plot via:
  ```ts
  const selectedPlot = state.cropAllocations.find(
    (item, idx) => (item.plotId ?? `${item.cropId}-${idx}`) === selectedPlotId
  ) ?? state.cropAllocations[0];
  ```
- Update both the Simple Plot Water Plan `<select>` and the Advanced Measured Override `<select>` to use each plot's unique key (`plot.plotId ?? `${plot.cropId}-${idx}``) as the option `value`, displaying `${plot.plotName ?? "Plot"} · ${cropName} (${areaGunthas} gunthas)`.
- Ensure selecting between two different plots that share the same `cropId` (e.g., two `onion` plots of different guntha sizes or stages) accurately updates the water calculations for that specific plot.

---

### A4. Make `areaGunthas` Canonical in `src/lib/domain/allocation.ts` & `src/components/dashboard/PortfolioCard.tsx`
1. In `src/lib/domain/allocation.ts`:
   - Export a canonical helper `updatePlotGunthas(plots: readonly CropAllocation[], targetPlotId: string, nextGunthas: number, totalAreaSquareMetres: number | null): CropAllocation[]`:
     - Validates `nextGunthas > 0` (rounded to at most 1 decimal place).
     - Resolves each plot's gunthas, replaces the target plot's `areaGunthas` with `nextGunthas`, and checks that if `totalAreaSquareMetres !== null`, the sum of all plots' gunthas does not exceed `totalFarmGunthas + 0.05` (throwing a descriptive `RangeError` if it exceeds available farm land).
     - Recomputes `percentage` in 2-decimal basis points (`Math.round((plotGunthas / denominator) * 10000) / 100`, where `denominator = totalFarmGunthas ?? sumOfAllPlotGunthas`) across all plots so `percentage` is always derived from `areaGunthas`.
2. In `src/components/dashboard/PortfolioCard.tsx`:
   - Route the Acres input, the Gunthas input, the `+5 Gunthas` button, the `−5 Gunthas` button, and the `Use remaining land` button through `updatePlotGunthas(...)` so `percentage` is never left stale or out of sync.

---

### A5. Derive Plot `season` from `MaharashtraCropMatrix` in `src/lib/domain/allocation.ts`
- In `upsertPlotAllocation()` in `src/lib/domain/allocation.ts`:
  - Import `MaharashtraCropMatrix, type CropId` from `@/config/cropMatrix`.
  - Set `season: (MaharashtraCropMatrix[input.cropId as CropId]?.season.toLowerCase() ?? "kharif") as CropAllocation["season"]` instead of hardcoding `"kharif" as const`.
  - Ensure `plotId` generation uses a collision-safe unique ID (e.g., `createFieldId().replace(/^field-/, "plot-")` from `./geometry`) so two plots created in the same millisecond during tests never collide on `plotId: "plot-" + Date.now()`.

---

### A6. Deccan Vertisol `tolerablePhRange`, Gypsum Gating & Invariant 1 Date Determinism
1. **`src/config/cropMatrix.ts`**:
   - Add `readonly tolerablePhRange: readonly [number, number];` to `CropThresholds`:
     - `sugarcane`: `optimalPhRange: [6.5, 8.0]`, `tolerablePhRange: [6.0, 8.3]`
     - `rabi_jowar`: `optimalPhRange: [6.0, 8.5]`, `tolerablePhRange: [5.8, 8.6]`
     - `onion`: `optimalPhRange: [6.0, 7.5]`, `tolerablePhRange: [5.8, 8.1]`
     - `bajra`: `optimalPhRange: [6.5, 8.5]`, `tolerablePhRange: [6.0, 8.6]`
     - `pomegranate`: `optimalPhRange: [6.5, 8.5]`, `tolerablePhRange: [6.0, 8.7]`
     - `groundnut`: `optimalPhRange: [6.0, 7.8]`, `tolerablePhRange: [5.8, 8.1]`
2. **`src/lib/domain/cropRecommendations.ts`**:
   - **Fix Invariant 1 Violation**: Remove `new Date().getMonth()`. Default `monthZeroIndexed` to `9` (October / Rabi) when `p.monthZeroIndexed === undefined`.
   - **Vertisol pH Scoring**:
     - If `soil.ph < c.tolerablePhRange[0] || soil.ph > c.tolerablePhRange[1]`, apply `score -= 12; amend = true;` and add a bilingual note that soil pH needs correction before planting.
     - Else if `soil.ph < c.optimalPhRange[0] || soil.ph > c.optimalPhRange[1]`, apply a mild `score -= 4` (keeps `amend = false` so a typical `pH 8.0` Pune black Vertisol with `onion` or `groundnut` is not flagged for mandatory pH amendment).
   - Ensure `whyItFits` and `careNote` provide accurate bilingual (`en` and `mr`) reasons.
3. **`src/lib/domain/soilKit.ts`**:
   - Gate agricultural gypsum advice on sodicity/salinity:
     - When `cat === "strongly_alkaline"` (`pH > 8.2`), only advise gypsum (`जिप्सम`) if `r.salinity === "elevated" || r.salinity === "high"`. When `salinity` is `"normal"` or `"untested"`, advise applying well-decomposed FYM/compost, green manure, and root-zone banded fertilizer placement, and testing soil salinity/EC before considering gypsum.

---

### A7. Relabel Drought Simulator as Illustrative & Bump Version to `0.2.1`
1. In `src/lib/domain/irrigation.ts` and `src/components/irrigation/IrrigationPanel.tsx`:
   - Label the Drought & Limited Dam-Release Simulator with an explicit badge/caption in both English (`"Illustrative scenario · verify locally before changing crop areas"`) and Marathi (`"उदाहरणात्मक अंदाज · पीक क्षेत्र बदलण्यापूर्वी स्थानिक पातळीवर खात्री करा"`).
   - Localize the `simulateDroughtReallocation` recommendation into `{ en: string; mr: string }` (while keeping `recommendation: string` for backward compatibility if any caller reads it as a string, or updating `IrrigationPanel.tsx` accordingly).
2. In `package.json`:
   - Update `"version": "0.1.0"` to `"0.2.1"`.

---

## VERIFICATION GATE (MANDATORY)
Run all three commands and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`
```
