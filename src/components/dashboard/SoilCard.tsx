"use client";

import { useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { createSoilHealthCardReading, interpretSoilKitReading } from "@/lib/domain/soilKit";
import { indiaDate, parseNumber } from "@/lib/ui/format";
import type { SoilKitReading } from "@/types/domain";
import { Card, DataCaption } from "./Card";
import { t } from "@/config/i18n";

type SoilMode = SoilKitReading["kitType"] | "skip";
const pill="min-h-12 min-w-12 rounded-lg border px-3";

export function SoilCard(){
  const state=useBalramStore(s=>s),text=t(state.locale),mr=state.locale==="mr",saved=state.soilKitReading;
  const [mode,setMode]=useState<SoilMode>(state.soilSkipped?"skip":saved?.kitType??"balram_inhouse");
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
  const choice=<T extends string,>(label:string,value:T,values:readonly T[],set:(v:T)=>void)=><fieldset disabled={disabled} className="mt-3"><legend className="text-sm font-semibold">{label}</legend><div className="flex flex-wrap gap-2">{values.map(v=><button key={v} type="button" className={`${pill} ${value===v?"border-forest bg-forest text-white":"border-forest/25"}`} aria-pressed={value===v} onClick={()=>set(v)}>{choiceName(v)}</button>)}</div></fieldset>;
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
  const interpretation=saved?interpretSoilKitReading(saved):null;
  return <Card id="soil" title={text.soil} eyebrow={text.kit}>
    <p className="mt-2 text-sm">{mr?"चाचणीचे निकाल या ब्राउझरमध्ये राहतात; बाहेरील सेवेकडे पाठवले जात नाहीत.":"Test results stay in this browser and are not sent to a provider."}</p>
    {state.sampleDataActive&&<p className="notice mt-3">{text.sampleReadOnly}</p>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {([ ["balram_inhouse",text.soilModeHouse], ["soil_health_card",text.soilModeCard], ["commercial_rapid",text.soilModeRapid] ] as const).map(([key,label])=><button type="button" key={key} disabled={disabled} aria-pressed={mode===key} className={`${pill} ${mode===key?"border-forest bg-forest text-white":"border-forest/25"}`} onClick={()=>setMode(key)}>{label}</button>)}
      <button type="button" disabled={disabled} aria-pressed={mode==="skip"} className={`${pill} ${mode==="skip"?"border-amber bg-amber text-ink":"border-forest/25"}`} onClick={chooseSkip}>{text.soilSkip}</button>
    </div>
    {mode==="skip"&&<p className="notice mt-3">{text.soilSkipped}</p>}
    {mode!=="skip"&&<>
      <p className="mt-3 text-xs leading-5">{mr?"इन-हाऊस पद्धत: माती-पाणी सामू, अल्कलाइन KMnO₄ नत्र आणि ओल्सेन रंगमिती स्फुरद.":"In-house method: soil-water pH, alkaline KMnO₄ available nitrogen, and Olsen colorimetry available phosphorus."}</p>
      <label className="mt-3 block text-sm">{mr?"मातीचा सामू (pH)":"Soil pH"} · {Number(ph).toFixed(1)}<input disabled={disabled} className="form-input mt-1" type="range" min="3.5" max="10.5" step="0.1" value={ph} onChange={e=>setPh(e.target.value)}/><span className="data-badge bg-amber/20 text-ink">{mr?"आम्लीय":"Acidic"} &lt; 6.5</span> <span className="data-badge bg-forest/10 text-forest">{mr?"तटस्थ":"Neutral"} 6.5–7.5</span> <span className="data-badge bg-sky/10 text-ink">{mr?"विम्ल":"Alkaline"} &gt; 7.5</span></label>
      {mode==="soil_health_card"?<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">{text.soilNitrogenKg}<input disabled={disabled} className="form-input mt-1" type="number" min="0.01" max="2000" step="any" value={nitrogenKg} onChange={e=>setNitrogenKg(e.target.value)}/></label><label className="text-sm">{text.soilPhosphorusKg}<input disabled={disabled} className="form-input mt-1" type="number" min="0.01" max="500" step="any" value={phosphorusKg} onChange={e=>setPhosphorusKg(e.target.value)}/></label></div>:<>{choice(mr?"उपलब्ध नत्र · अल्कलाइन KMnO₄":"Available nitrogen · alkaline KMnO₄",n,["low","medium","high"],setN)}{choice(mr?"उपलब्ध स्फुरद · ओल्सेन चाचणी":"Available phosphorus · Olsen test",p,["low","medium","high"],setP)}</>}
      {mode==="commercial_rapid"&&<>{choice(mr?"पालाश":"Potassium",k,["low","medium","high","untested"],setK)}{choice(mr?"सेंद्रिय कर्ब":"Organic carbon",carbon,["low","medium","high","untested"],setCarbon)}{choice(mr?"क्षारता":"Salinity",salinity,["normal","elevated","high","untested"],setSalinity)}</>}
      <div className="mt-4 flex flex-wrap gap-2"><button className="button-primary min-h-12 flex-1" disabled={disabled} onClick={save}>{text.soilSave}</button><button className="button-secondary min-h-12" disabled={disabled||!saved} onClick={()=>state.setSoilKitReading(null)}>{mr?"चाचणी काढा":"Clear kit reading"}</button></div>
    </>}
    {error&&<p role="alert" className="notice mt-2">{error}</p>}
    {interpretation&&<section className="mt-5 rounded-xl bg-forest/5 p-4"><h3 className="font-bold">{mr?"लागवडीपूर्वी मातीला काय हवे":"What Your Soil Needs Before Planting"}</h3><p className="mt-1">{mr?interpretation.headline.mr:interpretation.headline.en}</p><p className="data-badge mt-2 bg-sky/10">{mr?({optimal:"संतुलित",needs_enrichment:"सुधारणा आवश्यक",critical_amendment:"महत्त्वाची सुधारणा आवश्यक"} as const)[interpretation.overallHealth]:interpretation.overallHealth.replaceAll("_"," ")}</p><p className="mt-2 text-sm">{mr?interpretation.assayNotes.mr:interpretation.assayNotes.en}</p><ul className="mt-3 space-y-3">{interpretation.steps.map(step=><li key={step.id} className="rounded-lg border border-forest/15 bg-white p-3"><b>{mr?step.badgeLabel.mr:step.badgeLabel.en}</b><p className="text-sm">{mr?step.plainExplanation.mr:step.plainExplanation.en}</p><p className="mt-1 text-sm font-medium">{mr?step.actionStep.mr:step.actionStep.en}</p></li>)}</ul></section>}
    {state.soilSnapshot&&<details className="mt-4"><summary>{mr?"प्रादेशिक माती मॉडेल":"Saved modeled regional soil context"}</summary><p className="text-sm">{mr?"प्रादेशिक मॉडेल; प्रत्यक्ष चाचणी नाही.":"Regional model, not a physical test."} {state.soilSnapshot.fetchedAt}</p></details>}
    <DataCaption source={saved?(mr?"शेतकऱ्याने नोंदवलेली माती किट":"Farmer-entered physical soil kit"):(mr?"माती किटचा निकाल जतन नाही":"No physical kit reading saved")} validAt={saved?.testedAt??null} sample={state.sampleDataActive}/>
  </Card>;
}
