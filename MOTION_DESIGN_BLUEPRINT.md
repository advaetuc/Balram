# MOTION_DESIGN_BLUEPRINT.md — Balram v0.3.5 "Organic Growing Path" (Source-Validated Edition)

*Prepared 21 November 2026 · Overseer: Claude · Source Reviewer & Architect: Gemini · Implementer: Codex*

## 0. Gemini Source Validation Summary (Verified Against `/Users/advaet/Projects/Balram` `v0.3.4`)

All 9 assumptions (A1–A9) in Claude's draft were verified against the live `v0.3.4` repository (`PERSISTENCE_VERSION = 5`, 54 passing tests, `frontend` branch):

1. **A1 — Token Merge Rule (CRITICAL):** `src/styles/tokens.css` and `src/styles/tokens.json` already define the shipped `v0.3.4` color/typography/spacing tokens (`--color-primary: #1E5631`, `--color-foreground: #212121`, `--color-border-strong: #5F8570`, `--color-scrim`, `--duration-*`, `--ease-*`). **Do NOT overwrite or rename existing `v0.3.4` tokens**—append the new `v0.3.5` motion tokens (`--dur-*`, `--ease-spring`, `--ease-press`, `--ease-sheet`, `--dist-*`, `--scale-*`, and `::backdrop` token re-declarations) additively so `tests/release-v034-design.test.ts` stays 100% green.
2. **A2 — Zero Inline `style={{` & CSP:** `grep` confirmed **0** `style={{` and **0** `transition-all` usages in `src/`. Use `src/lib/ui/useCssVar.ts` (`ref.current?.style.setProperty(...)`) for `--p` progress bar fills so SSR markup stays 100% free of inline `style=` attributes.
3. **A3 — Tailwind 3.4.17:** Confirmed. Extend `tailwind.config.ts` additively under `theme.extend`; put `@keyframes`, `@starting-style`, and `::backdrop` rules in `src/styles/motion.css` imported from `src/app/globals.css` right after `../styles/tokens.css`.
4. **A4 — Equal-Width Grids:** `DailyHome.tsx` `TabList` (4 tabs & 4 `My Farm` sub-tabs) already uses `grid-cols-4`—ideal for the pure-CSS `.seg` sliding pill. `LandUnitToggle.tsx` uses `inline-flex`; upgrade it to `grid grid-cols-2` (`.seg-2`) with `min-w-0` wrapping so both `Acres / Gunthas` and `एकर / गुंठे` slide smoothly.
5. **A5 — `CropCheckoutSheet.tsx` Desktop vs. Mobile:** Desktop (`lg+`) renders a sticky `<aside>` (not a `<dialog>`), while mobile (`< lg`) renders a native `<dialog>` (`open:flex`). Apply `.sheet` (`@starting-style` + `allow-discrete`) to the mobile `<dialog>`, `AboutDialog`, and mobile station picker, and `.dock-in` keyframe to desktop checkout lines.
6. **A6 — `StationIcon.tsx` SVGs:** All 6 icons are inline SVGs with clean `<path>` and `<circle>` primitives—ready for `pathLength="1" data-draw` and `<g className="fill">` bloom in P5.
7. **A7 & A8 — Conditional Panels & Fixed Bar Sibling:** `JourneyShell.tsx` conditionally renders station content, and the fixed mobile `Back / Next` bar is a **sibling** outside the panel `<section>` (so panel `translate3d` will not shift the fixed bar). Station 1 (`land`) and `My Farm -> land` MUST use `.panel-fade` (opacity-only, zero transform) to protect Leaflet pointer hit-testing.
8. **A9 — `ToastHost.tsx` Timers:** Confirmed exact constants `4000` (info) and `7000` (undo) with unified `hovered || focused` pause state. Export `TOAST_INFO_MS = 4000` and `TOAST_UNDO_MS = 7000` for automated parity testing against `--dur-toast-info` and `--dur-toast-undo`.

---

## 1. Motion Tokens (`v0.3.5` Additive Specification)

