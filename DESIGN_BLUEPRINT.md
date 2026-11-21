# DESIGN_BLUEPRINT.md — Balram UI/UX Design Architecture (v0.3.4 Adaptation)

Handoff document. Validated against live `v0.3.3` codebase (`PERSISTENCE_VERSION = 5`, 51 passing tests, Tailwind CSS 3.4). Companion files in repo root: `tokens.json` (W3C DTCG) and `tokens.css` (CSS custom properties).

## 0. Live Codebase Reconciliation Notes
- **Current Version:** `v0.3.3` (`PERSISTENCE_VERSION = 5`, `landUnit: "acres" | "gunthas"`, `LandUnitToggle`, `AreaInput`, `tests/i18n.test.ts`). Do NOT downgrade persistence or remove v0.3.3 features.
- **Brand Colors:** Keep `forest: "#1E5631"`, `amber: "#FFBF00"`, `sky: "#4A90E2"`, `daylight: "#FAFAFA"`, and `ink: "#212121"` intact as raw hexes in `tailwind.config.ts` so `/10`, `/15`, `/20` opacity modifiers never break. Add `tokens.css` custom properties additively in `theme.extend`.
- **Fonts:** Keep the Devanagari-first system font stack in `tailwind.config.ts` wired to `--font-heading` / `--font-body` (avoid `next/font/google` network downloads in offline sandboxes; never `@import` Google Fonts due to CSP `default-src 'none'`).
- **Dialogs & Layering:** Use native `<dialog>` + `showModal()` for mobile sheets and `AboutDialog` so overlays render in the browser top-layer above Leaflet's `z-1000`.

## 1. Visual Direction — "Daylight Field Notebook"
- Variance **3/10**, Motion **2/10**, Density **3/10**. Flat, calm, high-contrast, light mode only.
- Five principles: (1) One screen, one decision; (2) Every tap confirms visibly; (3) Numbers travel with plain language and a provenance chip; (4) Marathi is first-class (`18px` body, `1.6` line-height, `14px` caption floor, no `truncate`); (5) Recoverable (7s pausable Undo toast) beats confirm-heavy modals.

## 2. Tokens Summary
- Control borders: `--color-border-strong` (`#5F8570`, ≥3:1 WCAG 1.4.11). Never use `--color-border` (`#BBF7D0`) for interactive controls.
- Never use `--color-warning` (`#FFBF00`) or `--color-secondary` (`#22C55E`) as text on white.
- Provenance chips: Farmer-entered (`success-subtle`/`on-success-subtle`), Modelled (`info-subtle`/`on-info-subtle`), Estimate (`warning-subtle`/`on-warning-subtle`), Sample (`warning`/`on-warning`).
- Touch targets: `≥48×48px`, `≥8px` (`gap-2`) spacing; primary CTAs `56px` (`min-h-14`).
- Motion: `transform`/`opacity` only, `duration-fast` (120ms), `base` (200ms), `slow` (320ms), `exit` (160ms); zeroed under `prefers-reduced-motion`.

## 3. Screen Architecture & UX Targets
- **Global Chrome:** Compact 56px Header (logo, Home, `LandUnitToggle`, `English / मराठी`). Conditional `StatusBanner` only for Sample Mode or Offline. Single footer link `"About & data"` opening native `<dialog>` `AboutDialog` (housing `OfflineSupport`, `PrivacyNotice`, and `alertStatusMessages`).
- **Landing:** Language toggle inside hero; `My Farm` progress bar + 56px CTA; Sample Farm card below.
- **Journey Shell:** Mobile station sheet as native `<dialog>`; fixed Back/Next bar with `scroll-padding-bottom` (WCAG 2.2 focus-not-obscured) and plain-language disabled `Next` hint.
- **Station 4 (My Crops):** `<LandBar />` at top; collapsible `PlotRow` list first when plots exist; visible `"Already planted?"` quick chip row; `CropAdvisorCard` with persistent `✓ Added` chip; `CropCheckoutSheet` (docked Right Sidebar on `lg+`, native `<dialog>` bottom sheet on `< lg`); `<ToastHost />` with 7s pausable Undo toast on plot removal.
- **Station 5 (Balram's Advice):** Field Voice cards only + clear empty state.
- **Stations 1–3 & Water:** Land wraps manual coordinates/vertices under one `"Advanced"` `<SectionDisclosure>`; Weather metrics at `text-3xl leading-heading` with plain sentences + `ProvenanceBadge`; Soil shows large `text-3xl` pH readout + `−0.1 / +0.1` thumb steppers; Water collapses Drought/Advanced/Formula under `<SectionDisclosure>`.
- **Daily Home:** Fixed bottom 4-tab bar on `< md` (`Today`, `My Farm`, `Water`, `Report`) with safe-area padding; `My Farm` uses a 4-segment sub-nav (`Land · Crops · Soil · Data`).
