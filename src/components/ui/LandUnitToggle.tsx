"use client";

import { useBalramStore } from "@/store/useBalramStore";
import type { LandUnit } from "@/types/domain";

export function LandUnitToggle() {
  const state = useBalramStore((value) => value);
  const labels: readonly [LandUnit, string, string][] = [
    ["acres", "Acres", "एकर"],
    ["gunthas", "Gunthas", "गुंठे"],
  ];
  return <div role="radiogroup" aria-label={state.locale === "mr" ? "जमिनीचे एकक" : "Land unit"} className="inline-flex flex-wrap rounded-xl border border-forest/20 p-1">
    {labels.map(([unit, en, mr]) => <button key={unit} type="button" role="radio" aria-checked={state.landUnit === unit}
      disabled={!state.hydrated} onClick={() => state.setLandUnit(unit)}
      className={`min-h-12 rounded-lg border px-3 font-semibold ${state.landUnit === unit ? "border-forest bg-forest text-white" : "border-transparent text-ink hover:bg-forest/5"}`}>
      {state.landUnit === unit && <span aria-hidden="true" className="mr-1">✓</span>}{state.locale === "mr" ? mr : en}
    </button>)}
  </div>;
}
