"use client";

import { RadioChoices } from "@/components/ui/RadioChoices";

import { useEffect, useRef, useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { t, stationLabel } from "@/config/i18n";
import { deriveJourney, type JourneyStationId } from "@/lib/domain/journey";
import { JourneyShell } from "@/components/journey/JourneyShell";
import { DailyHome } from "@/components/home/DailyHome";
import { WeatherStation } from "@/components/journey/WeatherStation";
import { useCssVar } from "@/lib/ui/useCssVar";

type View="landing"|"journey"|"daily";
function nextStation(stations:ReturnType<typeof deriveJourney>):JourneyStationId {
  return stations.find(station=>station.status==="current"||station.status==="needs_update"||station.status==="ready")?.id??"land";
}

export function AppShell(){
  const state=useBalramStore(s=>s),text=t(state.locale);
  const [view,setView]=useState<View>("landing");
  const [samplePending,setSamplePending]=useState(false);
  const persistenceRequested=useRef(false);
  const progressRef=useRef<HTMLDivElement>(null);
  const nowIso=state.now===null?null:new Date(state.now).toISOString();
  const journey=deriveJourney(state,nowIso);
  const completedSteps = journey.filter(({ status }) => status === "done" || status === "skipped").length;
  useCssVar(progressRef,"--p",journey.length===0?0:completedSteps/journey.length);
  useEffect(() => {
    if (!state.hydrated) return;
    document.documentElement.lang = state.locale;
    document.title = state.locale === "mr" ? "बलराम | शेत नियोजन" : "Balram | Farm planning";
  }, [state.hydrated, state.locale]);
  useEffect(()=>{
    const returnToLanding=()=>setView("landing");
    window.addEventListener("balram:show-landing",returnToLanding);
    return()=>window.removeEventListener("balram:show-landing",returnToLanding);
  },[]);
  useEffect(()=>{
    if(!state.hydrated||persistenceRequested.current)return;
    persistenceRequested.current=true;
    try { void navigator.storage?.persist?.().catch(()=>false); } catch { /* Best-effort browser storage protection. */ }
  },[state.hydrated]);
  if(!state.hydrated)return <div className="space-y-5" aria-busy="true" role="status"><div className="h-8 w-56 rounded bg-forest/10"/><div className="h-48 rounded-2xl bg-white p-5 shadow-sm"><span className="sr-only">{text.loading}</span></div><div className="h-24 rounded-2xl bg-white p-5 shadow-sm"/></div>;
  const launchJourney=()=>setView("journey");
  const openSample = async () => {
    setSamplePending(true);
    try {
      await state.setSampleData(true);
      state.setLocale(state.locale);
      setView("daily");
    } finally {
      setSamplePending(false);
    }
  };
  return <>
    <WeatherStation visible={false}/>
    <div key={view} className="view-enter">
    {view==="landing"&&<div id="balram-home" className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-forest p-6 text-white sm:p-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-widest">Balram · {state.locale==="mr"?"महाराष्ट्र":"Maharashtra"}</p><h1 className="mt-3 text-3xl leading-heading font-bold sm:text-4xl">{state.locale==="mr"?"तुमचे शेत. तुमचा वाढीचा मार्ग.":"Your farm. A clearer growing path."}</h1><p className="mt-3 max-w-2xl leading-7">{state.locale==="mr"?"जमीन, माती, पिके आणि पाणी यांचे स्थानिक नियोजन—तुमच्या ब्राउझरमध्ये सुरक्षित.":"Plan land, soil, crops and water locally, with your information kept in this browser."}</p></div><RadioChoices label={text.languageSelector} value={state.locale} onChange={state.setLocale}
        className="light-focus flex flex-wrap gap-2 rounded-xl bg-white/10 p-2"
        options={[{ value: "en", label: state.locale === "mr" ? "इंग्रजी" : "English" }, { value: "mr", label: "मराठी" }]} /></div></section>
      <section className="bento-card"><p className="text-sm leading-body font-bold uppercase tracking-widest text-forest">{text.myFarm}</p><h2 className="mt-1 text-2xl leading-heading font-bold">{state.farmProfile?.name??text.myFarm}</h2>
        <div className="mt-3 flex items-center gap-3">
          <div role="progressbar" aria-label={text.stepsComplete} aria-valuemin={0} aria-valuemax={journey.length}
            aria-valuenow={completedSteps} className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <div ref={progressRef} aria-hidden="true" className="fill-x h-full w-full rounded-full bg-forest" />
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">{completedSteps} / {journey.length}</span>
        </div>
        {state.setupCompletedAt?<><p className="mt-2 text-sm">{state.locale==="mr"?"तुमचे शेत नियोजन तयार आहे.":"Your farm setup is complete."}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="button-primary min-h-14" onClick={()=>setView("daily")}>{text.openDailyHome}</button><button type="button" className="button-secondary" onClick={launchJourney}>{text.editSetup}</button></div></>
          :<><p className="mt-2 text-sm">{state.locale==="mr"?"जमीन, हवामान, माती, पिके आणि पुढील कामांचे सहा सोपे टप्पे.":"Six guided steps for land, weather, soil, crops and your next actions."}</p><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className="button-primary min-h-14" onClick={launchJourney}>{state.fieldGeometry||state.cropAllocations.length?`${text.continueSetup}: ${text.step} ${journey.findIndex(item=>item.id===nextStation(journey))+1}, ${stationLabel(state.locale,nextStation(journey))}`:text.startSetup}</button></div></>}
      </section>
      <section className="bento-card border-l-4 border-l-sky"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm leading-body font-bold uppercase tracking-widest text-forest">{text.provenance.sample}</p><h2 className="mt-1 text-xl font-bold">{text.sampleFarm}</h2><p className="mt-2 text-sm">{state.locale==="mr"?"नमुना शेतातील माहिती फक्त उदाहरणासाठी आहे. तुमचे जतन केलेले नियोजन बदलणार नाही.":"Explore an illustrative Pune farm without changing your saved farm."}</p></div><button type="button" className="button-secondary" disabled={state.sampleDataActive||samplePending} onClick={() => { void openSample(); }}>{samplePending?text.weatherLoading:state.sampleDataActive?text.openDailyHome:text.exploreSample}</button></div></section>
      {state.hydrationError&&<p role="alert" className="notice">{state.storageStatus.message??(state.locale==="mr"?"जतन केलेली माहिती उघडता आली नाही.":"Saved farm could not be opened.")}</p>}
    </div>}
    {view==="journey"&&<JourneyShell onFinish={()=>setView("daily")} onHome={()=>setView("landing")}/>}
    {view==="daily"&&<DailyHome onSetup={launchJourney}/>}
    </div>
  </>;
}
