"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { selectedWeatherDay } from "@/lib/ui/format";
import { Card, DataCaption } from "./Card";

export function AlertsCard() {
  const state = useBalramStore((value) => value);
  const day = selectedWeatherDay(state);
  const items: string[] = [];
  if (state.sampleDataActive) items.push("Sample mode is active. These values are illustrative and must not guide field operations.");
  if (state.connection === "offline") items.push("You are offline. You can edit your plan; provider lookups are paused.");
  if (state.weatherStale) items.push("Weather is stale. Refresh it before making a current-day irrigation estimate.");
  if (state.weatherStatus.error) items.push(state.weatherStatus.error);
  if (state.soilStatus.error) items.push(state.soilStatus.error);
  if (!day || day.referenceEvapotranspiration === null) items.push("No reference ET₀ is available for the selected day. Irrigation runtime is unavailable.");
  if (!state.irrigationSetup?.flowConfirmedByFarmer) items.push("Confirm your system flow and efficiency before calculating runtime.");
  if (state.storageStatus.mode === "memory") items.push("Edits are held in this tab only because browser storage is unavailable.");
  return <Card id="alerts" title="Planning checks" eyebrow="What needs attention" className="md:col-span-2">
    <ul className="mt-4 space-y-3 text-sm leading-6" aria-live="polite">
      {items.length ? items.map((message) => <li key={message} className="flex gap-3"><span className="mt-2 size-2 shrink-0 rounded-full bg-amber" aria-hidden="true" /><span>{message}</span></li>)
        : <li>No data-availability issues detected. Review dates and assumptions before using any estimate.</li>}
    </ul>
    <details className="mt-3"><summary>What these checks mean</summary><p className="text-sm leading-6">These are data-quality and setup checks, not crop hazard alerts. The app does not infer frost emergencies from modeled shallow-soil temperatures or apply generic Vertisol moisture thresholds as irrigation triggers.</p></details>
    <DataCaption source="Balram checks on saved inputs and provider status" validAt={state.now === null ? null : new Date(state.now).toISOString()}
      sample={state.sampleDataActive} />
  </Card>;
}
