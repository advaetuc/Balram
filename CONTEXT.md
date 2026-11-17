# CONTEXT.md — Ground-Truth Codebase, Visual UI Anatomy & UX Audit for Balram (v0.3.1)

This document gives an external AI Overseer (Claude) complete visibility into the live **Balram `v0.3.1`** codebase (`/Users/advaet/Projects/Balram`), including its exact system architecture, implemented features, **screen-by-screen visual layout anatomy**, and the current UX friction points targeted for the next iteration (`v0.3.2` / `v0.4.0`).

---

## 1. Current System Architecture & Shipped Status (`v0.3.1`)

* **Stack & Runtime:** Next.js 15.5 App Router, React 19, TypeScript 5.9, Tailwind CSS 3.4, Zustand 5 (`useSyncExternalStore` SSR-safe vanilla store), IndexedDB (`idb` 8.0 with 4s timeout + in-memory tab fallback), Leaflet 1.9 (`L.canvas()` hardware-accelerated renderer + `react-leaflet-draw`), Turf.js 7.4, Zod 3.25.
* **Persistence & Migration:** `PERSISTENCE_VERSION = 4` in `src/store/useBalramStore.ts` (auto-migrates `v0`–`v3` blobs). Stores `farmProfile`, `fieldGeometry`, `cropAllocations`, `irrigationSetup`, `weatherSnapshot`, `soilSnapshot`, `soilKitReading`, `soilSkipped`, `setupCompletedAt`, `checkIns`, and `locale` (`"en" | "mr"`).
* **Single-Route State Shell (`/`):** Because `scripts/finalize-release.mjs` hashes inline script CSPs and `scripts/service-worker.js` caches a 40-file static allowlist anchored to `"/"` (rejecting RSC requests offline), all navigation happens inside `"/"` (`src/app/(app)/page.tsx` -> `src/components/app-shell/AppShell.tsx`) via client state (`view: "landing" | "journey" | "daily"`).
* **Resilient Weather Pipeline (`v0.3.1`):**
  * `/api/weather` (`src/lib/api/providers/openMeteo.ts`) validates `x-forwarded-host` for Vercel Edge compatibility, fetches 7-day daily forecasts from Open-Meteo, and computes missing `et0_fao_evapotranspiration` via `calculateHargreavesEt0()`.
  * If Open-Meteo is unreachable or offline when a field is saved, `createRegionalBaselineWeatherSnapshot()` generates a valid 7-day Maharashtra seasonal baseline forecast so `resolvedWeatherMetrics()` always provides a finite positive $ET_0$ (`mm/day`).
* **Test Suite:** 24 passing zero-dependency Node 22 tests (`npm test`) across `tests/release-a.test.ts`, `tests/release-b-domain.test.ts`, `tests/release-b-shell.test.ts`, and `tests/release-b-final.test.ts`.

---

## 2. Visual UI & Layout Anatomy (What the Farmer Actually Sees Today)

### 2.1 Global Header & Footer (`src/app/layout.tsx`, `src/components/app-shell/Header.tsx`)
* **Top Bar (`bg-white border-b border-forest/20`):**
  * Left: Forest-green (`#1E5631`) rounded square sprout logo + **Balram** title + subtitle (*"Your field. Your plan."* / *"तुमचे शेत. तुमचे नियोजन."*).
  * Right: `Home` button, `मराठी / English` toggle button (`min-h-12`), and `Explore sample / Exit sample` button.
* **Status Ribbon (`bg-daylight`):** Live pill badges showing `Online` / `Offline · saved data only`, `Saved in this browser`, `Modelled estimate`, and when Sample Mode is active, a high-contrast amber (`#FFBF00`) banner with `Exit sample`.
* **Footer (`print:hidden`):** Service worker offline readiness line + collapsible `<details>` privacy & data provenance notice (which currently adds visual clutter at the bottom of every screen).

