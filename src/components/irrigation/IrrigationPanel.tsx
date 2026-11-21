"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { calculateSystemRuntime, calculatePhaseWaterBreakdown, resolveDailyEt0, simulateDroughtReallocation, type DeliveryMethodPreset } from "@/lib/domain/irrigation";
import { SQUARE_METRES_PER_ACRE, gunthasToAcresAndGunthas } from "@/lib/domain/geometry";
import { MaharashtraCropMatrix, getCropStageKc, type CropId } from "@/config/cropMatrix";
import { formatNumber, parseNumber, selectedWeatherDay } from "@/lib/ui/format";
import { SectionDisclosure } from "@/components/ui/SectionDisclosure";
import { Card, DataCaption } from "@/components/dashboard/Card";
import { cropLabel, t } from "@/config/i18n";
import { formatArea, displayPlotName } from "@/lib/domain/landUnits";

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
  const [deliveryMethod,setDeliveryMethod]=useState<DeliveryMethodPreset>(setup?.method==="sprinkler"?"sprinkler":setup?.method==="surface"?"canal_flood":"drip");
  const [selectedPlotId, setSelectedPlotId] = useState(state.cropAllocations[0]?.plotId ?? state.cropAllocations[0]?.cropId ?? "");
  const crop = state.cropAllocations.find((item, idx) => (item.plotId ?? `${item.cropId}-${idx}`) === selectedPlotId) ?? state.cropAllocations[0];
  const day = selectedWeatherDay(state);
  const area = state.fieldGeometry?.areaSquareMetres;
  const areaGunthas=crop?.areaGunthas??(area&&crop?area/SQUARE_METRES_PER_ACRE*40*crop.percentage/100:0);
  const flowDefault=setup?.systemFlowLitresPerHour??Math.max(400,Math.round((areaGunthas||20)*(deliveryMethod==="drip"?100:deliveryMethod==="sprinkler"?150:450)));
  const efficiencyDefault=setup?.applicationEfficiency!=null?setup.applicationEfficiency*100:(deliveryMethod==="drip"?90:deliveryMethod==="sprinkler"?75:60);
  const kcDefault=getCropStageKc((crop?.cropId??"onion") as CropId,crop?.lifecycleStage??"planned");
  const rainDefault=day?.precipitation??0;
  const [flow, setFlow] = useState(String(flowDefault));
  const [efficiency, setEfficiency] = useState(String(efficiencyDefault));
  const [kc, setKc] = useState(String(kcDefault));
  const [rain, setRain] = useState(String(rainDefault));
  const [confirmed, setConfirmed] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowOverride,setFlowOverride]=useState("");
  const [waterAvailability,setWaterAvailability]=useState(100);
  const plotKey=(item:typeof state.cropAllocations[number],idx:number)=>item.plotId??`${item.cropId}-${idx}`;
  const resolved=resolveDailyEt0(day,state.fieldGeometry?.center[1]??18.5204,state.weatherSnapshot?.source);
  const dataSource = state.weatherSnapshot?.source;
  const dataSourceLabel = !dataSource ? (state.locale === "mr" ? "तुमची माहिती · हवामान उपलब्ध नाही" : "Your inputs · weather unavailable")
    : state.locale === "mr" ? dataSource.includes("seasonal baseline") ? "बलराम · महाराष्ट्राचा हंगामी आधार" : dataSource.includes("Open-Meteo") ? "Open-Meteo · तुमची निश्चित केलेली माहिती" : "हवामान सेवा · तुमची निश्चित केलेली माहिती"
      : `${dataSource} + your confirmed inputs`;
  const et0=resolved?.et0MmPerDay??4.5;
  const growthStage=crop?.growthStage==="unknown"?"initial":crop?.growthStage;
  useEffect(()=>{
    setFlow(String(flowDefault));setEfficiency(String(efficiencyDefault));setKc(String(kcDefault));setRain(String(rainDefault));setConfirmed(true);
  },[selectedPlotId,deliveryMethod,setup?.systemFlowLitresPerHour,setup?.applicationEfficiency,flowDefault,efficiencyDefault,kcDefault,rainDefault]);
  const phases=crop&&areaGunthas>0?calculatePhaseWaterBreakdown({cropId:crop.cropId as CropId,areaGunthas,baseEt0MmPerDay:et0,effectiveRainfallMmPerDay:day?.precipitation??0,deliveryMethod,customSystemFlowLph:parseNumber(flowOverride)}):[];
  const currentStage=crop?.lifecycleStage??"planned";
  const phase=phases.find(p=>p.stage===currentStage)??phases[0];
  const drought=area&&state.cropAllocations.length?simulateDroughtReallocation({allocations:state.cropAllocations,totalAreaSquareMetres:area,baseEt0MmPerDay:et0,waterAvailabilityPercent:waterAvailability}):null;
  const fields = { flow: parseNumber(flow), efficiency: parseNumber(efficiency), kc: parseNumber(kc), rain: parseNumber(rain) };
  const ready = confirmed && crop && growthStage != null && area != null &&
    fields.flow !== null && fields.efficiency !== null && fields.kc !== null && fields.rain !== null;
  let estimate: ReturnType<typeof calculateSystemRuntime> | null = null;
  if (ready && submitted) {
    try { estimate = calculateSystemRuntime({ et0, cropKc: fields.kc!,
      areaAcres: area / SQUARE_METRES_PER_ACRE * crop.percentage / 100, effectiveRainfallMm: fields.rain!,
      systemFlowLitresPerHour: fields.flow!, applicationEfficiency: fields.efficiency! / 100, inputsConfirmedByFarmer: true }); }
    catch { estimate = null; }
  }
  function calculate(event: FormEvent) {
    event.preventDefault();
    if (!ready || fields.flow! <= 0 || fields.efficiency! <= 0 || fields.efficiency! > 100 || fields.kc! < 0 || fields.rain! < 0) {
      setSubmitted(false); setError(state.locale === "mr" ? "पीक अवस्था, ET₀, क्षेत्रफळ, प्रवाह, कार्यक्षमता, Kc आणि उपयुक्त पावसाची योग्य माहिती भरा." : "Provide a confirmed crop stage, current ET₀, field area, valid flow, efficiency, Kc and effective rainfall."); return;
    }
    state.setIrrigationSetup({ method: deliveryMethod==="canal_flood"?"surface":deliveryMethod, systemFlowLitresPerHour: fields.flow!,
      applicationEfficiency: fields.efficiency! / 100, flowConfirmedByFarmer: true });
    setSubmitted(true); setError(null);
  }
  const reset = () => { setSubmitted(false); setConfirmed(false); };
  const blueprint = crop ? MaharashtraCropMatrix[crop.cropId as CropId] : null;
  return <Card id="irrigation" title={text.irrigation} eyebrow={text.irrigationEyebrow}>
    <p className="mt-2 text-sm leading-body">{state.locale==="mr"?"ही नियोजनासाठीची गणना आहे. सिंचनापूर्वी शेतातील ओलावा व स्थानिक सल्ला तपासा.":"Planning estimates only. Check field moisture and local guidance before irrigating."}</p>
    {state.connection==="offline"&&<p className="notice mt-2">{state.locale==="mr"?"ऑफलाइन · उपलब्ध असल्यास जतन केलेला अंदाज वापरला जात आहे.":"Offline · using saved forecast where available."}</p>}{state.weatherStale&&<p className="notice mt-2">{state.locale==="mr"?"अंदाज जुना आहे · अवलंबून राहण्यापूर्वी तारखा तपासा.":"Stale forecast — check dates before relying on it."}</p>}{resolved?.provenance==="hargreaves-fallback"&&<p className="notice mt-2">{state.locale==="mr"?"किमान व कमाल तापमानावरून हर्ग्रीव्ह्ज पद्धतीने गणना केली.":"Calculated via Hargreaves temperature fallback."}</p>}{!day&&<p className="notice mt-2">{state.locale==="mr"?"अंदाज जतन केलेला नाही. महाराष्ट्राचा ४.५ मिमी/दिवस नियोजन आधार वापरला जात आहे.":"No forecast saved. Using a 4.5 mm/day Maharashtra baseline planning reference."}</p>}
    <section className="mt-4 rounded-xl bg-sky/10 p-4"><h3 className="font-bold">{state.locale==="mr"?"सोपे प्लॉट पाणी नियोजन":"Simple plot water plan"}</h3>
      <label className="mt-2 block text-sm leading-body">{state.locale==="mr"?"प्लॉट":"Plot"}<select className="form-input mt-1" value={crop?plotKey(crop,state.cropAllocations.indexOf(crop)):selectedPlotId} onChange={e=>setSelectedPlotId(e.target.value)}><option value="">{state.locale==="mr"?"प्लॉट निवडा":"Select plot"}</option>{state.cropAllocations.map((p,i)=>{const plotArea=p.areaGunthas??(area?area/SQUARE_METRES_PER_ACRE*40*p.percentage/100:null);return <option key={plotKey(p,i)} value={plotKey(p,i)}>{displayPlotName(p.plotName,state.locale,i+1)} · {cropLabel(state.locale,p.cropId as CropId)} ({plotArea===null?"?":formatArea(plotArea,state.landUnit,state.locale)})</option>})}</select></label>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">{(["drip","sprinkler","canal_flood"] as const).map(m=><button type="button" key={m} aria-pressed={deliveryMethod===m} className={`min-h-12 rounded-lg border p-2 ${deliveryMethod===m?"border-forest bg-forest text-white":"border-forest/20"}`} onClick={()=>setDeliveryMethod(m)}>{m==="drip"?`${text.drip} · 90%`:m==="sprinkler"?`${text.sprinkler} · 75%`:`${text.canal} · 60%`}</button>)}</div>
      <label className="mt-2 block text-sm leading-body">{state.locale==="mr"?"पंप प्रवाह बदल (लिटर/तास, ऐच्छिक)":"Optional pump flow override (L/hour)"}<input className="form-input mt-1" type="number" min="0.1" step="any" value={flowOverride} onChange={e=>setFlowOverride(e.target.value)} placeholder={state.locale==="mr"?"प्रीसेट प्रवाह वापरा":"Use delivery preset"}/></label>
      {phase&&<div className="mt-3 rounded-xl bg-white p-3"><p className="font-bold">{state.locale==="mr"?"सध्याची अवस्था":"Current stage"} · {text.stageNames[currentStage]}</p><p>{formatNumber(phase.dailyGrossLitres,0,state.locale)} L/{state.locale==="mr"?"दिवस":"day"} · {formatNumber(phase.dailyRuntimeMinutes/60,0,state.locale)} {state.locale==="mr"?"तास":"h"} {formatNumber(phase.dailyRuntimeMinutes%60,0,state.locale)} {state.locale==="mr"?"मिनिटे/दिवस":"min/day"}</p><p>{formatNumber(phase.weeklyGrossLitres,0,state.locale)} {state.locale==="mr"?"लिटर/आठवडा":"L/week"} · {formatNumber(phase.weeklyTankerCount,1,state.locale)} {state.locale==="mr"?"टँकर (१०,००० L)":"tankers of 10,000 L"}</p></div>}
      {phases.length>0&&<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm leading-body"><thead><tr><th>{state.locale==="mr"?"टप्पा":"Phase"}</th><th>{state.locale==="mr"?"आठवडे":"Weeks"}</th><th>Kc</th><th>{state.locale==="mr"?"लिटर/आठवडा":"L/week"}</th><th>{state.locale==="mr"?"टँकर/आठवडा":"Tankers/week"}</th><th>{state.locale==="mr"?"मिनिटे/दिवस":"Min/day"}</th></tr></thead><tbody>{phases.map(p=><tr key={p.stage} className={`border-t ${p.stage===currentStage?"bg-amber/20 font-bold":""}`}><td>{text.stageNames[p.stage]}</td><td>{formatNumber(p.durationWeeks,0,state.locale)}</td><td>{formatNumber(p.stageKc,1,state.locale)}</td><td>{formatNumber(p.weeklyGrossLitres,0,state.locale)}</td><td>{formatNumber(p.weeklyTankerCount,1,state.locale)}</td><td>{formatNumber(p.dailyRuntimeMinutes,0,state.locale)}</td></tr>)}</tbody></table></div>}
    </section>
    <SectionDisclosure className="mt-4" title={state.locale==="mr"?"दुष्काळ व मर्यादित कालवा पाणी नियोजन":"Drought & limited dam-release simulator"}><p className="notice mt-2">{state.locale==="mr"?"उदाहरणात्मक अंदाज · पीक क्षेत्र बदलण्यापूर्वी स्थानिक पातळीवर खात्री करा":"Illustrative scenario · verify locally before changing crop areas"}</p><label className="mt-2 block text-sm leading-body">{state.locale==="mr"?"उपलब्ध पाणी":"Water availability"} · {waterAvailability}%<input className="form-input mt-1" type="range" min="20" max="100" step="1" value={waterAvailability} onChange={e=>setWaterAvailability(Number(e.target.value))}/></label>{drought&&<div className="notice mt-2"><p>{state.locale==="mr"?"शेताची पाण्याची गरज":"Farm demand"}: {formatNumber(drought.dailyDemandLitres,0,state.locale)} L/{state.locale==="mr"?"दिवस":"day"} · {formatNumber(drought.dailyDemandLitres*7,0,state.locale)} {state.locale==="mr"?"लिटर/आठवडा":"L/week"}</p><p>{state.locale==="mr"?"उपलब्ध":"Available"}: {formatNumber(drought.availableDailyLitres,0,state.locale)} L/{state.locale==="mr"?"दिवस":"day"}</p><p>{drought.recommendationBilingual[state.locale]}</p></div>}</SectionDisclosure>
    <SectionDisclosure className="mt-4" title={state.locale==="mr"?"प्रगत: मोजलेला प्रवाह व Kc बदल":"Advanced: Measured block flow & custom Kc override"}>
    <p className="mt-3 text-sm leading-6">{state.locale==="mr"?"सुरुवातीची नियोजन मूल्ये निवडलेल्या प्लॉट व पाणी देण्याच्या पद्धतीनुसार भरली जातात. वापरण्यापूर्वी प्रत्यक्ष प्रवाह व कार्यक्षमता तपासा.":"Starting planning values are filled from the selected plot and delivery preset. Check the actual block flow and application efficiency before relying on a runtime."}</p>
    <form onSubmit={calculate} className="mt-5 space-y-4">
      <fieldset disabled={!state.hydrated} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">{state.locale==="mr"?"सिंचनाची माहिती":"Irrigation inputs"}</legend>
        <label className="text-sm sm:col-span-2">{state.locale==="mr"?"पीक क्षेत्र":"Crop block"}
          <select className="form-input mt-1" value={crop?plotKey(crop,state.cropAllocations.indexOf(crop)):selectedPlotId} onChange={(event) => { setSelectedPlotId(event.target.value); setKc(""); reset(); }} required>
            <option value="">{state.locale==="mr"?"प्लॉट निवडा":"Select a plot"}</option>{state.cropAllocations.map((entry,idx) => <option key={plotKey(entry,idx)} value={plotKey(entry,idx)}>
              {displayPlotName(entry.plotName,state.locale,idx+1)} · {cropLabel(state.locale,entry.cropId as CropId)} ({entry.areaGunthas==null?"?":formatArea(entry.areaGunthas,state.landUnit,state.locale)})</option>)}</select></label>
        <label className="text-sm leading-body">{state.locale==="mr"?"प्रणालीचा प्रवाह (लिटर/तास)":"System flow (L/hour)"}
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0.01" step="any" required value={flow}
            onBlur={() => { if(!flow)setFlow(String(flowDefault)); }} onChange={(event) => { setFlow(event.target.value); reset(); }} /></label>
        <label className="text-sm leading-body">{state.locale==="mr"?"पाणी देण्याची कार्यक्षमता (%)":"Application efficiency (%)"}
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0.01" max="100" step="any" required value={efficiency}
            onBlur={() => { if(!efficiency)setEfficiency(String(efficiencyDefault)); }} onChange={(event) => { setEfficiency(event.target.value); reset(); }} /></label>
        <label className="text-sm leading-body">{state.locale==="mr"?"पीक गुणांक (Kc)":"Crop coefficient (Kc)"}
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0" step="any" required value={kc}
            onBlur={() => { if(!kc)setKc(String(kcDefault)); }} onChange={(event) => { setKc(event.target.value); reset(); }} /></label>
        <label className="text-sm leading-body">{state.locale==="mr"?"उपयुक्त पाऊस (मिमी/दिवस)":"Effective rainfall (mm/day)"}
          <input className="form-input mt-1" type="number" inputMode="decimal" min="0" step="any" required value={rain}
            onBlur={() => { if(!rain)setRain(String(rainDefault)); }} onChange={(event) => { setRain(event.target.value); reset(); }} /></label>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 text-sm leading-6 sm:col-span-2">
          <input type="checkbox" className="size-12 shrink-0 accent-forest" checked={confirmed}
            onChange={(event) => { setConfirmed(event.target.checked); setSubmitted(false); }} />
          <span>{state.locale==="mr"?"या पीक क्षेत्राचा प्रवाह, कार्यक्षमता, वाढीची अवस्था, Kc आणि उपयुक्त पावसाची माहिती मी निश्चित करतो/करते.":"I confirm the flow and efficiency for this crop block, its growth stage, Kc and effective rainfall."}</span></label>
      </fieldset>
      {resolved?.provenance === "hargreaves-fallback" && <p className="notice">{state.locale==="mr"?"दैनिक किमान व कमाल तापमानावरून ET₀ ची गणना केली.":"ET₀ calculated from daily minimum and maximum temperatures."}</p>}
      {resolved?.provenance == null && <p className="notice">{state.locale==="mr"?"महाराष्ट्राचा ४.५ मिमी/दिवस नियोजन आधार वापरला जात आहे.":"Using the Maharashtra 4.5 mm/day baseline planning reference."}</p>}
      {state.weatherStale && !state.sampleDataActive && <p className="notice">{state.locale==="mr"?"हवामानाचा अंदाज जुना आहे. गणना करण्यापूर्वी तो अद्ययावत करा.":"Weather is stale. Refresh it before calculating runtime."}</p>}
      {state.connection === "offline" && !state.sampleDataActive && <p className="notice">{state.locale==="mr"?"ऑफलाइन: जतन केलेली माहिती तपासा आणि सध्याचा अंदाज मिळवण्यासाठी पुन्हा जोडणी करा.":"Offline: review saved inputs now and reconnect for a current runtime estimate."}</p>}
      {error && <p role="alert" className="notice">{error}</p>}
      <button className="button-primary w-full" type="submit" disabled={!state.hydrated||state.sampleDataActive}>{state.locale==="mr"?"नियोजनाचा अंदाज मोजा":"Calculate planning estimate"}</button>
    </form>
    {estimate && <div role="status" className="mt-5 rounded-xl bg-sky/10 p-5">
      <p className="text-sm leading-body font-bold uppercase tracking-widest">{state.sampleDataActive ? (state.locale==="mr"?"नमुना गणना · केवळ उदाहरण":"Sample calculation only") : (state.locale==="mr"?"नियोजनाचा अंदाज":"Planning estimate")}</p>
      <p className="mt-2 text-3xl font-bold leading-heading">{formatNumber(estimate.runtimeMinutes,1,state.locale)} {state.locale==="mr"?"मिनिटे":"minutes"}</p>
      <p className="mt-2 text-sm leading-body">{state.locale==="mr"?"एकूण पाणी":"Gross water"}: {formatNumber(estimate.grossVolumeLitres, 0,state.locale)} L · ETc: {formatNumber(estimate.cropEtMm,1,state.locale)} {state.locale==="mr"?"मिमी/दिवस":"mm/day"}</p>
      <p className="mt-2 text-sm leading-body">{state.locale==="mr"?"नोंदवलेल्या प्रवाहासह शेताच्या":"For"} {crop?.percentage}% {state.locale==="mr"?"क्षेत्रासाठी. ही आपोआप सिंचन सुरू करणारी सूचना नाही.":"of the field, with the entered block flow. This is not an automatic irrigation command."}</p>
    </div>}
    </SectionDisclosure><SectionDisclosure className="mt-4" title={state.locale==="mr"?"ही गणना कशी केली जाते?":"How is this calculated?"}>
      <div className="space-y-2 text-sm leading-6"><p>{state.locale==="mr"?"ETc = Kc × ET₀. निव्वळ खोली = कमाल(०, ETc − उपयुक्त पाऊस). १ मिमी पाणी १ चौ.मी. क्षेत्रावर पडल्यास १ लिटर होते. एकूण पाणी = निव्वळ पाणी ÷ कार्यक्षमता; वेळ = एकूण पाणी ÷ मोजलेला प्रवाह.":"ETc = Kc × ET₀. Net depth = max(0, ETc − effective rainfall). One mm over one m² equals one litre. Gross volume = net volume ÷ efficiency; runtime = gross volume ÷ measured flow."}</p>
        {blueprint && <p>{state.locale==="mr"?`${blueprint.marathiName} साठी मधल्या हंगामाचा Kc = ${blueprint.baseKc} हा संदर्भ आहे; इतर वाढीच्या अवस्थांसाठी तो आपोआप लागू होत नाही.`:`The blueprint lists mid-season Kc = ${blueprint.baseKc} for ${blueprint.name}. It is a reference, not an automatic value for other growth stages.`}</p>}
        <p>{state.locale==="mr"?"मातीतील पाणी साठवण, निचरा, वाहून जाणे आणि पाण्याच्या ताणातील बदल या गणनेत धरलेले नाहीत. अंदाजित पाऊस उपयुक्त पावसात आपोआप धरला जात नाही.":"Soil storage, leaching, runoff and water-stress corrections are excluded. Effective rainfall is not automatically copied from forecast precipitation."}</p></div>
    </SectionDisclosure>
    <DataCaption source={dataSourceLabel}
      validAt={day ? `${day.date}T00:00:00+05:30` : null} fetchedAt={state.weatherSnapshot?.fetchedAt ?? null}
      modeled={state.weatherSnapshot?.provenance === "modelled"} sample={state.sampleDataActive} stale={state.weatherStale} />
  </Card>;
}