* **Durations:** `--dur-instant: 90ms`, `--dur-fast: 150ms`, `--dur-base: 240ms`, `--dur-slow: 340ms`, `--dur-exit: 160ms`, `--dur-exit-slow: 220ms`, `--dur-stagger: 40ms` (cap 6 items = 200ms max delay), `--dur-bloom: 520ms`, `--dur-fill: 420ms`, `--dur-pulse: 900ms`, `--dur-skeleton: 1200ms`, `--dur-toast-info: 4000ms` *(never zeroed)*, `--dur-toast-undo: 7000ms` *(never zeroed)*.
* **Easings:** `--ease-enter: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-exit: cubic-bezier(0.32, 0, 0.67, 0)`, `--ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1)` *(pop-ins only, never edge-anchored sheets)*, `--ease-press: cubic-bezier(0.2, 0, 0, 1)`, `--ease-sheet: cubic-bezier(0.32, 0.72, 0, 1)` *(no overshoot)*, `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`.
* **Distances:** `--dist-panel: 16px`, `--dist-tab: 8px`, `--dist-rise: 8px`, `--dist-dock: 24px`, `--dist-toast: 12px`, `--dist-dialog: 12px`, `--dist-digit: 6px`.
* **Scales:** `--scale-press: 0.97`, `--scale-pop-from: 0.6`, `--scale-ring: 1.04`, `--scale-thumb: 1.15`.
* **Reduced Motion (`prefers-reduced-motion: reduce`):** Zero all `--dur-*` except `--dur-toast-info` and `--dur-toast-undo`, zero all `--dist-*`, set all `--scale-*` to `1`, hide `.toast[data-state="leaving"]` and `.toast-bar`, and set `.skeleton { animation: none; opacity: 0.7; }`.
* **Print Guard (`@media print`):** `*, *::before, *::after { animation: none !important; transition: none !important; }`.

---

## 2. Hard Guardrails & Anti-Patterns (Enforced by Automated Tests)
1. **Zero new npm dependencies** (`package.json` dependencies unchanged; `PERSISTENCE_VERSION` stays `5`).
2. **GPU-composited properties only** (`transform`, `opacity` + sanctioned `stroke-dashoffset` on 24px `StationIcon`). Banned in `motion.css`: `transition: all`, `will-change`, `backdrop-filter`, literal `ms`/`s`/`cubic-bezier(` outside `tokens.css`, or `@keyframes` mutating `width`, `height`, `top`, `left`, `margin`.
3. **In-session only:** Plot arrival pulses, StationIcon blooms, and weather cross-fades must NEVER fire on IndexedDB hydration, Sample Mode toggles, or Marathi language switches.
4. **No `animationend` / `transitionend` state gating:** Use deterministic `setTimeout` cleanup (200ms exit window, 0ms under `prefers-reduced-motion`).
5. **No `display` override on closed `<dialog>`** (use `open:flex` or inner wrapper so `display: none` closes cleanly).

---

## 3. Six-Phase Implementation Sequence (P0 → P5)
- **P0 — Foundation & Motion Tests:** Merge `v0.3.5` motion tokens into `src/styles/tokens.css` & `tokens.json`, create `src/styles/motion.css`, extend `tailwind.config.ts`, add `src/lib/ui/useCssVar.ts`, export `TOAST_INFO_MS`/`TOAST_UNDO_MS`, and add `tests/motion-tokens.test.ts` (3 new tests: 54 → 57).
- **P1 — Overlays (`<dialog>` Sheets & Toast Choreography):** `.sheet` (`@starting-style` + `allow-discrete`) on mobile `CropCheckoutSheet`, `AboutDialog`, and mobile station picker; `.toast` enter/exit + synchronized countdown bar in `ToastHost`.
- **P2 — Growing Path Journey Navigation:** `data-dir` (`fwd`/`back`/`none`) on `JourneyShell` panels (`.panel` for Stations 2–6, `.panel-fade` opacity-only for Station 1 Leaflet), sidebar status transitions, and `ProgressStrip` `scaleX` fill.
- **P3 — Station 4 Signature Choreography:** `.press` tactile buttons, `CropAdvisorCard` stagger (cap 6) + `.check-badge` spring pop, `LandBar` `scaleX` fill via `useCssVar`, and transient in-session `PlotRow` arrival pulse (zero pulses on reload/hydration).
- **P4 — Daily Home & Controls:** `.seg` sliding active pill on `DailyHome` tabs, `My Farm` sub-nav, and `LandUnitToggle`; `.panel-tab` directional slide (`.panel-fade` on `My Farm -> land`); `SoilCard` pH digit tick + slider thumb scale.
- **P5 — Icon Bloom, Weather Cross-Fade, Stagger Polish & `v0.3.5` Release Gate:** `StationIcon` stroke-draw bloom (`pathLength="1" data-draw`), `WeatherCard` in-session skeleton cross-fade, Field Voice/Roadmap stagger, `SectionDisclosure` Pattern A reveal, and `v0.3.5` release bump.
