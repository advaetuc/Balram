"use client";

import { useState } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { generateFieldVoiceAdvisories } from "@/lib/domain/fieldVoice";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { MapClient } from "@/components/map/MapClient";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { SoilCard } from "@/components/dashboard/SoilCard";
import { IrrigationPanel } from "@/components/irrigation/IrrigationPanel";
import { FarmReport } from "@/components/report/FarmReport";
import { RoadmapList } from "@/components/journey/RoadmapList";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { t } from "@/config/i18n";

type HomeTab="today"|"farm"|"water"|"report";
const tabs:readonly HomeTab[]=["today","farm","water","report"];

export function DailyHome({ onSetup }: { onSetup: () => void }) {
  const state=useBalramStore(s=>s),text=t(state.locale),[tab,setTab]=useState<HomeTab>("today");
  const mr=state.locale==="mr",items=farmRoadmap(state),thisWeek=items.filter(item=>item.bucket==="this_week");
  const advisory=generateFieldVoiceAdvisories({allocations:state.cropAllocations,soilKitReading:state.soilKitReading,weatherSnapshot:state.weatherSnapshot,nowMs:state.now})[0];
  const irrigationItems=items.filter(item=>item.kind==="irrigation");
  return <div className="pb-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{mr?"माझे शेत":"My Farm"}</p><h1 className="mt-1 text-3xl font-bold">{state.farmProfile?.name??(mr?"आजचे नियोजन":"Today’s plan")}</h1></div><button type="button" className="button-secondary" onClick={onSetup}>{text.editSetup}</button></div>
    <div role="tablist" aria-label={mr?"दैनंदिन विभाग":"Daily Home"} className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-forest/15 bg-white p-2 sm:grid-cols-4">
      {tabs.map(key=><button type="button" role="tab" id={`home-tab-${key}`} aria-controls="daily-panel" aria-selected={tab===key} key={key} className={`min-h-12 rounded-xl px-3 font-semibold ${tab===key?"bg-forest text-white":"text-ink hover:bg-daylight"}`} onClick={()=>setTab(key)}>{text.dailyTabs[key]}</button>)}
    </div>
    <section id="daily-panel" role="tabpanel" aria-labelledby={`home-tab-${tab}`} className="min-w-0">
      {tab==="today"&&<div className="space-y-5">
        {state.soilSkipped&&!state.soilKitReading&&<p className="notice">{text.soilNotTested}</p>}
        {advisory&&<article className="bento-card border-l-4 border-l-amber"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{advisory.headline[state.locale]}</h2>{state.sampleDataActive&&<ProvenanceBadge provenance="sample" locale={state.locale}/>}</div><p className="mt-2 leading-6">{advisory.message[state.locale]}</p><p className="mt-2 font-semibold">{advisory.actionLabel[state.locale]}</p><details className="mt-2"><summary>{text.whyAdvice}</summary><p className="rounded-lg bg-daylight p-3 text-sm">{advisory.reason[state.locale]}</p></details></article>}
        <section className="bento-card"><h2 className="text-xl font-bold">{text.todayWater}</h2>{irrigationItems.length?<ul className="mt-3 space-y-3">{irrigationItems.map(item=><li key={item.id} className="rounded-xl border border-forest/15 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><b>{item.title[state.locale]}</b><ProvenanceBadge provenance={item.provenance} locale={state.locale}/></div><p className="mt-1 text-sm">{item.detail[state.locale]}</p></li>)}</ul>:<p className="mt-2 text-sm">{mr?"पाण्याचा अंदाज पाहण्यासाठी जमीन व पीक प्लॉट जोडा.":"Add field land and crop plots to see a water estimate."}</p>}</section>
        <section className="bento-card"><h2 className="text-xl font-bold">{text.nextActions}</h2><div className="mt-3"><RoadmapList items={thisWeek} locale={state.locale}/></div></section>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="button-secondary" disabled>{mr?"शेताची नोंद":"Quick check-in"}</button><span className="text-sm text-stone-600">{text.comingSoon}</span></div>
      </div>}
      {tab==="farm"&&<div className="space-y-5"><MapClient/><PortfolioCard/><SoilCard/><button type="button" className="button-secondary w-full" onClick={onSetup}>{text.editSetup}</button></div>}
      {tab==="water"&&<IrrigationPanel/>}
      {tab==="report"&&<FarmReport/>}
    </section>
  </div>;
}