### 2.2 View 1: Landing Screen (`AppShell.tsx` when `view === "landing"`)
Centered single-column stack (`max-w-3xl space-y-6`):
1. **Hero Banner (`rounded-3xl bg-forest p-6 text-white`):** *"Your farm. A clearer growing path."*
2. **Language Card (`bento-card`):** Two side-by-side buttons (`English` | `मराठी`).
3. **My Farm Card (`bento-card`):** Shows progress (`X / 6 steps complete`) and a primary forest-green CTA (`Start Setup` or `Continue setup: Step X, <Station>`, or `Open Daily Home` once setup is finished).
4. **Sample Farm (Pune) Card (`bento-card border-l-4 border-l-sky`):** Launches the non-destructive read-only sample overlay.

### 2.3 View 2: The 6-Station Setup Journey (`src/components/journey/JourneyShell.tsx`)
* **Layout Grid:** 2-column grid on desktop (`md:grid-cols-[280px_minmax(0,1fr)]`); single column on mobile with a top `ProgressStrip` (`Step X of 6`) and fixed bottom `Back / Next` bar.
* **Left Sidebar (`280px` sticky card on desktop):** Vertical list of the 6 Growing Path stations with inline SVG icons (`Seed`, `Sprout`, `Leaf`, `Flower`, `Fruit`, `Grain`) and status subtitles (`Done`, `Current`, `Ready`, `Skipped`, `Locked`, `Needs update`).
* **Main Content Area (Right column):**
  * **Station 1 — My Land (`MapClient.tsx`):** Shows a summary strip (`Field area: X Acres Y Gunthas` | `Location: lat, lng`), a `"Load online map"` toggle above the `420px` Leaflet canvas, and two collapsible `<details>` forms below (*"Enter coordinates & acreage"* with Latitude, Longitude, Acres, Gunthas, `"Use my location"`, and `"Save location"*; plus *"Enter or edit boundary vertices"* raw textarea).
  * **Station 2 — Weather (`WeatherCard.tsx`):** 2-column metric grid (`Reference ET₀` in `3xl` bold + `Forecast rainfall` in `3xl` bold), date/temp line, provenance note, `"Refresh live weather"` button, and collapsible 7-day list.
  * **Station 3 — My Soil (`SoilCard.tsx`):** 4 large mode buttons (*Balram In-House Kit*, *Soil Health Card kg/ha*, *Full Rapid Kit*, *Skip for now*), a range slider for `Soil pH (3.5–10.5)`, pill rows (`low` / `medium` / `high`) for Nitrogen & Phosphorus, a `"Save soil test"` button, and the resulting **"What Your Soil Needs Before Planting"** card list.
  * **Station 4 — My Crops (`PortfolioCard.tsx`):**
    * Top 3-column summary (`Total farm land` | `Allocated to plots` | `Unassigned / fallow`).
    * List of existing plot cards: each card has a header, `Remove plot` button, **two numeric inputs (`Acres` and `Gunthas`)**, **three quick-adjust buttons (`+5 Gunthas`, `−5 Gunthas`, `Use remaining land`)**, a **4-button Lifecycle Stage pill grid**, and a **Planting date `<input type="date">`**.
    * Bottom `"Add new plot"` form (`bg-stone-50`): 4 quick-name chips (`Well Plot`, `Borewell Patch`, `Canal Plot`, `Roadside Field`), text input for `Plot name`, dropdown `<select>` for `Crop`, numeric inputs for `Acres` and `Gunthas`, dropdown `<select>` for `Initial lifecycle stage`, and `"Add plot"` button.
  * **Station 5 — Balram's Advice (`AlertsCard.tsx` + `CropAdvisorCard.tsx`):**
    * Stacked vertically: first `AlertsCard` (Field Voice cards with `"Why this advice?"` accordions + collapsible `"System & data status checks"`), then `CropAdvisorCard` below it (Season `<select>` dropdown + 6 stacked crop cards, each with an `"Add plot with this crop"` button).
  * **Station 6 — My Roadmap (`RoadmapList.tsx` + `FarmReport.tsx`):**
    * Grouped action cards (`This Week`, `Next Two Weeks`, `Later`), collapsible report preview, and `"Finish Setup"` button.

### 2.4 View 3: Daily Home (`src/components/home/DailyHome.tsx`)
4-tab bar (`Today / आज`, `My Farm / माझे शेत`, `Water / पाणी`, `Report / अहवाल`):
* **Today Tab:** `CheckInCard` banner + 3-tap check-in form, top Field Voice card, Today's planned water card, and This Week's roadmap actions.
* **My Farm Tab:** Stacks `MapClient`, `PortfolioCard`, `SoilCard`, and `Farm backup` (Export/Import JSON) vertically on one long page.
* **Water Tab (`IrrigationPanel.tsx`):** Simple plot water plan (Plot dropdown, `Drip / Sprinkler / Canal` buttons, optional pump flow input, current-stage summary box, 4-phase weekly water table) + two collapsible `<details>` blocks (*Drought simulator* and *Advanced measured block flow override* + *Formula & assumptions*).
* **Report Tab (`FarmReport.tsx`):** Share Summary button + Print Farm Report button + A4 summary table.

---

## 3. Code-Level Diagnosis of Current UX Friction (Why the User's Rough Idea Is Spot-On)

Inspecting `CropAdvisorCard.tsx`, `PortfolioCard.tsx`, and `JourneyShell.tsx` reveals **four severe UX flaws** in how crop selection and plot creation currently work:

1. **Broken Station Ordering (Station 4 vs. Station 5 Paradox):**
   * In `JourneyShell.tsx`, **Station 4 is `My Crops` (`PortfolioCard`)** and **Station 5 is `Balram's Advice` (`AlertsCard` + `CropAdvisorCard`)**—and Station 5 is *locked* until Station 4 is completed!
   * That means a farmer has to guess and add their crops in Station 4 *before* they are even allowed to see `CropAdvisorCard` (which recommends what crops to plant based on their Station 2 Weather and Station 3 Soil Test)!
2. **Silent No-Op & Zero Visual Confirmation in `CropAdvisorCard.tsx`:**
   * Look at `CropAdvisorCard.tsx` lines 9–10 (`function add(id: CropId)`):
     * When the farmer clicks `"Add plot with this crop"`, it automatically dumps all `remaining` unassigned gunthas into a single plot behind the scenes with **zero toast, zero selected state, zero checkmark, and zero visual confirmation**!
     * Worse: if `remaining <= 0` (meaning the farmer already allocated their land in Station 4), clicking `"Add plot with this crop"` **does not add the crop at all**—it just silently calls `document.getElementById("portfolio")?.scrollIntoView()`, which does *nothing* inside `JourneyShell` because `PortfolioCard` isn't even rendered on Station 5!
3. **Cognitive Overload in `PortfolioCard.tsx` ("Form Inside a Form"):**
   * Every saved plot card in `PortfolioCard.tsx` renders 2 number inputs (`Acres`, `Gunthas`), 3 resize buttons (`+5G`, `-5G`, `Use remaining`), 4 lifecycle buttons, a date picker, and a remove button—and then right below it sits *another* full form (`Add new plot`) with text inputs, dropdowns, and number boxes. For a smallholder farmer on a phone, this looks like a spreadsheet data-entry screen rather than a guided consumer app.
4. **Prototype Clutter & Low-Impact Text Walls:**
   * Across cards, secondary technical disclaimers (`DataCaption` footers on every card, `"Enter or edit boundary vertices"` raw coordinate textareas, `"Formula & assumptions"` accordions, `"Saved modeled SoilGrids context"`, `"System & data status checks"`) compete visually with the primary buttons and instant outputs farmers actually care about.
