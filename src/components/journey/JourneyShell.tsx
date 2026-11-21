"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JourneyStationId, JourneyStationStatus } from "@/lib/domain/journey";
import { adjacentJourneyStation, deriveJourney } from "@/lib/domain/journey";
import { useBalramStore } from "@/store/useBalramStore";
import { t, stationLabel, stationStatusLabel } from "@/config/i18n";
import { MapClient } from "@/components/map/MapClient";
import { WeatherCard } from "@/components/dashboard/WeatherCard";
import { SoilCard } from "@/components/dashboard/SoilCard";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { AlertsCard } from "@/components/dashboard/AlertsCard";
import { FarmReport } from "@/components/report/FarmReport";
import { StationIcon } from "@/components/ui/StationIcon";
import { RoadmapList } from "./RoadmapList";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { indiaDate } from "@/lib/ui/format";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";

// AppShell owns the single global WeatherStation auto-fetch mount; this shell only renders the card.

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
  const sheetRef = useRef<HTMLDialogElement>(null);
  const sheetTrigger = useRef<HTMLButtonElement>(null);
  const desktopStations = useRef<HTMLElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeMobileSheet = () => {
      if (desktop.matches && sheetRef.current?.open) sheetRef.current.close();
    };
    desktop.addEventListener("change", closeMobileSheet);
    return () => desktop.removeEventListener("change", closeMobileSheet);
  }, []);
  const activeIndex=order.indexOf(activeStation),activeRecord=stations.find(item=>item.id===activeStation)!;
  const forecastAge=state.weatherSnapshot&&state.now!==null?Math.max(0,Math.floor((state.now-Date.parse(state.weatherSnapshot.fetchedAt))/60_000)):null;
  const items=farmRoadmap(state);
  const previous = adjacentJourneyStation(stations, activeStation, -1);
  const next = adjacentJourneyStation(stations, activeStation, 1);
  const nextHint = next ? null
    : activeStation === "roadmap" ? (state.sampleDataActive ? text.sampleReadOnly : text.finishToContinue)
    : !state.fieldGeometry ? text.addFieldToContinue
    : state.cropAllocations.length === 0 ? text.addPlotToContinue
    : text.reviewPlotsToContinue;

  const select = (id: JourneyStationId) => {
    setActiveStation(id);
    if (sheetRef.current?.open) sheetRef.current.close();
  };

  const restoreStationFocus = () => {
    if (sheetTrigger.current?.getClientRects().length) {
      sheetTrigger.current.focus();
    } else {
      desktopStations.current?.querySelector<HTMLButtonElement>('[aria-current="step"]')?.focus();
    }
  };

  const content=activeStation==="land"?<><p className="notice mb-4">{state.locale==="mr"?"तुम्ही ऑफलाइन असतानाही जमीन एकर किंवा गुंठ्यांमध्ये नोंदवू शकता.":"You can enter your land and Acres & Gunthas while offline."}</p><div className="isolate"><MapClient/></div></>
    :activeStation==="weather"?<><p className="mb-4 text-sm">{text.weatherAuto}</p>{state.weatherStatus.state==="loading"&&<p role="status" className="notice mb-3">{text.weatherLoading}</p>}{(state.weatherStatus.state==="error"||(state.connection==="offline"&&!state.weatherSnapshot))&&<p role="status" className="notice mb-3">{state.weatherSnapshot?(state.locale==="mr"?"ताजा अंदाज मिळाला नाही; जतन केलेला अंदाज उपलब्ध आहे.":"Live refresh failed; the saved weather snapshot remains available."):text.weatherError}</p>}{state.connection==="offline"&&state.weatherSnapshot&&<div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky/30 bg-sky/10 p-3 text-sm"><span>{state.locale==="mr"?"ऑफलाइन · जतन केलेला अंदाज":"Offline · saved forecast"}</span><ProvenanceBadge provenance="forecast" locale={state.locale}/><span>{state.locale==="mr"?"वय":"Age"}: {forecastAge===null?state.weatherSnapshot.fetchedAt:forecastAge<60?(state.locale==="mr"?`${forecastAge} मिनिटांपूर्वी`:`${forecastAge} min ago`):(state.locale==="mr"?`${Math.floor(forecastAge/60)} तासांपूर्वी`:`${Math.floor(forecastAge/60)} hr ago`)}</span></div>}<WeatherCard/></>
    :activeStation==="soil"?<><SoilCard/>{state.soilSkipped&&<p className="notice mt-4">{text.soilNotTested}</p>}</>
    :activeStation==="crops"?<PortfolioCard/>
    :activeStation==="advice"?<><div className="mb-4 flex flex-wrap gap-2">{state.soilSkipped&&!state.soilKitReading&&<span className="data-badge bg-amber text-ink">{text.soilNotTested}</span>}{state.sampleDataActive&&<span className="data-badge bg-amber text-ink">{text.provenance.sample}</span>}</div><AlertsCard/></>
    :<><section className="bento-card"><h2 className="text-xl font-bold">{text.stationNames.roadmap}</h2><div className="mt-4"><RoadmapList items={items} locale={state.locale}/></div></section>
      <details className="bento-card mt-4"><summary>{text.reportPreview}</summary><FarmReport/></details>
      <button type="button" className="button-primary mt-4 w-full" disabled={!state.hydrated||state.sampleDataActive} onClick={()=>{state.setSetupCompletedAt(indiaDate(state.now)??"2026-11-16");onFinish()}}>{text.finishSetup}</button>
      {state.sampleDataActive&&<p className="notice mt-3">{text.sampleReadOnly}</p>}</>;
  return <div className="pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{text.setupJourney}</p><h1 className="mt-1 text-2xl font-bold">{stationLabel(state.locale,activeStation)}</h1></div><button type="button" onClick={onHome} className="button-secondary">{text.home}</button></div>
    <div className="grid items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden md:block"><nav ref={desktopStations} aria-label={text.setupJourney} className="sticky top-4 rounded-2xl border border-forest/15 bg-white p-3"><ol className="space-y-2">{stations.map((station,index)=><li key={station.id}><button type="button" className={`flex min-h-12 w-full items-center gap-3 rounded-xl p-2 text-left ${activeStation===station.id?"bg-forest/10 ring-2 ring-forest":"hover:bg-daylight"}`} disabled={!stationAllowed(station.status)} aria-current={activeStation===station.id?"step":undefined} onClick={()=>select(station.id)}><StationIcon station={station.id} status={station.status}/><span className="min-w-0 flex-1"><span className="block font-semibold">{stationLabel(state.locale,station.id)}</span><span className="block text-xs text-stone-600">{index+1}. {stationStatusLabel(state.locale,station.status)}</span></span></button></li>)}</ol></nav></aside>
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <StationIcon station={activeStation} status={activeRecord.status} />
          <button ref={sheetTrigger} type="button" aria-haspopup="dialog" aria-controls="station-sheet"
            className="flex min-h-12 flex-1 items-center justify-between gap-2 rounded-xl border border-border-strong bg-white px-4 text-left font-semibold"
            onClick={() => sheetRef.current?.showModal()}>
            <span>{text.step} {activeIndex + 1} {text.of} {order.length} · {stationLabel(state.locale, activeStation)}</span>
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <dialog ref={sheetRef} id="station-sheet" aria-labelledby="station-sheet-title" onClose={restoreStationFocus}
          className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-ink shadow-sheet print:hidden">
          <div className="flex items-center justify-between gap-3">
            <h2 id="station-sheet-title" className="text-lg font-bold">{text.setupJourney}</h2>
            <button type="button" autoFocus className="button-secondary" onClick={() => sheetRef.current?.close()}>{text.close}</button>
          </div>
          <ol className="mt-3 space-y-2">
            {stations.map((station, index) => (
              <li key={station.id}>
                <button type="button" className="flex min-h-12 w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-daylight"
                  disabled={!stationAllowed(station.status)} aria-current={activeStation === station.id ? "step" : undefined}
                  onClick={() => select(station.id)}>
                  <StationIcon station={station.id} status={station.status} />
                  <span>{index + 1}. {stationLabel(state.locale, station.id)} · {stationStatusLabel(state.locale, station.status)}</span>
                </button>
              </li>
            ))}
          </ol>
        </dialog>
        <section aria-live="polite" className="min-w-0 max-md:[&_:focus]:scroll-mb-[calc(2rem+env(safe-area-inset-bottom))]">{content}</section>
      </div>
    </div>
    <div data-mobile-nav className="fixed inset-x-0 bottom-0 z-bottom-bar border-t border-forest/15 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg print:hidden md:static md:mt-6 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      {nextHint && <p id="journey-next-hint" className="mb-2 text-center text-sm text-muted-foreground md:text-right">{nextHint}</p>}
      <div className="flex justify-between gap-3">
        <button type="button" className="button-secondary flex-1 md:flex-none" disabled={!previous}
          onClick={() => previous && select(previous)}>{text.back}</button>
        <button type="button" className="button-primary flex-1 md:flex-none" disabled={!next}
          aria-describedby={nextHint ? "journey-next-hint" : undefined}
          onClick={() => next && select(next)}>{text.next}</button>
      </div>
    </div>
  </div>;
}
