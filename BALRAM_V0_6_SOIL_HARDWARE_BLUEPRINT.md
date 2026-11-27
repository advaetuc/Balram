# Balram v0.6.0 — Hardware-Backed Soil Testing & Calculations Blueprint

**Status:** Source-validated against Balram `v0.5.0` (`frontend` branch, `PERSISTENCE_VERSION = 6`)  
**Target Release:** `v0.6.0` (backward-compatible `PERSISTENCE_VERSION = 6` via defaulted Zod fields)  
**Dependencies Added:** `0` (Zero new npm packages)  
**Routes Added:** `0` (Single-route `"/"` static shell preserved for CSP + Service Worker)

---

## 1. Product Goal & Design Philosophy

Upgrade Balram's Soil Testing feature (`SoilCard`, `SoilGauges`, `soilKit.ts`, `FarmReport`) to reflect the real **Balram Hardware Kit** (Arduino Uno R3, E463 pH Sensor, E77A Moisture Sensor, TCS3200 Colour Sensor, HD44780 16×2 LCD) and the team's exact **Alkaline $\text{KMnO}_4$ Nitrogen** and **Olsen Molybdenum-Blue Phosphorus** lab procedures—while keeping the farmer UI effortless and hiding numerical lab math inside an opt-in **Calculations** tab.

### Core UX & Scientific Guardrails
1. **Simple First, Math On Demand:** The default **Soil Test** tab stays clean and farmer-friendly:
   - **Soil pH** (E463 sensor / manual slider + ±0.1 stepper, `3.5–10.5`)
   - **Soil Moisture** (E77A sensor / `%` or `Dry / Moist / Wet`)
   - **Available Nitrogen (N)** (`Low / Medium / High`, plus live `kg/ha` pill if calculated)
   - **Available Phosphorus (P)** (`1–5` tactile **Blue Intensity Scale** where `1` = weakest blue and `5` = strongest blue, synced with `Low / Medium / High`)
   - **View Preset Ranges** collapsible dropdown (`<details>` / `SectionDisclosure`) showing the exact system cutoffs for pH, Moisture, Nitrogen, and Phosphorus (including the 1–5 blue scale).
2. **Opt-In Calculations Tab:** A dedicated **Calculations** tab inside `SoilCard` (never open by default—only opens when explicitly clicked) reveals:
   - **Nitrogen Lab Calculator (Subbiah–Asija):** Direct $\text{H}_2\text{SO}_4$ titration `(S - B) × 31.36` (supporting Trial 1 & Trial 2 averaging per `BAL-N-01`), plus a toggle for the Arduino NaOH back-titration sketch `(B - S) × 31.36`. Handles `0.00 kg/ha` (equal titres → `LOW`) and flags invalid titres (`Check B and S`).
   - **Phosphorus Lab Calculator (Olsen 882 nm):** Absorbance $A$ → concentration $C = (A - 0.020) / 0.249$ → $P\text{ (mg/kg)} = C \times V(\text{L}) / W(\text{kg})$ → $P\text{ (kg/ha)} = P\text{ (mg/kg)} \times \text{soilMassFactor}$ (default `1.995` from `0.15 m` depth × `1,330 kg/m³` bulk density, with option for the `2.24` furrow-slice factor).
   - **TCS3200 Optical Panel:** Accepts raw R/G/B low-pulse durations (`us`), rejects `0 us` timeouts as invalid, and computes a relative **Blue Intensity Score (`0–100`) → `1–5` scale** when calibration endpoints are provided—explicitly labeled **`Relative Optical Signal — Not Lab Validated`**.
   - **Miniature 16×2 HD44780 LCD Preview:** Pure-CSS Daylight Field Notebook olive-green LCD widget mirroring the live Nitrogen or TCS3200 readout (including `INVALID INPUT / Check B and S`).
   - **1-Tap Simulated Presentation Presets:** Instant demo buttons (*Lab Procedure Demo `BAL-N-01` + `BAL-P-01`*, *Arduino LCD High-N `627.20 kg/ha`*, *TCS3200 Optical Demo*) that populate the calculator and stamp `dataStatus: "simulated"`.
3. **Scientific Honesty:**
   - Track `dataStatus: "screening" | "simulated" | "lab_validated"` on `SoilKitReading` (default `"screening"`).
   - Simulated/demo readings display an unmistakable **`Simulated Demo — Not a lab measurement`** badge on `SoilCard`, `SoilGauges`, and `FarmReport`, and add a clear advisory note that simulated or unvalidated optical outputs must not be used for definitive fertilizer dosing.
   - Raw TCS3200 RGB pulses never claim to be a validated phosphorus `kg/ha` concentration on their own.

