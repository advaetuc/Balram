# Balram v0.3.0 — Codex Implementation Prompt (Phase B1 & B2: Schema v4 + Pure Domain Engines)

Copy and paste the prompt below into **Codex**. It assumes `Release A (v0.2.1)` is complete and verified.

```markdown
You are the Lead Systems Engineer working on **Balram**. Read `AGENTS.md` and `BALRAM_V0_3_BLUEPRINT.md` in the repository root, and inspect `src/types/domain.ts`, `src/store/useBalramStore.ts`, `src/mocks/fixtures.ts`, `src/config/cropMatrix.ts`, `src/lib/domain/soilKit.ts`, `src/lib/domain/cropRecommendations.ts`, `src/lib/domain/fieldVoice.ts`, and `src/lib/domain/irrigation.ts`.

Your objective in this pass is to execute **Release B — Phase B1 (Schema v4 & Migration)** and **Phase B2 (Pure Domain Engines)** from `BALRAM_V0_3_BLUEPRINT.md`. Keep the existing UI components (`src/components/**`) compiling cleanly without building the new v0.3 shell yet.

---

## PHASE B1: Schema `v4` & Persistence Migration

### 1. Update `src/types/domain.ts`
Preserve all existing exports and add:
1. **`CheckInEventSchema` & `CheckInSchema`**:
   ```ts
   export const CheckInEventSchema = z.enum([
     "none",
     "heavy_rain",
     "hail",
     "heat_wave",
     "cold_night",
     "water_shortage",
   ]);
   export type CheckInEvent = z.infer<typeof CheckInEventSchema>;

   export const CheckInSchema = z.object({
     id,
     date: z.string().date(),
     plotId: id.nullable(),
     stage: LifecycleStageSchema.nullable(),
     event: CheckInEventSchema,
     note: z.string().trim().max(280).default(""),
   });
   export interface CheckIn extends z.infer<typeof CheckInSchema> {}
   ```
2. **Extend `SoilKitReadingSchema`**:
   - Add `"soil_health_card"` to `kitType`: `z.enum(["balram_inhouse", "commercial_rapid", "soil_health_card"])`.
   - Add optional numeric Soil Health Card / lab values (defaulting to `null` so existing `v3` blobs parse cleanly):
     - `nitrogenKgPerHa: z.number().finite().positive().max(2000).nullable().default(null)`
     - `phosphorusKgPerHa: z.number().finite().positive().max(500).nullable().default(null)`
3. **Extend `PersistedFarmSchema`**:
   - `soilSkipped: z.boolean().default(false)`
   - `setupCompletedAt: z.string().date().nullable().default(null)`
   - `checkIns: z.array(CheckInSchema).max(104).default([])`

### 2. Update `src/mocks/fixtures.ts`
- Update `createEmptyFixture()` to include `soilSkipped: false`, `setupCompletedAt: null`, `checkIns: []`.
- Update `createSampleFixture()` to include `soilSkipped: false`, `setupCompletedAt: "2026-10-01"`, `checkIns: []`, and `nitrogenKgPerHa: null`, `phosphorusKgPerHa: null` inside `soilKitReading`.

### 3. Update `src/store/useBalramStore.ts`
- Bump `export const PERSISTENCE_VERSION = 4;`.
- Include `soilSkipped`, `setupCompletedAt`, and `checkIns` in `persistedSlice(state)`.
- Ensure `invalidate()` preserves `soilSkipped`, `setupCompletedAt`, `checkIns`, `soilKitReading`, `cropAllocations`, and `locale` (only clearing `weatherSnapshot` and `soilSnapshot`).
- Add store actions to `BalramState`:
  - `setSoilSkipped(skipped: boolean): void`
  - `setSetupCompletedAt(dateIso: string | null): void`
  - `addCheckIn(checkIn: CheckIn): void` — validates with `CheckInSchema.parse(checkIn)`, prepends/appends into `checkIns` (capping at 104 entries), and if `checkIn.plotId && checkIn.stage`, updates that plot's `lifecycleStage` and `growthStage` together using `lifecycleToGrowthStage(checkIn.stage)`.
  - `replacePersistedState(next: PersistedFarm): void` — validates with `PersistedFarmSchema.parse(next)`, aborts active requests, increments `generation`, and updates store state cleanly (preparing for B7 backup restore).
- Update `migrate(saved, version)` to accept versions `[0, 1, 2, 3]` and inject `soilSkipped: false`, `setupCompletedAt: null`, `checkIns: []`, and `nitrogenKgPerHa: null`, `phosphorusKgPerHa: null` when an existing `soilKitReading` lacks them.

---

## PHASE B2: Pure Agronomic & Journey Domain Engines (No UI Changes)

### 4. Soil Health Card / Lab Classifiers in `src/lib/domain/soilKit.ts`
- Define and export named threshold constants with source citations in comments:
  - Alkaline KMnO₄ Available Nitrogen (Subbiah & Asija, 1956; Soil Health Card India): `ALKALINE_KMNO4_N_LOW_MAX = 280` (`< 280` low, `280–560` medium, `> 560` high).
  - Olsen Available Phosphorus (Olsen et al., 1954; Soil Health Card India): `OLSEN_P_LOW_MAX = 10` (`< 10` low, `10–25` medium, `> 25` high).
- Export `classifyNitrogenKgPerHa(kgPerHa: number): NutrientLevel` and `classifyPhosphorusKgPerHa(kgPerHa: number): NutrientLevel` (validating positive finite numbers).

### 5. Sowing Windows in `src/config/cropMatrix.ts` & `src/lib/domain/cropRecommendations.ts`
- In `src/config/cropMatrix.ts`:
  - Add `readonly sowingWindows: Partial<Record<Season, readonly [startMonthZeroIndexed: number, endMonthZeroIndexed: number]>>` to `CropThresholds` with comments flagging that sowing windows reflect MPKV Rahuri / ICAR Maharashtra norms pending local agronomist confirmation:
    - `sugarcane`: `{ Perennial: [0, 11], Kharif: [5, 7], Rabi: [9, 10] }` (Adsali/Pre-seasonal/Suru)
    - `rabi_jowar`: `{ Rabi: [8, 9] }` (mid-Sept to mid-Oct)
    - `onion`: `{ Rabi: [9, 11], Kharif: [5, 6] }`
    - `bajra`: `{ Kharif: [5, 6], Zaid: [1, 2] }`
    - `pomegranate`: `{ Perennial: [0, 11], Kharif: [5, 7], Rabi: [8, 10], Zaid: [1, 2] }`
    - `groundnut`: `{ Kharif: [5, 6], Zaid: [1, 2], Rabi: [9, 10] }`
- In `src/lib/domain/cropRecommendations.ts`:
  - Score each crop against `sowingWindows` for `monthZeroIndexed` (still defaulting deterministically to `9` when omitted — never calling `new Date()`), giving a higher match score when the target month falls inside an active sowing window vs. only matching the broad season.

### 6. Field Voice `reason` ("Why this advice?") in `src/lib/domain/fieldVoice.ts`
- Add `readonly reason: { readonly en: string; readonly mr: string }` to `FieldVoiceAdvisory`.
- Populate a concise, factual `reason` explaining the exact input triggers (e.g., `"Your soil pH is 8.4 and this plot has Onion"` / `"तुमच्या मातीचा सामू 8.4 आहे आणि या प्लॉटवर कांदा आहे"`) for all 7 rules and the fallback.

### 7. Create `src/lib/domain/journey.ts`
- Export `JourneyStationId = "land" | "weather" | "soil" | "crops" | "advice" | "roadmap"` and `JourneyStationStatus = "done" | "current" | "ready" | "skipped" | "locked" | "needs_update"`.
- Export `deriveJourney(state: PersistedFarm, nowIso: string | null)`:
  - **Pure & Invariant-1 Safe**: Never reads `Date.now()` or `new Date()`; uses `nowIso` when checking weather staleness (`nowIso === null` treats existing `weatherSnapshot` as non-stale during SSR).
  - Station completion & locking rules:
    1. `land`: `"done"` if `state.fieldGeometry !== null`, else `"current"`.
    2. `weather`: `"locked"` if `land` not done; `"needs_update"` if `land` done and (`!state.weatherSnapshot` or `weatherSnapshot` stale against `nowIso`); else `"done"`.
    3. `soil`: `"locked"` if `land` not done; `"done"` if `state.soilKitReading !== null`; `"skipped"` if `state.soilSkipped`; else `"ready"` (or `"current"` if `land` done and soil not yet handled).
    4. `crops`: `"locked"` if `land` not done; `"done"` if at least one plot in `state.cropAllocations` has valid `areaGunthas` and total `<=` farm gunthas (or valid plot allocation); else `"ready"` / `"current"`.
    5. `advice`: `"locked"` unless `land` and `crops` are done; `"needs_update"` if weather is missing/stale after a land edit; else `"ready"` / `"done"`.
    6. `roadmap`: `"locked"` unless `land` and `crops` are done; `"done"` if `state.setupCompletedAt !== null` (and not `needs_update`); else `"ready"`.

### 8. Create `src/lib/domain/roadmap.ts`
- Export `RoadmapBucket = "this_week" | "next_two_weeks" | "later"`, `RoadmapKind = "sowing" | "soil_amendment" | "fertilizer" | "irrigation" | "harvest"`, and `ProvenanceTag = "measured_by_kit" | "forecast" | "estimated" | "you_entered" | "assumed"`.
- Export `generateRoadmap(input: { allocations: readonly CropAllocation[]; soilInterpretation: SoilKitInterpretation | null; waterBreakdownByPlot: Record<string, ReturnType<typeof calculatePhaseWaterBreakdown>>; todayIso: string; })`:
  - Reuses existing `soilInterpretation.steps` (no new fertilizer dose numbers) and `waterBreakdownByPlot` to emit prioritized, bilingual (`{ en, mr }`) `RoadmapItem[]` items assigned to `this_week`, `next_two_weeks`, and `later`, each tagged with its exact `provenance`.

---

## VERIFICATION GATE (MANDATORY)
Add unit tests (e.g., `tests/release-b-domain.test.ts`) covering:
- `migrate` upgrading `v0`, `v1`, `v2`, and `v3` blobs to `PERSISTENCE_VERSION = 4`.
- `classifyNitrogenKgPerHa` and `classifyPhosphorusKgPerHa` exact boundary values (`279/280/560/561` and `9.9/10/25/25.1`).
- `cropRecommendations` sowing window scoring.
- `fieldVoice` `reason` bilingual parity.
- `deriveJourney` across every status transition (`locked`, `current`, `ready`, `skipped`, `needs_update`, `done`, and `nowIso === null`).
- `generateRoadmap` bucket placement and provenance tags.

Run all checks and confirm exit code `0`:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`
```
