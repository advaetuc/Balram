"use client";

import { useState, type FormEvent } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateSystemRuntime, calculatePhaseWaterBreakdown, resolveDailyEt0, simulateDroughtReallocation, type DeliveryMethodPreset } from "@/lib/domain/irrigation";
import { SQUARE_METRES_PER_ACRE, gunthasToAcresAndGunthas } from "@/lib/domain/geometry";
import { MaharashtraCropMatrix, type CropId } from "@/config/cropMatrix";
import { formatNumber, parseNumber, selectedWeatherDay } from "@/lib/ui/format";
import { Card, DataCaption } from "@/components/dashboard/Card";
import { t } from "@/config/i18n";

export function IrrigationPanel() {
  const state = useBalramStore((value) => value);
  const text=t(state.locale);
  // Remount the editor when switching fields or sample mode, so confirmation cannot carry across blocks.
  return <Editor key={`${state.hydrated}:${state.sampleDataActive}:${JSON.stringify(state.fieldGeometry)}:${JSON.stringify(state.cropAllocations)}`} />;
}

function Editor() {
  const state = useBalramStore((value) => value);
  const text=t(state.locale);
  const setup = state.irrigationSetup;
  const [flow, setFlow] = useState(setup?.systemFlowLitresPerHour?.toString() ?? "");
  const [efficiency, setEfficiency] = useState(setup?.applicationEfficiency == null ? "" : String(setup.applicationEfficiency * 100));
  const [cropId, setCropId] = useState(state.cropAllocations[0]?.cropId ?? "");
  const [kc, setKc] = useState("");
  const [rain, setRain] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryMethod,setDeliveryMethod]=useState<DeliveryMethodPreset>("drip");
  const [flowOverride,setFlowOverride]=useState("");
  const [waterAvailability,setWaterAvailability]=useState(100);
  const crop = state.cropAllocations.find((item) => item.cropId === cropId);
  const day = selectedWeatherDay(state);
  const area = state.fieldGeometry?.areaSquareMetres;
  const resolved=resolveDailyEt0(day,state.fieldGeometry?.center[1]??18.5204);
  const et0=resolved?.et0MmPerDay??4.5;
  const areaGunthas=crop?.areaGunthas??(area&&crop?area/SQUARE_METRES_PER_ACRE*40*crop.percentage/100:0);
  const phases=crop&&areaGunthas>0?calculatePhaseWaterBreakdown({cropId:crop.cropId as CropId,areaGunthas,baseEt0MmPerDay:et0,effectiveRainfallMmPerDay:day?.precipitation??0,deliveryMethod,customSystemFlowLph:parseNumber(flowOverride)}):[];
  const currentStage=crop?.lifecycleStage??"planned";
  const phase=phases.find(p=>p.stage===currentStage)??phases[0];
  const drought=area&&state.cropAllocations.length?simulateDroughtReallocation({allocations:state.cropAllocations,totalAreaSquareMetres:area,baseEt0MmPerDay:et0,waterAvailabilityPercent:waterAvailability}):null;
  const fields = { flow: parseNumber(flow), efficiency: parseNumber(efficiency), kc: parseNumber(kc), rain: parseNumber(rain) };
  const ready = confirmed && crop && crop.growthStage !== "unknown" && area != null && day?.referenceEvapotranspiration != null &&
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
  return <Card id="irrigation" title={text.irrigation} eyebrow={text.irrigationEyebrow}>
    <p className="mt-2 text-sm">Planning estimates only. Check field moisture and local guidance before irrigating.</p>
    {state.connection==="offline"&&<p className="notice mt-2">Offline · using saved forecast where available.</p>}{state.weatherStale&&<p className="notice mt-2">Stale forecast — check dates before relying on it.</p>}{resolved?.provenance==="hargreaves-fallback"&&<p className="notice mt-2">Calculated via Hargreaves temperature fallback.</p>}{!day&&<p className="notice mt-2">No forecast saved. Using a 4.5 mm/day Maharashtra baseline planning reference.</p>}
    <section className="mt-4 rounded-xl bg-sky/10 p-4"><h3 className="font-bold">Simple plot water plan</h3>
      <label className="mt-2 block text-sm">Plot<select className="form-input mt-1" value={cropId} onChange={e=>setCropId(e.target.value)}><option value="">Select plot</option>{state.cropAllocations.map((p,i)=><option key={p.plotId??i} value={p.cropId}>{p.plotName??"Plot"} · {MaharashtraCropMatrix[p.cropId as CropId]?.name} · {p.lifecycleStage??"planned"}</option>)}</select></label>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">{(["drip","sprinkler","canal_flood"] as const).map(m=><button type="button" key={m} aria-pressed={deliveryMethod===m} className={`min-h-12 rounded-lg border p-2 ${deliveryMethod===m?"border-forest bg-forest text-white":"border-forest/20"}`} onClick={()=>setDeliveryMethod(m)}>{m==="drip"?`${text.drip} · 90%`:m==="sprinkler"?`${text.sprinkler} · 75%`:`${text.canal} · 60%`}</button>)}</div>
      <label className="mt-2 block text-sm">Optional pump flow override (L/hour)<input className="form-input mt-1" type="number" min="0.1" step="any" value={flowOverride} onChange={e=>setFlowOverride(e.target.value)} placeholder="Use delivery preset"/></label>
      {phase&&<div className="mt-3 rounded-xl bg-white p-3"><p className="font-bold">Current stage · {currentStage.replaceAll("_"," ")}</p><p>{formatNumber(phase.dailyGrossLitres,0)} L/day · {formatNumber(phase.dailyRuntimeMinutes/60,0)} h {formatNumber(phase.dailyRuntimeMinutes%60,0)} min/day</p><p>{formatNumber(phase.weeklyGrossLitres,0)} L/week · {formatNumber(phase.weeklyTankerCount,1)} tankers of 10,000 L</p></div>}
      {phases.length>0&&<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Phase</th><th>Weeks</th><th>Kc</th><th>L/week</th><th>Tankers/week</th><th>Min/day</th></tr></thead><tbody>{phases.map(p=><tr key={p.stage} className={`border-t ${p.stage===currentStage?"bg-amber/20 font-bold":""}`}><td>{p.stage.replaceAll("_"," ")}</td><td>{p.durationWeeks}</td><td>{p.stageKc}</td><td>{formatNumber(p.weeklyGrossLitres,0)}</td><td>{formatNumber(p.weeklyTankerCount,1)}</td><td>{formatNumber(p.dailyRuntimeMinutes,0)}</td></tr>)}</tbody></table></div>}
    </section>
    <details className="mt-4"><summary>Drought & limited dam-release simulator</summary><label className="mt-2 block text-sm">Water availability · {waterAvailability}%<input className="form-input mt-1" type="range" min="20" max="100" step="1" value={waterAvailability} onChange={e=>setWaterAvailability(Number(e.target.value))}/></label>{drought&&<div className="notice mt-2"><p>Farm demand: {formatNumber(drought.dailyDemandLitres,0)} L/day · {formatNumber(drought.dailyDemandLitres*7,0)} L/week</p><p>Available: {formatNumber(drought.availableDailyLitres,0)} L/day</p><p>{drought.recommendation}</p></div>}</details>
    <details className="mt-4"><summary>Advanced: Measured block flow & custom Kc override</summary>
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
    </details><details className="mt-4"><summary>Formula & assumptions</summary>
      <div className="space-y-2 text-sm leading-6"><p>ETc = Kc × ET₀. Net depth = max(0, ETc − effective rainfall). One mm over one m² equals one litre. Gross volume = net volume ÷ efficiency; runtime = gross volume ÷ measured flow.</p>
        {blueprint && <p>The blueprint lists mid-season Kc = {blueprint.baseKc} for {blueprint.name}. It is a reference, not an automatic value for other growth stages.</p>}
        <p>Soil storage, leaching, runoff and water-stress corrections are excluded. Effective rainfall is not automatically copied from forecast precipitation.</p></div>
    </details>
    <DataCaption source={state.weatherSnapshot ? `${state.weatherSnapshot.source} + your confirmed inputs` : "Your inputs · weather unavailable"}
      validAt={day ? `${day.date}T00:00:00+05:30` : null} fetchedAt={state.weatherSnapshot?.fetchedAt ?? null}
      modeled={state.weatherSnapshot?.provenance === "modelled"} sample={state.sampleDataActive} stale={state.weatherStale} />
  </Card>;
}
