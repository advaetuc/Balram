"use client";

import { useMemo, useState } from "react";
import type { JourneyStationId, JourneyStationStatus } from "@/lib/domain/journey";
import { adjacentJourneyStation, deriveJourney } from "@/lib/domain/journey";
import { useBalramStore } from "@/store/useBalramStore";
import { t, stationLabel, stationStatusLabel } from "@/config/i18n";
import { MapClient } from "@/components/map/MapClient";
import { WeatherCard } from "@/components/dashboard/WeatherCard";
import { SoilCard } from "@/components/dashboard/SoilCard";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { AlertsCard } from "@/components/dashboard/AlertsCard";
import { CropAdvisorCard } from "@/components/dashboard/CropAdvisorCard";
import { FarmReport } from "@/components/report/FarmReport";
import { StationIcon } from "@/components/ui/StationIcon";
import { RoadmapList } from "./RoadmapList";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { indiaDate } from "@/lib/ui/format";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

const order: readonly JourneyStationId[] = ["land", "weather", "soil", "crops", "advice", "roadmap"];
function nextStep(stations: ReturnType<typeof deriveJourney>): JourneyStationId {
  return stations.find((station) => station.status === "current" || station.status === "needs_update" || station.status === "ready")?.id ?? "land";
}
function stationAllowed(status: JourneyStationStatus) { return status !== "locked"; }

