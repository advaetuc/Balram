"use client";

import { useState, type FormEvent } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateSystemRuntime } from "@/lib/domain/irrigation";
import { SQUARE_METRES_PER_ACRE } from "@/lib/domain/geometry";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { formatNumber, parseNumber, selectedWeatherDay } from "@/lib/ui/format";
import { Card, DataCaption } from "@/components/dashboard/Card";

export function IrrigationPanel() {
  const state = useBalramStore((value) => value);
  // Remount the editor when switching fields or sample mode, so confirmation cannot carry across blocks.
  return <Editor key={`${state.hydrated}:${state.sampleDataActive}:${JSON.stringify(state.fieldGeometry)}:${JSON.stringify(state.cropAllocations)}`} />;
}

function Editor() {
  const state = useBalramStore((value) => value);
  const setup = state.irrigationSetup;
  const [flow, setFlow] = useState(setup?.systemFlowLitresPerHour?.toString() ?? "");
  const [efficiency, setEfficiency] = useState(setup?.applicationEfficiency == null ? "" : String(setup.applicationEfficiency * 100));
  const [cropId, setCropId] = useState(state.cropAllocations[0]?.cropId ?? "");
  const [kc, setKc] = useState("");
  const [rain, setRain] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crop = state.cropAllocations.find((item) => item.cropId === cropId);
  const day = selectedWeatherDay(state);
  const area = state.fieldGeometry?.areaSquareMetres;
  const fields = { flow: parseNumber(flow), efficiency: parseNumber(efficiency), kc: parseNumber(kc), rain: parseNumber(rain) };
  const ready = confirmed && crop && crop.growthStage !== "unknown" && area != null && day?.referenceEvapotranspiration != null &&
    (!state.weatherStale || state.sampleDataActive) && (state.connection !== "offline" || state.sampleDataActive) &&
    fields.flow !== null && fields.efficiency !== null && fields.kc !== null && fields.rain !== null;
  let estimate: ReturnType<typeof calculateSystemRuntime> | null = null;
  if (ready && submitted) {
    try { estimate = calculateSystemRuntime({ et0: day.referenceEvapotranspiration!, cropKc: fields.kc!,
      areaAcres: area / SQUARE_METRES_PER_ACRE * crop.percentage / 100, effectiveRainfallMm: fields.rain!,
      systemFlowLitresPerHour: fields.flow!, applicationEfficiency: fields.efficiency! / 100, inputsConfirmedByFarmer: true }); }
    catch { estimate = null; }
  }
  function calculate(event: FormEvent) {
    event.preventDefault();
    if (!ready || fields.flow! <= 0 || fields.efficiency! <= 0 || fields.efficiency! > 100 || fields.kc! < 0 || fields.rain! < 0) {
      setSubmitted(false); setError("Provide a confirmed crop stage, current ET₀, field area, valid flow, efficiency, Kc and effective rainfall."); return;
    }
    state.setIrrigationSetup({ method: "drip", systemFlowLitresPerHour: fields.flow!,
      applicationEfficiency: fields.efficiency! / 100, flowConfirmedByFarmer: true });
    setSubmitted(true); setError(null);
  }
  const reset = () => { setSubmitted(false); setConfirmed(false); };
  const blueprint = crop ? MaharashtraCropMatrix[crop.cropId as CropId] : null;
  return <Card id="irrigation" title="Plan an irrigation run" eyebrow="Measured inputs first">
    <p className="mt-3 text-sm leading-6">Use measured total flow for the selected crop block. Enter efficiency yourself; the app never assumes emitter flow or a default system efficiency.</p>
    <form onSubmit={calculate} className="mt-5 space-y-4">
      <fieldset disabled={!state.hydrated} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Irrigation inputs</legend>
        <label className="text-sm sm:col-span-2">Crop block
          <select className="form-input mt-1" value={cropId} onChange={(event) => { setCropId(event.target.value); setKc(""); reset(); }} required>
            <option value="">Select a crop</option>{state.cropAllocations.map((entry) => <option key={entry.cropId} value={entry.cropId}>
              {MaharashtraCropMatrix[entry.cropId as CropId]?.name ?? entry.cropId} · {entry.percentage}%</option>)}</select></label>
        <label className="text-sm">System flow (L/hour)
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0.01" step="any" required value={flow}
            onChange={(event) => { setFlow(event.target.value); reset(); }} /></label>
        <label className="text-sm">Application efficiency (%)
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0.01" max="100" step="any" required value={efficiency}
            onChange={(event) => { setEfficiency(event.target.value); reset(); }} /></label>
        <label className="text-sm">Crop coefficient (Kc)
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0" step="any" required value={kc}
            onChange={(event) => { setKc(event.target.value); reset(); }} /></label>
        <label className="text-sm">Effective rainfall (mm/day)
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0" step="any" required value={rain}
            onChange={(event) => { setRain(event.target.value); reset(); }} /></label>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 text-sm leading-6 sm:col-span-2">
          <input type="checkbox" className="size-12 shrink-0 accent-forest" checked={confirmed}
            onChange={(event) => { setConfirmed(event.target.checked); setSubmitted(false); }} />
          <span>I confirm the flow and efficiency for this crop block, its growth stage, Kc and effective rainfall.</span></label>
      </fieldset>
      {crop?.growthStage === "unknown" && <p className="notice">Confirm the crop&apos;s growth stage in the portfolio first.</p>}
      {(!day || day.referenceEvapotranspiration == null) && <p className="notice">Current-day ET₀ is unavailable. No runtime can be calculated.</p>}
      {state.weatherStale && !state.sampleDataActive && <p className="notice">Weather is stale. Refresh it before calculating runtime.</p>}
      {state.connection === "offline" && !state.sampleDataActive && <p className="notice">Offline: review saved inputs now and reconnect for a current runtime estimate.</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      <button className="button-primary w-full" type="submit" disabled={!state.hydrated}>Calculate planning estimate</button>
    </form>
    {estimate && <div role="status" className="mt-5 rounded-xl bg-sky/10 p-5">
      <p className="text-xs font-bold uppercase tracking-widest">{state.sampleDataActive ? "Sample calculation only" : "Planning estimate"}</p>
      <p className="mt-2 text-3xl font-bold">{formatNumber(estimate.runtimeMinutes)} minutes</p>
      <p className="mt-2 text-sm">Gross water: {formatNumber(estimate.grossVolumeLitres, 0)} L · ETc: {formatNumber(estimate.cropEtMm)} mm/day</p>
      <p className="mt-2 text-xs">For {crop?.percentage}% of the field, with the entered block flow. This is not an automatic irrigation command.</p>
    </div>}
    <details className="mt-4"><summary>Formula & assumptions</summary>
      <div className="space-y-2 text-sm leading-6"><p>ETc = Kc × ET₀. Net depth = max(0, ETc − effective rainfall). One mm over one m² equals one litre. Gross volume = net volume ÷ efficiency; runtime = gross volume ÷ measured flow.</p>
        {blueprint && <p>The blueprint lists mid-season Kc = {blueprint.baseKc} for {blueprint.name}. It is a reference, not an automatic value for other growth stages.</p>}
        <p>Soil storage, leaching, runoff and water-stress corrections are excluded. Effective rainfall is not automatically copied from forecast precipitation.</p></div>
    </details>
    <DataCaption source={state.weatherSnapshot ? `${state.weatherSnapshot.source} + your confirmed inputs` : "Your inputs · weather unavailable"}
      validAt={day ? `${day.date}T00:00:00+05:30` : null} fetchedAt={state.weatherSnapshot?.fetchedAt ?? null}
      modeled={state.weatherSnapshot?.provenance === "modelled"} sample={state.sampleDataActive} stale={state.weatherStale} />
  </Card>;
}
