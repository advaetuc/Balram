"use client";

import { useState, type KeyboardEvent } from "react";
import { useBalramStore } from "@/store/useBalramStore";
import { generateFieldVoiceAdvisories } from "@/lib/domain/fieldVoice";
import { farmRoadmap } from "@/lib/ui/farmRoadmap";
import { MapClient } from "@/components/map/MapClient";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { SoilCard } from "@/components/dashboard/SoilCard";
import { IrrigationPanel } from "@/components/irrigation/IrrigationPanel";
import { WaterRibbon } from "@/components/irrigation/WaterRibbon";
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
    <div data-mobile-nav={fixed || undefined} className={fixed
      ? "fixed inset-x-0 bottom-0 z-bottom-bar border-t border-[color-mix(in_srgb,var(--color-border-strong)_40%,transparent)] bg-white px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] print:hidden md:static md:mb-5 md:rounded-2xl md:border md:p-2"
      : "mb-5"}>
      <div role="tablist" aria-label={label} data-active={tabs.indexOf(selected)}
        className={`seg rounded-2xl bg-white print:hidden ${fixed ? "md:rounded-xl" : "border border-forest/15"}`}>
        {tabs.map((tab, index) => (
          <button type="button" role="tab" key={tab} id={`${id}-tab-${tab}`} aria-controls={`${id}-panel-${tab}`}
            aria-selected={selected === tab} tabIndex={selected === tab ? 0 : -1}
            onKeyDown={(event) => selectWithKeyboard(event, index)} onClick={() => onSelect(tab)}
            className="min-h-12 min-w-0 break-words rounded-lg px-1 text-center text-sm font-semibold leading-body sm:px-3">
            {labels[tab]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DailyHome({ onSetup }: { onSetup: () => void }) {
  const state=useBalramStore(s=>s),text=t(state.locale);
  const [homeNav,setHomeNav]=useState<{tab:HomeTab;dir:"fwd"|"back"|"none"}>({tab:"today",dir:"none"});
  const [farmNav,setFarmNav]=useState<{tab:FarmTab;dir:"fwd"|"back"|"none"}>({tab:"land",dir:"none"});
  const tab=homeNav.tab,farmTab=farmNav.tab;
  const selectHomeTab=(next:HomeTab)=>{
    const previousIndex=homeTabs.indexOf(homeNav.tab),nextIndex=homeTabs.indexOf(next);
    setHomeNav({tab:next,dir:nextIndex>previousIndex?"fwd":nextIndex<previousIndex?"back":"none"});
  };
  const selectFarmTab=(next:FarmTab)=>{
    const previousIndex=farmTabs.indexOf(farmNav.tab),nextIndex=farmTabs.indexOf(next);
    setFarmNav({tab:next,dir:nextIndex>previousIndex?"fwd":nextIndex<previousIndex?"back":"none"});
  };
  const mr=state.locale==="mr",items=farmRoadmap(state),thisWeek=items.filter(item=>item.bucket==="this_week");
  const advisory=generateFieldVoiceAdvisories({allocations:state.cropAllocations,soilKitReading:state.soilKitReading,weatherSnapshot:state.weatherSnapshot,nowMs:state.now})[0];
  const irrigationItems=items.filter(item=>item.kind==="irrigation");
  return <div className="pb-24 max-md:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6 print:pb-0">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden"><div><p className="text-sm leading-body font-bold uppercase tracking-widest text-forest">{mr?"माझे शेत":"My Farm"}</p><h1 className="mt-1 text-3xl leading-heading font-bold">{state.farmProfile?.name??(mr?"आजचे नियोजन":"Today’s plan")}</h1></div></div>
    <TabList id="home" label={text.dailyNavigation} tabs={homeTabs} labels={text.dailyTabs} selected={tab} onSelect={selectHomeTab} fixed />
    {homeTabs.map((key) => (
      <section key={key} id={`home-panel-${key}`} role="tabpanel" aria-labelledby={`home-tab-${key}`}
        hidden={tab !== key} data-dir={tab === key ? homeNav.dir : undefined}
        className={`min-w-0 max-md:[&_:focus]:scroll-mb-[env(safe-area-inset-bottom)] ${tab === key ? "panel-tab" : ""}`}>
      {tab===key&&key==="today"&&<div className="space-y-5">
        {!state.sampleDataActive&&state.cropAllocations.length>0&&<CheckInCard/>}
        {state.soilSkipped&&!state.soilKitReading&&<p className="notice">{text.soilNotTested}</p>}
        {advisory&&<article className="bento-card border-l-4 border-l-amber"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{advisory.headline[state.locale]}</h2>{state.sampleDataActive&&<ProvenanceBadge provenance="sample" locale={state.locale}/>}</div><p className="mt-2 leading-6">{advisory.message[state.locale]}</p><p className="mt-2 font-semibold">{advisory.actionLabel[state.locale]}</p><details className="mt-2"><summary>{text.whyAdvice}</summary><p className="rounded-lg bg-daylight p-3 text-sm">{advisory.reason[state.locale]}</p></details></article>}
        <section className="bento-card"><h2 className="text-xl font-bold">{text.todayWater}</h2><WaterRibbon compact />{irrigationItems.length?<ul className="mt-3 space-y-3">{irrigationItems.map(item=><li key={item.id} className="rounded-xl border border-forest/15 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><b>{item.title[state.locale]}</b><ProvenanceBadge provenance={item.provenance} locale={state.locale}/></div><p className="mt-1 text-sm">{item.detail[state.locale]}</p></li>)}</ul>:<p className="mt-2 text-sm">{mr?"पाण्याचा अंदाज पाहण्यासाठी जमीन व पीक प्लॉट जोडा.":"Add field land and crop plots to see a water estimate."}</p>}</section>
        <section className="bento-card"><h2 className="text-xl font-bold">{text.nextActions}</h2><div className="mt-3"><RoadmapList items={thisWeek} locale={state.locale}/></div></section>
      </div>}
      {tab===key&&key==="farm" && <>
        <TabList id="farm" label={text.myFarm} tabs={farmTabs} labels={text.farmTabs} selected={farmTab} onSelect={selectFarmTab} />
        {farmTabs.map((section) => (
          <div key={section} id={`farm-panel-${section}`} role="tabpanel" aria-labelledby={`farm-tab-${section}`}
            hidden={section !== farmTab} data-dir={section === farmTab ? farmNav.dir : undefined}
            className={`space-y-5 ${section === farmTab ? section === "land" ? "panel-fade" : "panel-tab" : ""}`}>
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