---

## 2. Exact Chemistry & Sensor Formulas (`src/lib/domain/soilChemistry.ts`)

Zero React, zero browser globals, 100% deterministic pure TypeScript:

### 2.1 Available Nitrogen — Alkaline $\text{KMnO}_4$ (Subbiah–Asija)
- **Method A (Official Lab Procedure `BAL-N-01`, default):** Direct $\text{H}_2\text{SO}_4$ ($0.0200\text{ N}$) titration of boric-acid receiver (`20.00 g` soil).
  - $S = \text{average of sample trials}$ (supports 1 or 2 trials: $(T_1 + T_2) / 2$), $B = \text{blank titre (mL)}$.
  - Valid when $S \ge B$. If $S < B$, return `{ ok: false, error: "invalid_titres", lcdLine1: "INVALID INPUT", lcdLine2: "Check S and B" }`.
  - $\text{Corrected titre} = S - B$.
  - $N\text{ (kg/ha)} = (S - B) \times 31.36$.
  - Reference test case (`BAL-N-01`): $T_1 = 7.80$, $T_2 = 7.70 \rightarrow S = 7.75$, $B = 0.40 \rightarrow 7.35 \times 31.36 = 230.496 \approx 230.50\text{ kg/ha}$ → **LOW**.
- **Method B (Arduino Sketch Back-Titration):** Blank NaOH $B$ minus Sample NaOH $S$.
  - Valid when $B \ge S$. If $B < S$, return `{ ok: false, error: "invalid_titres", lcdLine1: "INVALID INPUT", lcdLine2: "Check B and S" }`.
  - $N\text{ (kg/ha)} = (B - S) \times 31.36$.
  - Reference test cases: Low `(15, 10) = 156.80`, Medium `(22, 10) = 376.32`, High `(30, 10) = 627.20`, Equal `(10, 10) = 0.00` (`LOW`), Invalid `(10, 15)`.
- **Classification Bands (provisional/SHC):** `LOW: < 280`, `MEDIUM: 280–560`, `HIGH: > 560` kg/ha.

### 2.2 Available Phosphorus — Olsen ($0.5\text{ M NaHCO}_3$, pH 8.5, 882 nm)
- **Default Calibration Curve (`BAL-P-01`):** $A = 0.249C + 0.020$ (`slope = 0.249`, `intercept = 0.020`, standards `0.0–2.0 mg P/L`).
  - Step 1: $C\text{ (mg P/L)} = (A - \text{intercept}) / \text{slope}$ (clamped/flagged if $A < \text{intercept}$).
  - Step 2: $P\text{ (mg/kg)} = C \times (V_{\text{mL}} / 1000) / (W_{\text{g}} / 1000) = (C \times V_{\text{mL}}) / W_{\text{g}}$.
    - Defaults: $V = 50.0\text{ mL}$, $W = 2.500\text{ g}$ (`dilutionRatio = 20`).
  - Step 3: $P\text{ (kg/ha)} = P\text{ (mg/kg)} \times \text{haFactor}$.
    - Default `haFactor = 1.995` (from `depth = 0.15 m`, `bulkDensity = 1330 kg/m³` → `1,995,000 kg/ha`). Optional quick-guide factor `2.24`.
  - Reference test case (`BAL-P-01`): $A = 0.211 \rightarrow C = 0.767\text{ mg/L} \rightarrow 15.34\text{ mg/kg} \rightarrow 30.60\text{ kg P/ha}$ → **HIGH**.
- **Classification Bands (provisional/Olsen):** `LOW: < 10`, `MEDIUM: 10–25`, `HIGH: > 25` kg/ha.

### 2.3 Phosphorus Blue Intensity Scale (1–5) & TCS3200 Optical Helper
- **1–5 Visual Blue Intensity Scale:**
  - `1` = Very light / faint blue (`0–19` relative score) → maps to `low`
  - `2` = Light blue (`20–39` relative score) → maps to `low`
  - `3` = Medium blue (`40–59` relative score) → maps to `medium`
  - `4` = Darker blue (`60–79` relative score) → maps to `high`
  - `5` = Deep / strongest blue (`80–100` relative score) → maps to `high`
