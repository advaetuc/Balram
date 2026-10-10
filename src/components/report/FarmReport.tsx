"use client";

import { useBalramStore } from "@/store/useBalramStore";
import { SQUARE_METRES_PER_ACRE } from "@/lib/domain/geometry";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { formatNumber, formatTime, selectedWeatherDay } from "@/lib/ui/format";

export function FarmReport() {
  const state = useBalramStore((value) => value);
  const day = selectedWeatherDay(state);
  const squareMetres = state.fieldGeometry?.areaSquareMetres;
  const acres = squareMetres == null ? null : squareMetres / SQUARE_METRES_PER_ACRE;
  return <section id="farm-report" aria-labelledby="report-title" className="bento-card mt-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-forest">Keep a copy</p>
      <h2 id="report-title" className="text-xl font-bold">Farm planning report</h2></div>
      <button className="button-secondary print:hidden" disabled={!state.hydrated} onClick={() => window.print()}>Print farm report</button></div>
    <p className="mt-3 text-sm">{state.farmProfile?.name ?? "Your saved field"} · Planning summary, not an irrigation prescription.</p>
    {state.sampleDataActive && <p className="notice mt-3 font-bold">Sample data · illustrative only</p>}
    {state.weatherStale && <p className="notice mt-3">Weather is stale. The report retains original dates.</p>}
    {state.connection === "offline" && <p className="notice mt-3">Offline · report uses saved data.</p>}
    <dl className="mt-5 grid gap-4 sm:grid-cols-3">
      <div><dt className="text-sm text-stone-600">Area</dt><dd className="text-xl font-semibold">{formatNumber(acres, 2)}{acres !== null && " acres"}</dd></div>
      <div><dt className="text-sm text-stone-600">Reference ET₀ {day ? `(${day.date})` : "(current day)"}</dt><dd className="text-xl font-semibold">{formatNumber(day?.referenceEvapotranspiration)}{day?.referenceEvapotranspiration != null && " mm/day"}</dd></div>
      <div><dt className="text-sm text-stone-600">Last planning edit</dt><dd className="text-sm">{formatTime(state.planningUpdatedAt ?? state.farmProfile?.updatedAt)}</dd></div>
    </dl>
    <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="pb-3 text-left font-semibold">Crop allocations</caption>
      <thead><tr className="border-b border-forest/20"><th className="py-3 pr-3">Crop</th><th className="p-3">Share</th><th className="p-3">Acres</th><th className="py-3 pl-3">Stage</th></tr></thead>
      <tbody>{state.cropAllocations.length ? state.cropAllocations.map((crop) => <tr key={crop.cropId} className="border-b border-forest/10">
        <td className="py-3 pr-3">{MaharashtraCropMatrix[crop.cropId as CropId]?.name ?? crop.cropId}</td><td className="p-3">{formatNumber(crop.percentage, 2)}%</td>
        <td className="p-3">{formatNumber(acres === null ? null : acres * crop.percentage / 100, 2)}</td><td className="py-3 pl-3">{crop.growthStage}</td>
      </tr>) : <tr><td colSpan={4} className="py-3">No crops allocated.</td></tr>}</tbody>
    </table></div>
    <div className="mt-5 space-y-2 text-xs leading-6 text-stone-600">
      <p>Weather source: {state.weatherSnapshot?.source ?? "Not fetched"}{state.weatherSnapshot?.provenance === "modelled" && " · Modeled Estimate"}</p>
      <p>Valid at: {formatTime(day ? `${day.date}T00:00:00+05:30` : state.weatherSnapshot?.validFrom)} · Fetched: {formatTime(state.weatherSnapshot?.fetchedAt)}</p>
      <p>Soil source: {state.soilSnapshot?.source ?? "Not available"}{state.soilSnapshot && " · Modeled Estimate"} · Valid at: {formatTime(state.soilSnapshot?.validAt)}</p>
      <p>{state.soilStatus.error ?? "Soil properties are contextual estimates and do not feed irrigation calculations."}</p>
      <p>Area is calculated from the drawn boundary or entered by you. ET₀ is regional modeled demand, not measured crop water use. Missing values are unavailable, never assumed to be zero. Runtime requires separately confirmed system inputs.</p>
    </div>
  </section>;
}
