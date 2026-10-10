"use client";

import { useState } from "react";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { rebalancePortfolio } from "@/lib/domain/allocation";
import { useBalramStore } from "@/store/useBalramStore";
import { formatNumber } from "@/lib/ui/format";
import { SQUARE_METRES_PER_ACRE } from "@/lib/domain/geometry";
import type { CropAllocation } from "@/types/domain";
import { Card, DataCaption } from "./Card";

export function PortfolioCard() {
  const state = useBalramStore((value) => value);
  const [selection, setSelection] = useState<CropId>("sugarcane");
  const [error, setError] = useState<string | null>(null);
  const allocations = state.cropAllocations;
  const area = state.fieldGeometry?.areaSquareMetres;
  const available = Object.keys(MaharashtraCropMatrix).filter((id) => !allocations.some((crop) => crop.cropId === id)) as CropId[];
  const selected = available.includes(selection) ? selection : available[0];
  function adjust(cropId: string, percentage: number) {
    try { state.setCropAllocations(rebalancePortfolio(allocations, cropId, percentage)); setError(null); }
    catch { setError("Enter a percentage from 0 to 100 with at most two decimal places. A single crop must stay at 100%."); }
  }
  function add() {
    if (!selected) return;
    const crop = MaharashtraCropMatrix[selected];
    const next: CropAllocation[] = [...allocations, { cropId: selected, percentage: 100,
      season: crop.season.toLowerCase() as CropAllocation["season"], growthStage: "unknown", plantingDate: null }];
    const points = Math.floor(10_000 / next.length);
    state.setCropAllocations(next.map((entry, i) => ({ ...entry, percentage: (points + (i < 10_000 % next.length ? 1 : 0)) / 100 })));
    setError(null);
  }
  return <Card id="portfolio" title="Your crop portfolio" eyebrow="Land allocation" className="md:col-span-2">
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-stone-600">Adjust one crop; the others rebalance proportionally.</p>
      <span className="data-badge bg-forest/10 text-forest">{allocations.length ? "100% allocated" : "No crops selected"}</span></div>
    <fieldset disabled={!state.hydrated} className="mt-4 space-y-5">
      <legend className="sr-only">Crop allocations</legend>
      {allocations.map((crop) => <div key={crop.cropId} className="rounded-xl border border-forest/15 p-4">
        <div className="flex items-center justify-between gap-3"><label htmlFor={`allocation-${crop.cropId}`} className="font-semibold">
          {MaharashtraCropMatrix[crop.cropId as CropId]?.name ?? crop.cropId}</label>
          <button className="button-quiet text-sm" aria-label={`Remove ${MaharashtraCropMatrix[crop.cropId as CropId]?.name ?? crop.cropId}`}
            onClick={() => allocations.length === 1 ? state.setCropAllocations([]) : adjust(crop.cropId, 0)}>Remove</button></div>
        <div className="flex items-center gap-4"><input id={`allocation-${crop.cropId}`} type="range" min="0" max="100" step="1"
          value={crop.percentage} disabled={allocations.length === 1} className="min-w-0 flex-1 accent-forest"
          aria-valuetext={`${crop.percentage}%`} onChange={(event) => adjust(crop.cropId, Number(event.target.value))} />
          <span className="w-20 text-right font-bold tabular-nums">{formatNumber(crop.percentage, 2)}%</span></div>
        <p className="text-xs text-stone-600">{area == null ? "Area unavailable until a boundary or acreage is provided."
          : `${formatNumber(area / SQUARE_METRES_PER_ACRE * crop.percentage / 100, 2)} acres`}</p>
        <label className="mt-3 block text-sm">Growth stage
          <select value={crop.growthStage} className="form-input mt-1" onChange={(event) => state.setCropAllocations(allocations.map((entry) =>
            entry.cropId === crop.cropId ? { ...entry, growthStage: event.target.value as CropAllocation["growthStage"] } : entry))}>
            <option value="unknown">Not confirmed</option><option value="initial">Initial</option><option value="development">Development</option>
            <option value="mid-season">Mid-season</option><option value="late-season">Late-season</option>
          </select>
        </label>
      </div>)}
      {available.length > 0 && <div className="flex flex-wrap gap-3"><label className="min-w-0 flex-1 text-sm">Add crop
        <select className="form-input mt-1" value={selected} onChange={(event) => setSelection(event.target.value as CropId)}>
          {available.map((id) => <option value={id} key={id}>{MaharashtraCropMatrix[id].name}</option>)}</select></label>
        <button className="button-secondary self-end" onClick={add}>Add crop</button></div>}
    </fieldset>
    {error && <p className="notice mt-3" role="alert">{error}</p>}
    <details className="mt-3"><summary>Allocation rules</summary><p className="text-sm leading-6">Adding a crop distributes land evenly. Sliders keep the portfolio at exactly 100%; setting a crop to 0% removes it. Crop choices are your inputs, not a suitability recommendation. A single crop uses 100%.</p></details>
    <DataCaption source="Your crop choices and area inputs" validAt={state.planningUpdatedAt ?? state.farmProfile?.updatedAt ?? null} sample={state.sampleDataActive} />
  </Card>;
}