- **TCS3200 Raw Pulse Evaluation:**
  - Input: `{ rUs, gUs, bUs }` (`pulseIn(COLOR_OUT, LOW, 100000)`). Any channel `<= 0` → `status: "timeout_invalid"`.
  - With calibration endpoints `{ lowBUs, highBUs }` (where `response = 1 / bUs`):
    - `rawScore = 100 * (response - responseLow) / (responseHigh - responseLow)`
    - Clamp visual display to `0–100`, retain `outOfRange: "low" | "high" | null`, map to `blueIntensity1To5` (`1..5`), and ALWAYS keep `labValidated: false`.

### 2.4 Soil Moisture (E77A Moisture Sensor)
- `moisturePercent`: `0–100` (`number | null`).
- `moistureLevel`: `"dry" | "moist" | "wet" | "untested"`:
  - `dry`: `< 30%`
  - `moist`: `30–65%` (optimal working range)
  - `wet`: `> 65%`

---

## 3. Backward-Compatible Schema Extension (`src/types/domain.ts`)

Extend `SoilKitReadingSchema` (keeping `PERSISTENCE_VERSION = 6` — all new fields have safe defaults so existing `v6` saves and backups load with zero breakage):

```ts
export const MoistureLevelSchema = z.enum(["dry", "moist", "wet", "untested"]);
export type MoistureLevel = z.infer<typeof MoistureLevelSchema>;

export const SoilDataStatusSchema = z.enum(["screening", "simulated", "lab_validated"]);
export type SoilDataStatus = z.infer<typeof SoilDataStatusSchema>;

export const SoilBlueIntensitySchema = z.number().int().min(1).max(5);
```

Additions to `SoilKitReadingSchema`:
- Allow `0` in `nitrogenKgPerHa` and `phosphorusKgPerHa` (`z.number().finite().nonnegative()` instead of `.positive()`) so equal-titre `0.00 kg/ha` is valid.
- `moistureLevel: MoistureLevelSchema.default("untested")`
- `moisturePercent: z.number().finite().min(0).max(100).nullable().default(null)`
- `phosphorusBlueIntensity: SoilBlueIntensitySchema.nullable().default(null)`
- `dataStatus: SoilDataStatusSchema.default("screening")`
- `labCalculation: z.object({ ... }).nullable().default(null)` (optional compact audit record storing N method/B/S, Olsen A/C/V/W/haFactor, and/or TCS3200 raw R/G/B `us` + relative score so reopening the Calculations tab restores the user's lab inputs cleanly!).

---

## 4. Phased Execution Plan (1 Codex Prompt Per Phase)

| Phase | Scope | Key Files |
| :--- | :--- | :--- |
| **Phase 1 (C1)** | Schema extensions (`0.00` support, moisture, 1–5 blue intensity, `dataStatus`, `labCalculation`), pure `soilChemistry.ts` engine (Subbiah–Asija N, Olsen P, 1–5 Blue Scale, TCS3200 optical + timeout QC, E77A moisture, presentation presets), `soilKit.ts` moisture & simulated-data interpretation + unit tests | `src/types/domain.ts`, `src/lib/domain/soilChemistry.ts`, `src/lib/domain/soilKit.ts`, `tests/soil-chemistry.test.ts` |
| **Phase 2 (C2)** | Bilingual `i18n.ts` copy + Simple-first `SoilCard.tsx` upgrade: Moisture input (E77A), 1–5 tactile Phosphorus Blue Intensity swatch bar, collapsible **Preset Ranges** dropdown, and opt-in **Calculations** tab (`SoilCalculationsTab.tsx` + miniature 16×2 HD44780 LCD preview + 1-tap Simulated Presets) | `src/config/i18n.ts`, `src/components/dashboard/SoilCard.tsx`, `src/components/dashboard/SoilCalculationsTab.tsx`, `src/components/dashboard/BlueIntensityPicker.tsx`, `src/components/dashboard/PresetRangesDisclosure.tsx`, `src/styles/motion.css` |
| **Phase 3 (C3)** | `SoilGauges.tsx` & `FarmReport.tsx` integration (Moisture readout/row, 1–5 Blue Intensity label, unmistakable `Simulated Demo` provenance badge, non-prescriptive disclaimer for simulated/unvalidated results) + UI/report tests | `src/components/dashboard/SoilGauges.tsx`, `src/components/report/FarmReport.tsx`, `tests/soil-ui.test.ts` |
| **Phase 4 (C4)** | `v0.6.0` Release Gate: `package.json` + `package-lock.json` bump, release test sync, `README.md` / `AGENTS.md` / `CONTEXT.md` update, 4-check gate & `public/sw.js` verification | `package.json`, `package-lock.json`, `tests/release-v034-design.test.ts`, `README.md`, `AGENTS.md`, `CONTEXT.md`, `public/sw.js` |