export function JourneyShell({ onFinish, onHome }: { onFinish: () => void; onHome: () => void }) {
  const state=useBalramStore(s=>s),text=t(state.locale);
  const nowIso=state.now===null?null:new Date(state.now).toISOString();
  const stations=useMemo(()=>deriveJourney(state,nowIso),[state,nowIso]);
  const [activeStation,setActiveStation]=useState<JourneyStationId>(()=>nextStep(stations));
  const [sheetOpen,setSheetOpen]=useState(false);
  const activeIndex=order.indexOf(activeStation),activeRecord=stations.find(item=>item.id===activeStation)!;
  const forecastAge=state.weatherSnapshot&&state.now!==null?Math.max(0,Math.floor((state.now-Date.parse(state.weatherSnapshot.fetchedAt))/60_000)):null;
  const items=farmRoadmap(state);
  const select=(id:JourneyStationId)=>{const station=stations.find(item=>item.id===id);if(station&&stationAllowed(station.status)){setActiveStation(id);setSheetOpen(false)}};
  const change=(direction:-1|1)=>{const candidate=adjacentJourneyStation(stations,activeStation,direction);if(candidate)select(candidate)};
  const content=activeStation==="land"?<><p className="notice mb-4">{state.locale==="mr"?"तुम्ही ऑफलाइन असतानाही जमीन आणि एकर-गुंठे नोंदवू शकता.":"You can enter your land and Acres & Gunthas while offline."}</p><MapClient/></>
    :activeStation==="weather"?<><p className="mb-4 text-sm">{text.weatherAuto}</p>{state.weatherStatus.state==="loading"&&<p role="status" className="notice mb-3">{text.weatherLoading}</p>}{(state.weatherStatus.state==="error"||(state.connection==="offline"&&!state.weatherSnapshot))&&<p role="status" className="notice mb-3">{text.weatherError}</p>}{state.connection==="offline"&&state.weatherSnapshot&&<div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky/30 bg-sky/10 p-3 text-sm"><span>{state.locale==="mr"?"ऑफलाइन · जतन केलेला अंदाज":"Offline · saved forecast"}</span><ProvenanceBadge provenance="forecast" locale={state.locale}/><span>{state.locale==="mr"?"वय":"Age"}: {forecastAge===null?state.weatherSnapshot.fetchedAt:forecastAge<60?(state.locale==="mr"?`${forecastAge} मिनिटांपूर्वी`:`${forecastAge} min ago`):(state.locale==="mr"?`${Math.floor(forecastAge/60)} तासांपूर्वी`:`${Math.floor(forecastAge/60)} hr ago`)}</span></div>}<WeatherCard/></>
    :activeStation==="soil"?<><SoilCard/>{state.soilSkipped&&<p className="notice mt-4">{text.soilNotTested}</p>}</>
    :activeStation==="crops"?<PortfolioCard/>
    :activeStation==="advice"?<><div className="mb-4 flex flex-wrap gap-2">{state.soilSkipped&&!state.soilKitReading&&<span className="data-badge bg-amber text-ink">{text.soilNotTested}</span>}{state.sampleDataActive&&<span className="data-badge bg-amber text-ink">{text.provenance.sample}</span>}</div><AlertsCard/><CropAdvisorCard/></>
    :<><section className="bento-card"><h2 className="text-xl font-bold">{text.stationNames.roadmap}</h2><div className="mt-4"><RoadmapList items={items} locale={state.locale}/></div></section>
      <details className="bento-card mt-4"><summary>{text.reportPreview}</summary><FarmReport/></details>
      <button type="button" className="button-primary mt-4 w-full" disabled={!state.hydrated||state.sampleDataActive} onClick={()=>{state.setSetupCompletedAt(indiaDate(state.now)??"2026-11-16");onFinish()}}>{text.finishSetup}</button>
      {state.sampleDataActive&&<p className="notice mt-3">{text.sampleReadOnly}</p>}</>;
  return <div className="pb-28 md:pb-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{text.setupJourney}</p><h1 className="mt-1 text-2xl font-bold">{stationLabel(state.locale,activeStation)}</h1></div><button type="button" onClick={onHome} className="button-secondary">{text.home}</button></div>
    <div className="grid items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden md:block"><nav aria-label={text.setupJourney} className="sticky top-4 rounded-2xl border border-forest/15 bg-white p-3"><ol className="space-y-2">{stations.map((station,index)=><li key={station.id}><button type="button" className={`flex min-h-12 w-full items-center gap-3 rounded-xl p-2 text-left ${activeStation===station.id?"bg-forest/10 ring-2 ring-forest":"hover:bg-daylight"}`} disabled={!stationAllowed(station.status)} aria-current={activeStation===station.id?"step":undefined} onClick={()=>select(station.id)}><StationIcon station={station.id} status={station.status}/><span className="min-w-0 flex-1"><span className="block font-semibold">{stationLabel(state.locale,station.id)}</span><span className="block text-xs text-stone-600">{index+1}. {stationStatusLabel(state.locale,station.status)}</span></span></button></li>)}</ol></nav></aside>
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3 md:hidden"><StationIcon station={activeStation} status={activeRecord.status}/><button type="button" className="min-h-12 flex-1 rounded-xl border border-forest/20 bg-white px-4 text-left font-semibold" aria-expanded={sheetOpen} aria-controls="station-sheet" onClick={()=>setSheetOpen(!sheetOpen)}>{text.step} {activeIndex+1} {text.of} 6 · {stationLabel(state.locale,activeStation)} <span className="float-right">{sheetOpen?"−":"+"}</span></button></div>
        {sheetOpen&&<div id="station-sheet" role="dialog" aria-modal="true" aria-label={text.setupJourney} className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 p-4 md:hidden"><div className="mx-auto max-w-md rounded-2xl bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{text.setupJourney}</h2><button type="button" className="button-secondary" onClick={()=>setSheetOpen(false)}>{state.locale==="mr"?"बंद":"Close"}</button></div><ol className="mt-3 space-y-2">{stations.map((station,index)=><li key={station.id}><button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-daylight" disabled={!stationAllowed(station.status)} onClick={()=>select(station.id)}><StationIcon station={station.id} status={station.status}/><span>{index+1}. {stationLabel(state.locale,station.id)} · {stationStatusLabel(state.locale,station.status)}</span></button></li>)}</ol></div></div>}
        <section aria-live="polite" className="min-w-0">{content}</section>
      </div>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-forest/15 bg-white p-3 shadow-lg md:hidden"><button type="button" className="button-secondary flex-1" disabled={!adjacentJourneyStation(stations,activeStation,-1)} onClick={()=>change(-1)}>{text.back}</button><button type="button" className="button-primary flex-1" disabled={!adjacentJourneyStation(stations,activeStation,1)} onClick={()=>change(1)}>{text.next}</button></div>
    <div className="mt-6 hidden justify-between md:flex"><button type="button" className="button-secondary" disabled={!adjacentJourneyStation(stations,activeStation,-1)} onClick={()=>change(-1)}>{text.back}</button><button type="button" className="button-primary" disabled={!adjacentJourneyStation(stations,activeStation,1)} onClick={()=>change(1)}>{text.next}</button></div>
  </div>;
}
