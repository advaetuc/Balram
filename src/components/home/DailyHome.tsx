"use client";

import { useState, type KeyboardEvent } from "react";
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
import { CheckInCard } from "@/components/home/CheckInCard";
import { BackupControls } from "@/components/home/BackupControls";

const homeTabs = ["today", "farm", "water", "report"] as const;
const farmTabs = ["land", "crops", "soil", "data"] as const;
type HomeTab = typeof homeTabs[number];
type FarmTab = typeof farmTabs[number];

function TabList<T extends string>({ id, label, tabs, labels, selected, onSelect, fixed = false }: {
  id: string;
  label: string;
  tabs: readonly T[];
  labels: Record<T, string>;
  selected: T;
  onSelect: (tab: T) => void;
  fixed?: boolean;
}) {
  const selectWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let target: number;
    switch (event.key) {
      case "ArrowLeft": target = index === 0 ? last : index - 1; break;
      case "ArrowRight": target = index === last ? 0 : index + 1; break;
      case "Home": target = 0; break;
      case "End": target = last; break;
      default: return;
    }
    event.preventDefault();
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
    onSelect(tabs[target]);
  };

  return (
    <div role="tablist" aria-label={label} data-mobile-nav={fixed || undefined}
      className={`grid grid-cols-4 gap-2 bg-white print:hidden ${fixed
        ? "fixed inset-x-0 bottom-0 z-bottom-bar border-t border-[color-mix(in_srgb,var(--color-border-strong)_40%,transparent)] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:static md:mb-5 md:rounded-2xl md:border md:p-2"
        : "mb-5 rounded-2xl border border-forest/15 p-2"}`}>
      {tabs.map((tab, index) => (
        <button type="button" role="tab" key={tab} id={`${id}-tab-${tab}`} aria-controls={`${id}-panel-${tab}`}
          aria-selected={selected === tab} tabIndex={selected === tab ? 0 : -1}
          onKeyDown={(event) => selectWithKeyboard(event, index)} onClick={() => onSelect(tab)}
          className={`min-h-12 min-w-12 rounded-xl px-1 text-sm font-semibold focus-visible:outline-offset-0 sm:px-3 ${selected === tab ? "bg-forest text-white" : "text-ink hover:bg-daylight"}`}>
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

export function DailyHome({ onSetup }: { onSetup: () => void }) {
  const state=useBalramStore(s=>s),text=t(state.locale),[tab,setTab]=useState<HomeTab>("today");
  const [farmTab, setFarmTab] = useState<FarmTab>("land");
  const mr=state.locale==="mr",items=farmRoadmap(state),thisWeek=items.filter(item=>item.bucket==="this_week");
  const advisory=generateFieldVoiceAdvisories({allocations:state.cropAllocations,soilKitReading:state.soilKitReading,weatherSnapshot:state.weatherSnapshot,nowMs:state.now})[0];
  const irrigationItems=items.filter(item=>item.kind==="irrigation");
  return <div className="pb-24 max-md:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6 print:pb-0">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-forest">{mr?"माझे शेत":"My Farm"}</p><h1 className="mt-1 text-3xl font-bold">{state.farmProfile?.name??(mr?"आजचे नियोजन":"Today’s plan")}</h1></div></div>
    <TabList id="home" label={text.dailyNavigation} tabs={homeTabs} labels={text.dailyTabs} selected={tab} onSelect={setTab} fixed />
    {homeTabs.map((key) => (
      <section key={key} id={`home-panel-${key}`} role="tabpanel" aria-labelledby={`home-tab-${key}`}
        hidden={tab !== key} className="min-w-0 max-md:[&_:focus]:scroll-mb-[env(safe-area-inset-bottom)]">
      {tab===key&&key==="today"&&<div className="space-y-5">
        {!state.sampleDataActive&&state.cropAllocations.length>0&&<CheckInCard/>}
        {state.soilSkipped&&!state.soilKitReading&&<p className="notice">{text.soilNotTested}</p>}
        {advisory&&<article className="bento-card border-l-4 border-l-amber"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{advisory.headline[state.locale]}</h2>{state.sampleDataActive&&<ProvenanceBadge provenance="sample" locale={state.locale}/>}</div><p className="mt-2 leading-6">{advisory.message[state.locale]}</p><p className="mt-2 font-semibold">{advisory.actionLabel[state.locale]}</p><details className="mt-2"><summary>{text.whyAdvice}</summary><p className="rounded-lg bg-daylight p-3 text-sm">{advisory.reason[state.locale]}</p></details></article>}
        <section className="bento-card"><h2 className="text-xl font-bold">{text.todayWater}</h2>{irrigationItems.length?<ul className="mt-3 space-y-3">{irrigationItems.map(item=><li key={item.id} className="rounded-xl border border-forest/15 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><b>{item.title[state.locale]}</b><ProvenanceBadge provenance={item.provenance} locale={state.locale}/></div><p className="mt-1 text-sm">{item.detail[state.locale]}</p></li>)}</ul>:<p className="mt-2 text-sm">{mr?"पाण्याचा अंदाज पाहण्यासाठी जमीन व पीक प्लॉट जोडा.":"Add field land and crop plots to see a water estimate."}</p>}</section>
        <section className="bento-card"><h2 className="text-xl font-bold">{text.nextActions}</h2><div className="mt-3"><RoadmapList items={thisWeek} locale={state.locale}/></div></section>
      </div>}
      {tab===key&&key==="farm" && <>
        <TabList id="farm" label={text.myFarm} tabs={farmTabs} labels={text.farmTabs} selected={farmTab} onSelect={setFarmTab} />
        {farmTabs.map((section) => (
          <div key={section} id={`farm-panel-${section}`} role="tabpanel" aria-labelledby={`farm-tab-${section}`}
            hidden={section !== farmTab} className="space-y-5">
            {section === farmTab && section === "land" && <div className="isolate"><MapClient /></div>}
            {section === farmTab && section === "crops" && <PortfolioCard />}
            {section === farmTab && section === "soil" && <SoilCard />}
            {section === farmTab && section === "data" && <>
              <BackupControls />
              <button type="button" className="button-secondary w-full print:hidden" onClick={onSetup}>{text.editSetup}</button>
            </>}
          </div>
        ))}
      </>}
      {tab===key&&key==="water"&&<IrrigationPanel/>}
      {tab===key&&key==="report"&&<FarmReport/>}
      </section>
    ))}
  </div>;
}
