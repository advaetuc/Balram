"use client";

import { RadioChoices } from "@/components/ui/RadioChoices";

import { useId, useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { createSoilHealthCardReading, interpretSoilKitReading } from "@/lib/domain/soilKit";
import { indiaDate, parseNumber } from "@/lib/ui/format";
import type { SoilKitReading } from "@/types/domain";
import { Card, DataCaption } from "./Card";
import { t } from "@/config/i18n";

type SoilMode = SoilKitReading["kitType"] | "skip";

export function SoilCard(){
  const state=useBalramStore(s=>s),text=t(state.locale),mr=state.locale==="mr",saved=state.soilKitReading;
  const [mode,setMode]=useState<SoilMode>(state.soilSkipped?"skip":saved?.kitType??"balram_inhouse");
  const phId = useId();
  const [ph,setPh]=useState(String(saved?.ph??7));
  const [n,setN]=useState<SoilKitReading["nitrogenLevel"]>(saved?.nitrogenLevel??"medium");
  const [p,setP]=useState<SoilKitReading["phosphorusLevel"]>(saved?.phosphorusLevel??"medium");
  const [nitrogenKg,setNitrogenKg]=useState(saved?.nitrogenKgPerHa==null?"":String(saved.nitrogenKgPerHa));
  const [phosphorusKg,setPhosphorusKg]=useState(saved?.phosphorusKgPerHa==null?"":String(saved.phosphorusKgPerHa));
  const [k,setK]=useState<SoilKitReading["potassiumLevel"]>(saved?.potassiumLevel??"untested");
  const [carbon,setCarbon]=useState<SoilKitReading["organicCarbon"]>(saved?.organicCarbon??"untested");
  const [salinity,setSalinity]=useState<SoilKitReading["salinity"]>(saved?.salinity??"untested");
  const [error,setError]=useState("");
  const disabled=!state.hydrated||state.sampleDataActive;
  const choiceName=(value:string)=>({low:text.low,medium:text.medium,high:text.high,untested:mr?"तपासलेले नाही":"Untested",normal:mr?"सामान्य":"Normal",elevated:mr?"वाढलेली":"Elevated"} as Record<string,string>)[value]??value;
  const choice = <T extends string,>(label: string, value: T, values: readonly T[], set: (next: T) => void) => (
    <fieldset className="mt-3 min-w-0">
      <legend className="mb-1 text-sm font-semibold leading-body">{label}</legend>
      <RadioChoices label={label} value={value} options={values.map(option => ({ value: option, label: choiceName(option) }))}
        onChange={set} disabled={disabled} />
    </fieldset>
  );
  function chooseSkip(){if(disabled)return;setMode("skip");state.setSoilSkipped(true);setError("")}
  function save(){
    try{
      if(mode==="skip")return;
      const nitrogenValue=mode==="soil_health_card"?parseNumber(nitrogenKg):null;
      const phosphorusValue=mode==="soil_health_card"?parseNumber(phosphorusKg):null;
      if(mode==="soil_health_card"&&(nitrogenValue===null||phosphorusValue===null||nitrogenValue>2000||phosphorusValue>500))throw new Error();
      const testedAt=indiaDate(state.now)??"2026-11-16";
      const value:SoilKitReading=mode==="soil_health_card"
        ?createSoilHealthCardReading({ph:Number(ph),nitrogenKgPerHa:nitrogenValue!,phosphorusKgPerHa:phosphorusValue!,testedAt})
        :{kitType:mode,ph:Number(ph),nitrogenLevel:n,phosphorusLevel:p,
          potassiumLevel:mode==="balram_inhouse"?"untested":k,organicCarbon:mode==="balram_inhouse"?"untested":carbon,
          salinity:mode==="balram_inhouse"?"untested":salinity,testedAt,nitrogenKgPerHa:null,phosphorusKgPerHa:null};
      state.setSoilKitReading(value);setMode(mode);setError("");
    }catch{setError(mr?"pH 3.5 ते 10.5 दरम्यान आणि kg/ha मधील आकडे मर्यादेत नोंदवा.":"Enter pH from 3.5 to 10.5 and valid Soil Health Card values (N ≤ 2000, P ≤ 500 kg/ha).")}
  }
  function stepPh(delta: number) {
    setPh(value => (Math.min(105, Math.max(35, Math.round(Number(value) * 10) + delta)) / 10).toFixed(1));
  }
  const interpretation=saved?interpretSoilKitReading(saved):null;
  return <Card id="soil" title={text.soil} eyebrow={text.kit}>
    <p className="mt-2 text-sm leading-body">{mr?"चाचणीचे निकाल या ब्राउझरमध्ये राहतात; बाहेरील सेवेकडे पाठवले जात नाहीत.":"Test results stay in this browser and are not sent to a provider."}</p>
    {state.sampleDataActive&&<p className="notice mt-3">{text.sampleReadOnly}</p>}
    <fieldset className="mt-4 min-w-0">
      <legend className="mb-2 text-sm font-bold leading-body">{mr ? "चाचणी पद्धत" : "Test method"}</legend>
      <RadioChoices<SoilMode> label={mr ? "चाचणी पद्धत" : "Test method"} value={mode} disabled={disabled}
        className="grid gap-2 sm:grid-cols-2"
        options={[
          { value: "balram_inhouse", label: text.soilModeHouse, className: "sm:col-span-2 [&>label]:min-h-14" },
          { value: "soil_health_card", label: text.soilModeCard },
          { value: "commercial_rapid", label: text.soilModeRapid },
          { value: "skip", label: text.soilSkip, className: "sm:col-span-2" },
        ]} onChange={next => next === "skip" ? chooseSkip() : setMode(next)} />
    </fieldset>
    {mode==="skip"&&<p className="notice mt-3">{text.soilSkipped}</p>}
    {mode!=="skip"&&<>
      <p className="mt-3 text-sm leading-body">{mr?"इन-हाऊस पद्धत: माती-पाणी सामू, क्षारीय पोटॅशियम परमॅंगनेट नत्र आणि ओल्सेन रंगमिती स्फुरद.":"In-house method: soil-water pH, alkaline KMnO₄ available nitrogen, and Olsen colorimetry available phosphorus."}</p>
      <div className="mt-3">
        <label htmlFor={phId} className="block text-sm font-semibold leading-body">{mr ? "मातीचा सामू (pH)" : "Soil pH"}</label>
        <div className="mt-1 flex items-center gap-3">
          <button type="button" className="button-secondary min-h-12" aria-label={text.phDecrease}
            disabled={disabled} aria-disabled={Number(ph) <= 3.5} onClick={() => stepPh(-1)}>−0.1</button>
          <output htmlFor={phId} className="text-3xl font-bold leading-heading tabular-nums">{Number(ph).toFixed(1)}</output>
          <button type="button" className="button-secondary min-h-12" aria-label={text.phIncrease}
            disabled={disabled} aria-disabled={Number(ph) >= 10.5} onClick={() => stepPh(1)}>+0.1</button>
        </div>
        <input id={phId} disabled={disabled} className="form-input mt-2 accent-forest" type="range" min="3.5" max="10.5"
          step="0.1" value={ph} onChange={event => setPh(event.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2 text-sm leading-body">
          <span className="rounded-full bg-warning-subtle px-3 py-1 text-on-warning-subtle">{mr ? "आम्लीय" : "Acidic"} &lt; 6.5</span>
          <span className="rounded-full bg-success-subtle px-3 py-1 text-on-success-subtle">{mr ? "तटस्थ" : "Neutral"} 6.5–7.5</span>
          <span className="rounded-full bg-info-subtle px-3 py-1 text-on-info-subtle">{mr ? "विम्ल" : "Alkaline"} &gt; 7.5</span>
        </div>
      </div>
      {mode==="soil_health_card"?<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm leading-body">{text.soilNitrogenKg}<input disabled={disabled} className="form-input mt-1" type="number" min="0.01" max="2000" step="any" value={nitrogenKg} onChange={e=>setNitrogenKg(e.target.value)}/></label><label className="text-sm leading-body">{text.soilPhosphorusKg}<input disabled={disabled} className="form-input mt-1" type="number" min="0.01" max="500" step="any" value={phosphorusKg} onChange={e=>setPhosphorusKg(e.target.value)}/></label></div>:<>{choice(mr?"उपलब्ध नत्र · क्षारीय पोटॅशियम परमॅंगनेट":"Available nitrogen · alkaline KMnO₄",n,["low","medium","high"],setN)}{choice(mr?"उपलब्ध स्फुरद · ओल्सेन चाचणी":"Available phosphorus · Olsen test",p,["low","medium","high"],setP)}</>}
      {mode==="commercial_rapid"&&<>{choice(mr?"पालाश":"Potassium",k,["low","medium","high","untested"],setK)}{choice(mr?"सेंद्रिय कर्ब":"Organic carbon",carbon,["low","medium","high","untested"],setCarbon)}{choice(mr?"क्षारता":"Salinity",salinity,["normal","elevated","high","untested"],setSalinity)}</>}
      <div className="mt-4 flex flex-wrap gap-2"><button className="button-primary min-h-12 flex-1" disabled={disabled} onClick={save}>{text.soilSave}</button><button className="button-secondary min-h-12" disabled={disabled||!saved} onClick={()=>state.setSoilKitReading(null)}>{mr?"चाचणी काढा":"Clear kit reading"}</button></div>
    </>}
    {error&&<p role="alert" className="notice mt-2">{error}</p>}
    {interpretation&&<section className="mt-5 rounded-xl bg-forest/5 p-4"><h3 className="font-bold">{mr?"लागवडीपूर्वी मातीला काय हवे":"What Your Soil Needs Before Planting"}</h3><p className="mt-1">{mr?interpretation.headline.mr:interpretation.headline.en}</p><p className="inline-flex rounded-full px-3 py-1 text-sm leading-body mt-2 bg-sky/10">{mr?({optimal:"संतुलित",needs_enrichment:"सुधारणा आवश्यक",critical_amendment:"महत्त्वाची सुधारणा आवश्यक"} as const)[interpretation.overallHealth]:interpretation.overallHealth.replaceAll("_"," ")}</p><p className="mt-2 text-sm leading-body">{mr?interpretation.assayNotes.mr:interpretation.assayNotes.en}</p><ul className="mt-3 space-y-3">{interpretation.steps.map(step=><li key={step.id} className="rounded-lg border border-forest/15 bg-white p-3"><b>{mr?step.badgeLabel.mr:step.badgeLabel.en}</b><p className="text-sm leading-body">{mr?step.plainExplanation.mr:step.plainExplanation.en}</p><p className="mt-1 text-sm font-medium">{mr?step.actionStep.mr:step.actionStep.en}</p></li>)}</ul></section>}
    <DataCaption source={saved?(mr?"शेतकऱ्याने नोंदवलेली माती किट":"Farmer-entered physical soil kit"):(mr?"माती किटचा निकाल जतन नाही":"No physical kit reading saved")} validAt={saved?.testedAt??null} sample={state.sampleDataActive}/>
  </Card>;
}
