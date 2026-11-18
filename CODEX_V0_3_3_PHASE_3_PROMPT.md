# Balram v0.3.3 — Codex Implementation Prompt (Phase 3: Full Marathi Sweep, Devanagari Typography & Release Gate)

Copy and paste the prompt below into **Codex** to complete the final phase (**Phase 3**) of **Balram `v0.3.3`**.

```markdown
You are the Lead Systems Engineer completing **Phase 3 (Full Marathi Coverage Sweep, `L.drawLocal` Marathi Map Tooltips, Devanagari Typography, `<html lang>` Sync, and `tests/i18n.test.ts` Release Gate)** of **Balram (`v0.3.3`)**.

Read `BALRAM_V0_3_3_BLUEPRINT.md` and `AGENTS.md` (specifically **Invariant 8: Full Marathi Coverage**), and inspect:
- `src/config/i18n.ts`
- `src/lib/domain/fieldVoice.ts`
- `src/lib/domain/cropRecommendations.ts`
- `src/lib/ui/format.ts`
- `src/lib/ui/alertStatus.ts`
- `src/lib/api/client.ts`
- `src/components/app-shell/{AppShell,Header,OfflineSupport,PrivacyNotice}.tsx`
- `src/components/map/{MapClient,FarmMap}.tsx`
- `src/components/dashboard/{WeatherCard,SoilCard,CropAdvisorCard,PortfolioCard,AlertsCard,Card}.tsx`
- `src/components/crops/CropCheckoutSheet.tsx`
- `src/components/irrigation/IrrigationPanel.tsx`
- `src/components/report/FarmReport.tsx`
- `src/app/globals.css` & `tailwind.config.ts`
- `package.json` & `README.md`

Your objective is to ensure that when `state.locale === "mr"`, **every single user-visible label, sentence, chip, table header, option, tooltip, notice, and report line renders in Marathi (`मराठी`)**, leaving zero raw English leaks (apart from allowlisted technical symbols: `pH`, `ET₀`, `Kc`, `ETc`, `NPK`, `N`, `P`, `K`, `DAP`, `SSP`, `FYM`, `KMnO₄`, `kg/ha`, `mm`, `mm/day`, `L`, `L/day`, `L/week`, `L/hour`, `°C`, `MB`, `JSON`, `IST`, `OpenStreetMap`, `Open-Meteo`, `Turf`, `Balram`).

Do **NOT** change existing domain function parameter signatures in a breaking way (keep `{ en, mr }` return objects so all 48 existing unit tests continue to pass).

---

## STEP-BY-STEP IMPLEMENTATION SPECIFICATION

### 1. Fix Marathi String Interpolations in `src/lib/domain/fieldVoice.ts` & `src/lib/domain/cropRecommendations.ts`
1. **In `src/lib/domain/fieldVoice.ts`**:
   - Currently, lines 20–26 interpolate `${name}` (raw English `p.plotName ?? "your plot"`) and `${crop}` (English `cropInfo.name`) inside the Marathi (`mr`) advisory messages!
   - Import `displayPlotName` from `./landUnits`.
   - Compute `const nameEn = displayPlotName(p.plotName, "en")` and `const nameMr = displayPlotName(p.plotName, "mr")`, and `const cropMr = cropInfo?.marathiName ?? p.cropId`.
   - Use `${nameMr}` and `${cropMr}` in all Marathi (`mr`) `message` and `reason` templates (and `${nameEn}` and `${crop}` in `en`).
2. **In `src/lib/domain/cropRecommendations.ts`**:
   - Ensure all notes appended to `whyItFits.mr` and `careNote.mr` use natural Marathi (translating season names via `Kharif -> खरीप`, `Rabi -> रब्बी`, `Zaid -> उन्हाळी`, `Perennial -> बारमाही`).

---

### 2. Expand `src/config/i18n.ts` Helpers (`seasonLabel`, `droughtToleranceLabel`, `formatTime`, `formatNumber`)
1. In `src/config/i18n.ts`, export:
   - `seasonLabel(locale: Locale, season: Season | CropAllocation["season"]): string` mapping:
     - `en`: `Kharif`, `Rabi`, `Zaid`, `Perennial`
     - `mr`: `खरीप`, `रब्बी`, `उन्हाळी`, `बारमाही`
   - `droughtToleranceLabel(locale: Locale, level: "high" | "moderate" | "low"): string` mapping:
     - `en`: `high`, `moderate`, `low`
     - `mr`: `जास्त`, `मध्यम`, `कमी`
2. In `src/lib/ui/format.ts` & `src/lib/api/client.ts`:
   - Allow `formatNumber(value, digits, locale)` and `formatTime(value, locale)` to accept an optional `locale: Locale = "en"` so `"Not available"` / `"उपलब्ध नाही"` and `"Not provided"` / `"दिलेले नाही"` are localized when `locale === "mr"`.
   - Allow `providerErrorMessage(error, name, locale: Locale = "en")` in `src/lib/api/client.ts` to return Marathi error strings when `locale === "mr"`.

---

### 3. Complete Component-by-Component Marathi Sweep
Eliminate all remaining English literals when `state.locale === "mr"`:

1. **`src/components/crops/CropCheckoutSheet.tsx`**:
   - On line 95, render the preset plot name chip label using `{displayPlotName(name, state.locale)}` instead of raw `{name}` (while still storing the selected preset name or custom name).
2. **`src/components/dashboard/CropAdvisorCard.tsx`**:
   - Localize the season `<select>` options using `seasonLabel(state.locale, item)`.
   - Localize line 45 (`{seasonLabel(state.locale, crop.season)} · {droughtToleranceLabel(state.locale, crop.droughtTolerance)} ...`).
3. **`src/components/dashboard/AlertsCard.tsx`**:
   - On line 9, render the plot & crop badge using `{displayPlotName(a.plotName, state.locale)}{a.cropId ? ` · ${cropLabel(state.locale, a.cropId)}` : ""}` instead of raw `{a.plotName}` and `{a.cropId.replaceAll("_", " ")}`.
4. **`src/components/map/MapClient.tsx` & `src/components/map/FarmMap.tsx`**:
   - Localize all instructions, labels, buttons, notices, and error messages in `MapClient.tsx` (`"Draw a boundary or enter coordinates..."`, `"Not set"` / `"ठरवलेले नाही"`, `"Enter coordinates & acreage"` / `"निर्देशांक व क्षेत्र भरा"`, `"Latitude"` / `"अक्षांश"`, `"Longitude"` / `"रेखांश"`, `"Use my location"` / `"माझे स्थान वापरा"`, `"Save location"` / `"स्थान जतन करा"`, `"Save boundary"` / `"सीमा जतन करा"`, `"Clear field and its telemetry"` / `"शेत व माहिती पुसा"`, and `DataCaption` `source`).
   - In `FarmMap.tsx`:
     - Localize `"Load online map"` / `"ऑनलाइन नकाशा दाखवा"`, `"Hide online map"` / `"ऑनलाइन नकाशा लपवा"`, helper captions, and error messages.
     - Configure `L.drawLocal` draw/edit toolbar strings in Marathi when `state.locale === "mr"` (and English when `"en"`) before `<EditControl key={state.locale} ... />` mounts so polygon drawing tooltips and toolbar actions appear in Marathi!
5. **`src/components/irrigation/IrrigationPanel.tsx`**:
   - Localize all remaining English headings, labels, table headers, and notices when `state.locale === "mr"`:
     - Intro note, offline/stale/Hargreaves/baseline notices.
     - `"Simple plot water plan"` / `"सोपे प्लॉट पाणी नियोजन"`, `"Plot"` / `"प्लॉट"`, `"Select plot"` / `"प्लॉट निवडा"`, crop names in `<option>` via `cropLabel(state.locale, ...)`.
     - `"Optional pump flow override (L/hour)"` / `"पंप प्रवाह बदल (लिटर/तास, ऐच्छिक)"`, placeholder `"Use delivery preset"` / `"प्रीसेट प्रवाह वापरा"`.
     - Current stage summary box (`text.stageNames[currentStage]`, `"तास"`, `"मिनिटे/दिवस"`, `"लिटर/आठवडा"`, `"टँकर (10,000 L)"`) and 4-phase table headers (`"टप्पा"`, `"आठवडे"`, `"Kc"`, `"लिटर/आठवडा"`, `"टँकर/आठवडा"`, `"मिनिटे/दिवस"`) + stage cell `text.stageNames[p.stage]`.
     - Advanced Measured Flow accordion summary (`"Advanced: Measured block flow & custom Kc override"` / `"प्रगत: मोजलेला प्रवाह व Kc बदल"`), form labels (`"Crop block"`, `"System flow (L/hour)"`, `"Application efficiency (%)"`, `"Crop coefficient (Kc)"`, `"Effective rainfall (mm/day)"`, confirmation checkbox, `"Calculate planning estimate"`), and `"How is this calculated?"` explanation paragraphs.
6. **`src/components/dashboard/WeatherCard.tsx`, `src/components/dashboard/Card.tsx`, `src/components/report/FarmReport.tsx`, `src/components/app-shell/OfflineSupport.tsx`, & `src/components/app-shell/PrivacyNotice.tsx`**:
   - Localize `"Reference ET₀"` / `"संदर्भ बाष्पोत्सर्जन (ET₀)"`, `"Forecast rainfall"` / `"अंदाजित पाऊस"`, `"Forecast details"` / `"७ दिवसांचा सविस्तर अंदाज"` in `WeatherCard.tsx`.
   - Localize `DataCaption` badges in `Card.tsx` (`"Modeled Estimate"` / `"मॉडेलचा अंदाज"`).
   - Localize `OfflineSupport.tsx` status line and `PrivacyNotice.tsx` summary + body paragraphs for `state.locale === "mr"`.
   - Localize remaining labels in `FarmReport.tsx` (`"Unavailable"` / `"उपलब्ध नाही"`, `"Weather source"` / `"हवामान स्रोत"`, footer disclaimer).

---

### 4. Post-Hydration `<html lang>` + `document.title` Sync & Devanagari Typography
1. **In `src/components/app-shell/AppShell.tsx`**:
   - In a post-hydration `useEffect` (triggered when `state.hydrated` is `true` and `state.locale` changes), set:
     - `document.documentElement.lang = state.locale;`
     - `document.title = state.locale === "mr" ? "बलराम | शेत नियोजन" : "Balram | Farm planning";`
2. **In `tailwind.config.ts` & `src/app/globals.css`**:
   - Add Devanagari system fonts to `fontFamily.sans` in `tailwind.config.ts` (`"Noto Sans Devanagari"`, `"Kohinoor Devanagari"`, `"Nirmala UI"`, `"Mangal"`, `"ui-sans-serif"`, `"system-ui"`, `"sans-serif"`).
   - In `src/app/globals.css`, add:
     ```css
     html[lang="mr"] body {
       line-height: 1.65;
     }
     ```
     so Devanagari matras never clip on mobile or print.

---

### 5. Add `tests/i18n.test.ts` & Finalize Release `v0.3.3`
1. **Create `tests/i18n.test.ts`**:
   - Verify `t("en")` and `t("mr")` have identical recursive key structures and no empty string values.
   - Verify `t("mr")` values contain no unapproved Latin words (only allowlisted technical tokens: `pH`, `ET₀`, `Kc`, `ETc`, `NPK`, `N`, `P`, `K`, `DAP`, `SSP`, `FYM`, `KMnO₄`, `kg/ha`, `mm`, `L`, `°C`, `MB`, `JSON`, `IST`, `OpenStreetMap`, `Open-Meteo`, `Turf`, `Balram`).
   - Verify `generateFieldVoiceAdvisories`, `interpretSoilKitReading`, `getSeasonalCropRecommendations`, `generateRoadmap`, and `buildShareSummary` in `"mr"` mode produce 100% Marathi output with Marathi crop names (`ऊस`, `रब्बी ज्वारी`, `कांदा`, `बाजरी`, `डाळिंब`, `भुईमूग`) and Marathi preset plot names (`विहिरीचा प्लॉट`, `बोअरवेल प्लॉट`, etc.).
2. **Bump Version & Clean Up Prompt Files**:
   - Update `"version"` in `package.json` from `"0.3.2"` to `"0.3.3"` (and update the version assertion in `tests/release-v032-checkout.test.ts` to `"0.3.3"` or `>= 0.3.2`).
   - Update `README.md` header and feature summary for `v0.3.3`.
   - Delete temporary prompt files `CODEX_V0_3_3_PHASE_1_PROMPT.md`, `CODEX_V0_3_3_PHASE_2_PROMPT.md`, and `CODEX_V0_3_3_PHASE_3_PROMPT.md` (and `public/rough.md` if untracked/temporary, or leave tracked user files intact—only delete `CODEX_V0_3_3_PHASE_*_PROMPT.md`).

---

## VERIFICATION GATE (MANDATORY)
Run all four checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build` (confirm `scripts/finalize-release.mjs` exits `0` and regenerates `public/sw.js`)
4. `git diff --check`
```
